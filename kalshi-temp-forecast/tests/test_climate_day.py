"""Tests for the climate-day / timezone boundary logic.

An off-by-one on the midnight cutover — especially across a daylight-saving
transition — would silently corrupt the running max and every historical join,
so this is the most important test file in the project.

Reference facts for America/Chicago in 2024:
  * CST = UTC-6, CDT = UTC-5.
  * Local midnight is 06:00 UTC in winter (CST) and 05:00 UTC in summer (CDT).
  * Spring forward: 2024-03-10 (that climate day is only 23 h long).
  * Fall back:      2024-11-03 (that climate day is 25 h long).
"""

from datetime import date, datetime, timezone

import pytest

from ktf.climate_day import (
    climate_day,
    day_bounds,
    day_length_seconds,
    fraction_of_day_elapsed,
    fraction_of_day_remaining,
    local_hour_float,
    seconds_remaining_in_day,
)

TZ = "America/Chicago"


def utc(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# climate_day mapping around the midnight cutover
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "instant,expected",
    [
        # The canonical MOS case: 00Z valid time is the *previous* local evening,
        # so it belongs to that afternoon's climate day.
        (utc(2024, 7, 2, 0, 0), date(2024, 7, 1)),
        # One minute before local midnight (summer, CDT = 05:00 UTC).
        (utc(2024, 7, 2, 4, 59), date(2024, 7, 1)),
        # Exactly local midnight -> the new day.
        (utc(2024, 7, 2, 5, 0), date(2024, 7, 2)),
        # Winter (CST = 06:00 UTC): just before and at local midnight.
        (utc(2024, 1, 2, 5, 59), date(2024, 1, 1)),
        (utc(2024, 1, 2, 6, 0), date(2024, 1, 2)),
        # Mid-afternoon summer.
        (utc(2024, 7, 1, 20, 0), date(2024, 7, 1)),
    ],
)
def test_climate_day_boundaries(instant, expected):
    assert climate_day(instant, TZ) == expected


def test_naive_datetime_assumed_utc():
    # api.weather.gov / IEM emit UTC; a naive datetime must be treated as UTC.
    naive = datetime(2024, 7, 2, 0, 0)
    assert climate_day(naive, TZ) == date(2024, 7, 1)


# --------------------------------------------------------------------------- #
# day_bounds
# --------------------------------------------------------------------------- #
def test_day_bounds_summer():
    start, end = day_bounds(date(2024, 7, 1), TZ)
    assert start == utc(2024, 7, 1, 5, 0)   # local midnight CDT
    assert end == utc(2024, 7, 2, 5, 0)
    assert (end - start).total_seconds() == 86400


def test_day_bounds_winter():
    start, end = day_bounds(date(2024, 1, 1), TZ)
    assert start == utc(2024, 1, 1, 6, 0)   # local midnight CST
    assert end == utc(2024, 1, 2, 6, 0)


def test_bounds_contain_their_own_instants():
    # Every instant inside [start, end) must map back to the same climate day.
    d = date(2024, 7, 1)
    start, end = day_bounds(d, TZ)
    assert climate_day(start, TZ) == d
    # one second before the end still belongs to d
    before_end = end.timestamp() - 1
    assert climate_day(datetime.fromtimestamp(before_end, tz=timezone.utc), TZ) == d
    # the end instant itself belongs to the next day
    assert climate_day(end, TZ) == date(2024, 7, 2)


# --------------------------------------------------------------------------- #
# DST transition days have non-24h lengths
# --------------------------------------------------------------------------- #
def test_spring_forward_is_23_hours():
    assert day_length_seconds(date(2024, 3, 10), TZ) == 23 * 3600


def test_fall_back_is_25_hours():
    assert day_length_seconds(date(2024, 11, 3), TZ) == 25 * 3600


def test_normal_day_is_24_hours():
    assert day_length_seconds(date(2024, 7, 1), TZ) == 24 * 3600


def test_climate_day_stable_across_spring_forward():
    # 08:00 UTC on the spring-forward day is 03:00 CDT — same climate day.
    assert climate_day(utc(2024, 3, 10, 8, 0), TZ) == date(2024, 3, 10)
    # 06:00 UTC is 00:00 CST -> start of the day.
    assert climate_day(utc(2024, 3, 10, 6, 0), TZ) == date(2024, 3, 10)


# --------------------------------------------------------------------------- #
# fractions / remaining
# --------------------------------------------------------------------------- #
def test_fraction_elapsed_midday():
    # Noon CDT = 17:00 UTC, halfway through a 24h day.
    inst = utc(2024, 7, 1, 17, 0)
    assert fraction_of_day_elapsed(inst, TZ) == pytest.approx(0.5, abs=1e-9)
    assert fraction_of_day_remaining(inst, TZ) == pytest.approx(0.5, abs=1e-9)


def test_fraction_bounds_clamped():
    start, end = day_bounds(date(2024, 7, 1), TZ)
    assert fraction_of_day_elapsed(start, TZ) == pytest.approx(0.0)
    just_before_end = datetime.fromtimestamp(end.timestamp() - 1, tz=timezone.utc)
    assert 0.99 < fraction_of_day_elapsed(just_before_end, TZ) <= 1.0


def test_seconds_remaining():
    inst = utc(2024, 7, 1, 17, 0)  # noon CDT
    assert seconds_remaining_in_day(inst, TZ) == pytest.approx(12 * 3600, abs=1)


def test_local_hour_float():
    inst = utc(2024, 7, 1, 20, 30)  # 15:30 CDT
    assert local_hour_float(inst, TZ) == pytest.approx(15.5, abs=1e-6)
