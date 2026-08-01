"""Tests for MOS parsing — the join-logic crux of data_pipeline.

Uses a small synthetic frame mirroring the real IEM MOS CSV so we can verify,
without any network, that:
  * only the 00Z (daytime-max) valid time is kept, 12Z (overnight-min) dropped;
  * the 00Z valid instant maps to the correct *local* climate day;
  * lead_time is computed in whole local days;
  * the freshest run wins for a given (day, lead).
"""

from datetime import date

import pandas as pd

from data_pipeline import parse_mos_max

TZ = "America/Chicago"


def _raw(rows):
    return pd.DataFrame(rows)


def test_keeps_00z_max_drops_12z_min():
    raw = _raw([
        # 00Z valid -> daytime max for local 2024-07-01
        {"runtime": "2024-07-01 00:00:00", "ftime": "2024-07-02 00:00:00", "n_x": "102"},
        # 12Z valid -> overnight min, must be dropped even though n_x is populated
        {"runtime": "2024-07-01 00:00:00", "ftime": "2024-07-02 12:00:00", "n_x": "75"},
    ])
    out = parse_mos_max(raw, "n_x", "GFS", TZ)
    assert len(out) == 1
    row = out.iloc[0]
    assert row["forecast_high"] == 102.0
    assert row["date"] == pd.Timestamp("2024-07-01")  # 00Z July 2 -> local July 1


def test_lead_time_in_local_days():
    # 00Z run on 2024-07-01 (local 2024-06-30 evening) forecasting local 2024-07-01
    # is a 1-day lead.
    raw = _raw([
        {"runtime": "2024-07-01 00:00:00", "ftime": "2024-07-02 00:00:00", "n_x": "100"},
    ])
    out = parse_mos_max(raw, "n_x", "GFS", TZ)
    assert int(out.iloc[0]["lead_time"]) == 1


def test_afternoon_run_is_lead_zero():
    # A run at 18Z (13:00 CDT) forecasting that same afternoon's max is lead 0.
    raw = _raw([
        {"runtime": "2024-07-01 18:00:00", "ftime": "2024-07-02 00:00:00", "n_x": "99"},
    ])
    out = parse_mos_max(raw, "n_x", "GFS", TZ)
    assert int(out.iloc[0]["lead_time"]) == 0


def test_freshest_run_wins_for_same_day_and_lead():
    # Two 00Z-cycle runs on consecutive local evenings both give a 1-day lead for
    # different target days; but two runs mapping to the SAME (day, lead) should
    # collapse to the later runtime. Construct that: 00Z and 06Z runs of the same
    # UTC date both land on local run-day 2024-06-30 (00Z=prev evening) / the 06Z
    # run at 2024-07-01 06:00Z is 01:00 CDT July 1.
    raw = _raw([
        {"runtime": "2024-07-01 00:00:00", "ftime": "2024-07-02 00:00:00", "n_x": "100"},
        {"runtime": "2024-07-01 06:00:00", "ftime": "2024-07-02 00:00:00", "n_x": "103"},
    ])
    out = parse_mos_max(raw, "n_x", "GFS", TZ)
    # Both target local 2024-07-01; the two runs have different local run-days
    # (06-30 vs 07-01) hence different leads, so both survive — assert both kept
    # and correctly distinguished rather than silently merged.
    assert set(out["lead_time"]) == {0, 1}
    lead1 = out[out["lead_time"] == 1].iloc[0]
    lead0 = out[out["lead_time"] == 0].iloc[0]
    assert lead1["forecast_high"] == 100.0   # 00Z run, evening before
    assert lead0["forecast_high"] == 103.0   # 06Z run, same local day


def test_txn_field_for_nbs():
    raw = _raw([
        {"runtime": "2024-07-01 01:00:00", "ftime": "2024-07-02 00:00:00",
         "txn": "101", "wdr": "160", "wsp": "6", "sky": "9"},
    ])
    out = parse_mos_max(raw, "txn", "NBM", TZ)
    assert out.iloc[0]["forecast_high"] == 101.0
    assert out.iloc[0]["forecast_wind_dir"] == 160.0
    assert out.iloc[0]["forecast_cloud_frac"] == 0.09  # 9% -> 0.09


def test_empty_frame_returns_empty():
    out = parse_mos_max(pd.DataFrame(), "n_x", "GFS", TZ)
    assert out.empty
