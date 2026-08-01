#!/usr/bin/env python3
"""backtest.py — calibration analysis of the historical forecasts.

Reads the training parquet from data_pipeline.py and reports:

  1. Error distributions by model x lead_time x season:
       bias  = mean(actual - forecast)   (+ => model runs COLD; actual warmer)
       mae   = mean|error|
       sigma = std(error)

  2. Bias summary in plain English (does NBM run hot/cold at this station?).

  3. Reliability of the derived probabilities. For every day, model, lead and
     threshold we form P(actual >= threshold) from the *empirical* error
     distribution of that model/lead/season bucket, computed **leave-one-out**
     (the day being scored is excluded), so the reliability check is honest.
     We then bin predictions and compare "when we said 70%, how often did it
     actually verify?".

Outputs
  * <data_dir>/error_stats.csv       — the bias/MAE/sigma table
  * <data_dir>/calibration_table.csv — the reliability (predicted vs observed) table
  * a printed summary

Run:  python backtest.py [--config config.toml]
"""

from __future__ import annotations

import argparse
import logging

import numpy as np
import pandas as pd

from ktf.config import Config, load_config
from ktf.probability import CONTINUITY, ErrorStats, brier_score, reliability_table

log = logging.getLogger("backtest")


# --------------------------------------------------------------------------- #
# 1. Error statistics
# --------------------------------------------------------------------------- #
def error_stats_table(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (model, lead, season), g in df.groupby(["model", "lead_time", "season"]):
        st = ErrorStats.from_errors(g["error"].to_numpy())
        rows.append({
            "model": model, "lead_time": int(lead), "season": season,
            "n": st.n, "bias": round(st.bias, 2),
            "mae": round(st.mae, 2), "sigma": round(st.sigma, 2),
        })
    out = pd.DataFrame(rows).sort_values(["model", "lead_time", "season"])
    return out.reset_index(drop=True)


def bias_summary(df: pd.DataFrame) -> list[str]:
    lines = []
    for (model, lead), g in df.groupby(["model", "lead_time"]):
        bias = g["error"].mean()
        mae = g["error"].abs().mean()
        direction = "COLD (forecasts too low)" if bias > 0 else "HOT (forecasts too high)"
        lines.append(
            f"{model:>4}  lead {int(lead)}d:  bias {bias:+.2f}F ({direction}),  "
            f"MAE {mae:.2f}F,  n={len(g)}"
        )
    return lines


# --------------------------------------------------------------------------- #
# 2. Leave-one-out empirical exceedance probabilities
# --------------------------------------------------------------------------- #
def loo_calibration(df: pd.DataFrame, thresholds: list[float]) -> pd.DataFrame:
    """One row per (day, model, lead, threshold) with the LOO predicted
    probability and the realised 0/1 outcome."""
    records = []
    # Bucket by model/lead/season; within a bucket the error sample is shared.
    for (model, lead, season), g in df.groupby(["model", "lead_time", "season"]):
        errors = g["error"].to_numpy(dtype=float)
        forecasts = g["forecast_high"].to_numpy(dtype=float)
        actuals = g["actual_cli_high"].to_numpy(dtype=float)
        n = len(g)
        if n < 3:
            continue
        for t in thresholds:
            needed = (t - CONTINUITY) - forecasts          # per-day rise required
            ge = errors[:, None] >= needed[None, :]        # (n_err, n_day) bool
            total_ge = ge.sum(axis=0).astype(float)        # count over full sample
            self_ge = (errors >= needed).astype(float)     # this day's own contribution
            pred = (total_ge - self_ge) / (n - 1)          # leave-one-out fraction
            outcome = (actuals >= t).astype(float)
            for i in range(n):
                records.append({
                    "model": model, "lead_time": int(lead), "season": season,
                    "threshold": t, "predicted": pred[i], "outcome": outcome[i],
                })
    return pd.DataFrame.from_records(records)


def calibration_summary(calib: pd.DataFrame, n_bins: int = 10) -> pd.DataFrame:
    """Overall reliability table (predicted-probability bin vs observed frequency)."""
    rows = reliability_table(calib["predicted"].to_numpy(),
                             calib["outcome"].to_numpy(), n_bins=n_bins)
    return pd.DataFrame(rows)


def calibration_by_model(calib: pd.DataFrame, n_bins: int = 5) -> pd.DataFrame:
    out = []
    for model, g in calib.groupby("model"):
        for r in reliability_table(g["predicted"].to_numpy(),
                                   g["outcome"].to_numpy(), n_bins=n_bins):
            r = {"model": model, **r}
            out.append(r)
    return pd.DataFrame(out)


# --------------------------------------------------------------------------- #
def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default=None)
    ap.add_argument("--bins", type=int, default=10, help="Reliability bins (overall)")
    args = ap.parse_args()

    cfg: Config = load_config(args.config)
    parquet = cfg.path(cfg.training_parquet)
    if not parquet.exists():
        raise SystemExit(f"Training parquet not found: {parquet}\nRun data_pipeline.py first.")

    df = pd.read_parquet(parquet)
    df = df.dropna(subset=["error", "forecast_high", "actual_cli_high"])
    log.info("Loaded %d forecast/actual pairs across %d models.",
             len(df), df["model"].nunique())

    # 1. Error stats -----------------------------------------------------------
    stats = error_stats_table(df)
    stats_path = cfg.path(cfg.calibration_csv).with_name("error_stats.csv")
    stats.to_csv(stats_path, index=False)

    print("\n" + "=" * 72)
    print("FORECAST ERROR BY MODEL x LEAD x SEASON  (bias +=cold, -=hot)")
    print("=" * 72)
    print(stats.to_string(index=False))

    print("\n" + "-" * 72)
    print("BIAS SUMMARY (by model x lead)")
    print("-" * 72)
    for line in bias_summary(df):
        print(line)

    # 2. Reliability -----------------------------------------------------------
    calib = loo_calibration(df, cfg.thresholds_f)
    overall = calibration_summary(calib, n_bins=args.bins)
    overall.to_csv(cfg.path(cfg.calibration_csv), index=False)

    print("\n" + "=" * 72)
    print("RELIABILITY — derived probability vs. observed frequency (leave-one-out)")
    print(f"Brier score: {brier_score(calib['predicted'].to_numpy(), calib['outcome'].to_numpy()):.4f}"
          "   (lower is better; 0.25 = no skill)")
    print("=" * 72)
    if overall.empty:
        print("Not enough data to build a reliability table.")
    else:
        show = overall.copy()
        show["mean_predicted"] = show["mean_predicted"].round(3)
        show["observed_freq"] = show["observed_freq"].round(3)
        print(show.to_string(index=False))
        print("\nRead this as: within each predicted-probability bin, "
              "'mean_predicted' should ~= 'observed_freq'.")

    by_model = calibration_by_model(calib, n_bins=5)
    if not by_model.empty:
        print("\n" + "-" * 72)
        print("RELIABILITY BY MODEL (5 bins)")
        print("-" * 72)
        bm = by_model.copy()
        bm["mean_predicted"] = bm["mean_predicted"].round(3)
        bm["observed_freq"] = bm["observed_freq"].round(3)
        print(bm.to_string(index=False))

    log.info("Wrote %s and %s", stats_path.name, cfg.path(cfg.calibration_csv).name)


if __name__ == "__main__":
    main()
