"""Timezone / climate-day boundary logic.

The NWS daily climate report (CLI) — which Kalshi settles on — covers a
**climate day**: local-midnight to local-midnight in the station's timezone.
Every observation timestamp from api.weather.gov and every MOS valid time from
IEM is in **UTC**. Mapping a UTC instant to the correct local climate day is the
single most dangerous piece of arithmetic in this project: an off-by-one on the
midnight cutover (worse, across a daylight-saving transition) silently corrupts
the running max and every historical join.

All of that logic is concentrated here and covered by ``tests/test_climate_day.py``.

Definitions
-----------
climate_day(instant, tz)
    The local calendar date whose local-midnight-to-local-midnight window
    contains ``instant``.
day_bounds(date, tz)
    The UTC-aware start (inclusive) and end (exclusive) instants of a climate day.
fraction_of_day_elapsed / remaining
    Where within the climate day a given instant falls, in [0, 1].
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def _as_aware_utc(instant: datetime) -> datetime:
    """Return ``instant`` as a timezone-aware UTC datetime.

    A naive datetime is *assumed* to already be UTC (that is what both
    api.weather.gov and the IEM MOS archive emit). An aware datetime is
    converted to UTC.
    """
    if instant.tzinfo is None:
        return instant.replace(tzinfo=timezone.utc)
    return instant.astimezone(timezone.utc)


def to_local(instant: datetime, tz: str) -> datetime:
    """Convert any instant to timezone-aware local time in ``tz``."""
    return _as_aware_utc(instant).astimezone(ZoneInfo(tz))


def climate_day(instant: datetime, tz: str) -> date:
    """The local climate date that ``instant`` belongs to.

    Examples (America/Chicago):
        2024-07-02T00:00Z  -> 2024-07-01  (19:00 CDT the previous evening)
        2024-07-02T05:00Z  -> 2024-07-02  (00:00 CDT — exactly local midnight)
        2024-07-02T04:59Z  -> 2024-07-01  (23:59 CDT the previous night)
    """
    return to_local(instant, tz).date()


def day_bounds(day: date, tz: str) -> tuple[datetime, datetime]:
    """UTC-aware [start, end) instants bounding the climate day ``day``.

    ``start`` is local midnight of ``day``; ``end`` is local midnight of the next
    day. Both are returned in UTC. Uses ``fold``-agnostic wall-clock midnights,
    which are unambiguous for America/Chicago (DST transitions happen at 02:00,
    never at midnight); for zones with a midnight transition this still returns a
    well-defined 24-ish-hour window.
    """
    zone = ZoneInfo(tz)
    local_start = datetime.combine(day, time(0, 0), tzinfo=zone)
    local_end = datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=zone)
    return local_start.astimezone(timezone.utc), local_end.astimezone(timezone.utc)


def day_length_seconds(day: date, tz: str) -> float:
    """Length of the climate day in seconds.

    Normally 86400, but 82800 (23 h) on spring-forward and 90000 (25 h) on
    fall-back days. Only relevant for zones whose DST changeover is near midnight;
    for America/Chicago every climate day is 86400 s, but we compute it honestly.
    """
    start, end = day_bounds(day, tz)
    return (end - start).total_seconds()


def fraction_of_day_elapsed(instant: datetime, tz: str) -> float:
    """Fraction in [0, 1] of the current climate day already elapsed at ``instant``."""
    inst = _as_aware_utc(instant)
    day = climate_day(inst, tz)
    start, end = day_bounds(day, tz)
    total = (end - start).total_seconds()
    elapsed = (inst - start).total_seconds()
    if total <= 0:
        return 0.0
    return min(1.0, max(0.0, elapsed / total))


def fraction_of_day_remaining(instant: datetime, tz: str) -> float:
    """Fraction in [0, 1] of the current climate day still remaining at ``instant``."""
    return 1.0 - fraction_of_day_elapsed(instant, tz)


def seconds_remaining_in_day(instant: datetime, tz: str) -> float:
    """Seconds from ``instant`` until the end (local midnight) of its climate day."""
    inst = _as_aware_utc(instant)
    day = climate_day(inst, tz)
    _, end = day_bounds(day, tz)
    return max(0.0, (end - inst).total_seconds())


def local_hour_float(instant: datetime, tz: str) -> float:
    """Local time-of-day of ``instant`` as a float hour in [0, 24)."""
    local = to_local(instant, tz)
    return local.hour + local.minute / 60.0 + local.second / 3600.0


def format_timedelta(seconds: float) -> str:
    """Human-friendly ``Hh Mm`` string for a non-negative duration."""
    seconds = max(0, int(seconds))
    hours, rem = divmod(seconds, 3600)
    minutes = rem // 60
    return f"{hours}h {minutes:02d}m"
