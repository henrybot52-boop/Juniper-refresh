#!/usr/bin/env python3
"""obs_watcher.py — live intraday tracker for the daily high.

Polls api.weather.gov for the station's latest observations, maintains the
running daily max over the current **climate day** (local midnight to local
midnight), and prints a live estimate of P(daily high >= each threshold).

What it tracks each cycle
-------------------------
  * running spot max      — highest METAR spot temperature so far today
  * running 6-hour max    — highest METAR 6-hour-max group so far today; this
                            comes from the continuous sensor the CLI settles on
  * settlement running max — the number probabilities are based on:
        max(running 6-hour max, running spot max + settlement_sensor_offset)
    The offset accounts for the continuous sensor reading ~1-2 F above the spot
    temperature when no fresh 6-hour group is available.
  * latest temperature and the trend over the last hour
  * time remaining in the climate day
  * P(final high >= threshold) for each configured threshold, from the intraday
    remaining-rise model (ktf.probability.intraday_exceedance)

Robustness: every poll is wrapped so a transient API failure is logged and the
loop simply waits for the next cycle — the watcher never crashes.

Run:  python obs_watcher.py [--config config.toml] [--once]
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timezone

from ktf.climate_day import (
    climate_day,
    format_timedelta,
    local_hour_float,
    seconds_remaining_in_day,
    to_local,
)
from ktf.config import Config, load_config
from ktf.http import FetchError, HttpClient
from ktf.nws import NwsClient, Observation
from ktf.probability import IntradayParams, intraday_exceedance

log = logging.getLogger("obs_watcher")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def running_maxes(obs_today: list[Observation], offset_f: float) -> tuple[float | None, float | None, float | None]:
    """Return (spot_max, six_hour_max, settlement_max) for today's obs."""
    spot_vals = [o.temp_f for o in obs_today if o.temp_f is not None]
    six_vals = [o.max6_f for o in obs_today if o.max6_f is not None]
    spot_max = max(spot_vals) if spot_vals else None
    six_max = max(six_vals) if six_vals else None

    candidates = []
    if six_max is not None:
        candidates.append(six_max)
    if spot_max is not None:
        candidates.append(spot_max + offset_f)
    settlement = max(candidates) if candidates else None
    return spot_max, six_max, settlement


def hourly_trend(obs_today: list[Observation], now: datetime) -> float | None:
    """Approx temperature change over the last ~hour, in °F/hr."""
    recent = [o for o in obs_today if o.temp_f is not None]
    if len(recent) < 2:
        return None
    latest = recent[-1]
    # earliest ob within ~90 min of the latest
    window_start = latest.timestamp.timestamp() - 90 * 60
    prior = [o for o in recent if o.timestamp.timestamp() >= window_start]
    if len(prior) < 2:
        prior = recent[-2:]
    first, last = prior[0], prior[-1]
    dt_hr = (last.timestamp - first.timestamp).total_seconds() / 3600.0
    if dt_hr <= 0:
        return None
    return (last.temp_f - first.temp_f) / dt_hr


def poll_once(cfg: Config, nws: NwsClient, params: IntradayParams) -> None:
    now = _now_utc()
    today = climate_day(now, cfg.timezone)

    obs = nws.recent(limit=48)
    obs_today = [o for o in obs if climate_day(o.timestamp, cfg.timezone) == today]
    if not obs_today:
        log.warning("No observations yet for climate day %s.", today)
        return

    latest = obs_today[-1]
    spot_max, six_max, settlement = running_maxes(obs_today, cfg.settlement_sensor_offset_f)
    trend = hourly_trend(obs_today, now)
    lhour = local_hour_float(now, cfg.timezone)
    remaining = seconds_remaining_in_day(now, cfg.timezone)
    local_now = to_local(now, cfg.timezone)

    # --- report -------------------------------------------------------------
    print("\n" + "=" * 66)
    print(f"{cfg.station_name}  |  climate day {today}  "
          f"({cfg.timezone}, now {local_now:%H:%M})")
    print("-" * 66)
    latest_local = to_local(latest.timestamp, cfg.timezone)
    print(f"latest ob {latest_local:%H:%M}: {_fmt(latest.temp_f)}F"
          f"  ({latest.sky or '—'}, "
          f"wind {_fmt(latest.wind_dir_deg,0)}@{_fmt(latest.wind_speed_mph,0)}mph)")
    print(f"running spot max     : {_fmt(spot_max)}F")
    print(f"running 6-hour max   : {_fmt(six_max)}F"
          + ("" if six_max is not None else "  (none reported yet today)"))
    print(f"settlement est. max  : {_fmt(settlement)}F"
          f"  (spot+{cfg.settlement_sensor_offset_f:g} vs 6h, whichever higher)")
    print(f"trend (last ~hr)     : {_fmt(trend, 1)}F/hr")
    print(f"time left in day     : {format_timedelta(remaining)}")

    if settlement is None:
        print("no usable temperature yet — skipping probabilities")
        return

    print("-" * 66)
    print("P(final daily high >= threshold):")
    for t in cfg.thresholds_f:
        p = intraday_exceedance(settlement, t, lhour, trend, params)
        bar = "#" * int(round(p * 30))
        already = "  <-- already reached" if t <= settlement else ""
        print(f"   >= {t:>5.0f}F : {p*100:5.1f}%  |{bar:<30}|{already}")


def _fmt(x, digits: int = 1) -> str:
    if x is None:
        return "  n/a"
    return f"{x:.{digits}f}"


def build_params(cfg: Config) -> IntradayParams:
    return IntradayParams(
        peak_hour_local=cfg.peak_hour_local,
        base_sigma_f=cfg.remaining_rise_sigma_f,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default=None)
    ap.add_argument("--once", action="store_true", help="Poll once and exit")
    args = ap.parse_args()

    cfg = load_config(args.config)
    http = HttpClient(cfg.user_agent, cfg.max_retries,
                      cfg.backoff_base_seconds, cfg.timeout_seconds)
    nws = NwsClient(http, cfg.station_id)
    params = build_params(cfg)

    log.info("Watching %s (%s). Polling every %ds. Ctrl-C to stop.",
             cfg.station_id, cfg.station_name, cfg.poll_interval_seconds)

    while True:
        try:
            poll_once(cfg, nws, params)
        except FetchError as exc:
            log.error("Fetch failed this cycle (will retry next poll): %s", exc)
        except Exception as exc:  # never crash the watcher
            log.exception("Unexpected error this cycle (continuing): %s", exc)
        if args.once:
            break
        try:
            time.sleep(cfg.poll_interval_seconds)
        except KeyboardInterrupt:
            log.info("Stopped.")
            break


if __name__ == "__main__":
    main()
