#!/usr/bin/env python3
"""data_pipeline.py — build the historical training dataset.

Downloads, for the configured station:

  * N years of CLI daily highs (the settlement source)          -> actual_cli_high
  * N years of ASOS daily highs (secondary cross-check)         -> asos_high
  * N years of MOS guidance (NBM = NBS, GFS = MAV) from the      -> forecast_high
    IEM archive, one forecast max per (model, target day, lead)

and joins them into one tidy parquet:

    date, model, lead_time, forecast_high, actual_cli_high, asos_high,
    error (= actual - forecast), month, doy, season,
    forecast_wind_dir, forecast_wind_speed, forecast_cloud_frac

Each MOS row's max-temperature field (``txn`` for NBS, ``n_x`` for GFS) is
populated at the 00Z valid time = the daytime max. We map that 00Z UTC valid
instant to its **local climate day** (see ktf.climate_day — 00Z is 6-7pm the
previous local evening, so it belongs to that afternoon's climate day) and take
``lead_time`` = whole local days between the model run and the target day. When
several model cycles cover the same (target day, lead) we keep the freshest run.

Run:  python data_pipeline.py [--config config.toml] [--years N]
"""

from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta

import pandas as pd

from ktf.climate_day import climate_day
from ktf.config import Config, load_config
from ktf.http import HttpClient
from ktf.iem import IemAsosClient, IemCliClient, IemMosClient, _to_float

log = logging.getLogger("data_pipeline")

# GFS MOS 'cld' categorical sky cover -> approximate fraction.
_CLD_FRACTION = {"CL": 0.0, "CLR": 0.0, "FW": 0.19, "FEW": 0.19, "SC": 0.44,
                 "SCT": 0.44, "BK": 0.75, "BKN": 0.75, "OV": 1.0, "OVC": 1.0}


def _season(month: int) -> str:
    return {12: "DJF", 1: "DJF", 2: "DJF",
            3: "MAM", 4: "MAM", 5: "MAM",
            6: "JJA", 7: "JJA", 8: "JJA",
            9: "SON", 10: "SON", 11: "SON"}[month]


def _cloud_frac(raw, model: str) -> float | None:
    """Normalise a MOS cloud field to a 0..1 fraction.

    NBS 'sky' is a numeric percent; GFS 'cld' is a category (CLR/SCT/BKN/OVC).
    """
    if raw is None or str(raw).strip() in ("", "M"):
        return None
    s = str(raw).strip().upper()
    if s in _CLD_FRACTION:
        return _CLD_FRACTION[s]
    v = _to_float(s)
    if v is None:
        return None
    return max(0.0, min(1.0, v / 100.0))


def parse_mos_max(
    raw: pd.DataFrame, max_field: str, model_name: str, tz: str
) -> pd.DataFrame:
    """Reduce a raw MOS CSV frame to one daytime-max forecast per (target day, lead).

    Keeps rows whose max field is populated at the 00Z (UTC) valid time, maps the
    valid time to its local climate day, computes the lead in whole local days,
    and — when multiple cycles cover the same (day, lead) — keeps the freshest run.
    """
    if raw.empty or max_field not in raw.columns:
        return pd.DataFrame(
            columns=["date", "model", "lead_time", "forecast_high",
                     "forecast_wind_dir", "forecast_wind_speed", "forecast_cloud_frac"]
        )

    df = raw.copy()
    df["runtime_utc"] = pd.to_datetime(df["runtime"], utc=True, errors="coerce")
    df["ftime_utc"] = pd.to_datetime(df["ftime"], utc=True, errors="coerce")
    df["max_val"] = df[max_field].map(_to_float)

    # Daytime max is the max-field value at the 00Z valid time. (12Z = overnight
    # min — dropped.) This single filter is what separates highs from lows.
    keep = df["max_val"].notna() & (df["ftime_utc"].dt.hour == 0)
    df = df[keep].copy()
    if df.empty:
        return pd.DataFrame(
            columns=["date", "model", "lead_time", "forecast_high",
                     "forecast_wind_dir", "forecast_wind_speed", "forecast_cloud_frac"]
        )

    # Map each valid instant to its local climate day, and each run to its local day.
    df["target_day"] = df["ftime_utc"].map(lambda ts: climate_day(ts.to_pydatetime(), tz))
    df["run_day"] = df["runtime_utc"].map(lambda ts: climate_day(ts.to_pydatetime(), tz))
    df["lead_time"] = (pd.to_datetime(df["target_day"]) - pd.to_datetime(df["run_day"])).dt.days
    df = df[df["lead_time"] >= 0]

    # Features carried at the max valid time.
    df["forecast_wind_dir"] = df.get("wdr", pd.Series(index=df.index)).map(_to_float)
    df["forecast_wind_speed"] = df.get("wsp", pd.Series(index=df.index)).map(_to_float)
    cloud_src = "cld" if "cld" in df.columns else ("sky" if "sky" in df.columns else None)
    if cloud_src:
        df["forecast_cloud_frac"] = df[cloud_src].map(lambda x: _cloud_frac(x, model_name))
    else:
        df["forecast_cloud_frac"] = pd.NA

    df["model"] = model_name
    df = df.rename(columns={"max_val": "forecast_high"})

    # Freshest cycle wins for each (target day, lead).
    df = df.sort_values("runtime_utc").drop_duplicates(
        subset=["model", "target_day", "lead_time"], keep="last"
    )
    df["date"] = pd.to_datetime(df["target_day"])
    return df[["date", "model", "lead_time", "forecast_high",
               "forecast_wind_dir", "forecast_wind_speed", "forecast_cloud_frac"]]


def build_dataset(cfg: Config, years: int) -> pd.DataFrame:
    http = HttpClient(cfg.user_agent, cfg.max_retries,
                      cfg.backoff_base_seconds, cfg.timeout_seconds)
    today = date.today()
    start = today - timedelta(days=365 * years + 7)

    # --- actuals: CLI settlement highs ---------------------------------------
    log.info("Downloading CLI daily highs %d-%d ...", start.year, today.year)
    cli = IemCliClient(http, cfg.station_id).range_years(start.year, today.year)
    if cli.empty:
        raise SystemExit("No CLI data returned — check station id / connectivity.")

    # --- secondary: ASOS daily highs -----------------------------------------
    log.info("Downloading ASOS daily highs ...")
    try:
        asos = IemAsosClient(http, cfg.iem_asos_network,
                             cfg.iem_asos_station).daily_highs(start, today)
    except Exception as exc:
        log.warning("ASOS download failed (continuing without it): %s", exc)
        asos = pd.DataFrame(columns=["date", "asos_high_f", "asos_low_f"])

    # --- forecasts: MOS guidance per model -----------------------------------
    mos = IemMosClient(http, cfg.station_id)
    frames = []
    for m in cfg.mos_models:
        log.info("Downloading MOS %s (%s) ...", m.name, m.iem_model)
        try:
            raw = mos.fetch_raw(m.iem_model, start, today)
        except Exception as exc:
            log.warning("MOS %s download failed (skipping): %s", m.name, exc)
            continue
        parsed = parse_mos_max(raw, m.max_field, m.name, cfg.timezone)
        log.info("  -> %d forecast rows", len(parsed))
        frames.append(parsed)

    if not frames:
        raise SystemExit("No MOS forecasts downloaded — cannot build training set.")
    fcst = pd.concat(frames, ignore_index=True)

    # --- join ----------------------------------------------------------------
    df = fcst.merge(cli[["date", "cli_high_f"]], on="date", how="inner")
    if not asos.empty:
        df = df.merge(asos[["date", "asos_high_f"]], on="date", how="left")
    else:
        df["asos_high_f"] = pd.NA

    df = df.rename(columns={"cli_high_f": "actual_cli_high", "asos_high_f": "asos_high"})
    df["error"] = df["actual_cli_high"] - df["forecast_high"]
    df["month"] = df["date"].dt.month
    df["doy"] = df["date"].dt.dayofyear
    df["season"] = df["month"].map(_season)

    cols = ["date", "model", "lead_time", "forecast_high", "actual_cli_high",
            "asos_high", "error", "month", "doy", "season",
            "forecast_wind_dir", "forecast_wind_speed", "forecast_cloud_frac"]
    df = df[cols].sort_values(["date", "model", "lead_time"]).reset_index(drop=True)
    return df


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default=None, help="Path to config.toml")
    ap.add_argument("--years", type=int, default=None, help="Override history years")
    args = ap.parse_args()

    cfg = load_config(args.config)
    years = args.years if args.years is not None else cfg.history_years

    df = build_dataset(cfg, years)
    out = cfg.path(cfg.training_parquet)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out, index=False)

    log.info("Wrote %d rows -> %s", len(df), out)
    log.info("Models: %s", ", ".join(sorted(df["model"].unique())))
    log.info("Lead times: %s", sorted(df["lead_time"].unique()))
    log.info("Date span: %s .. %s", df["date"].min().date(), df["date"].max().date())


if __name__ == "__main__":
    main()
