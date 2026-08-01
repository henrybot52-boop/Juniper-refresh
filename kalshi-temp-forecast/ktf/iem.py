"""Iowa Environmental Mesonet (IEM) data clients.

Three sources, all free and keyless:

1. CLI daily climate report  (``json/cli.py``)
   The parsed NWS CLI product — this is the *settlement source* for the daily
   high. Returns one record per day with ``high`` in °F.

2. ASOS daily summary  (``cgi-bin/request/daily.py``)
   A secondary daily high straight from the ASOS. Useful as a cross-check when a
   CLI product is missing, but note it is the METAR-derived max and can differ
   from the CLI continuous-sensor max by 1-2 °F.

3. MOS archive  (``cgi-bin/request/mos.py``)
   Historical MOS guidance (NBM = model ``NBS`` col ``txn``; GFS = model ``GFS``
   col ``n_x``). The max/min temperature column is populated at the 00Z valid
   time (daytime max) and 12Z valid time (overnight min).
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from datetime import date, datetime

import pandas as pd

from .http import HttpClient

log = logging.getLogger("ktf.iem")

IEM_ROOT = "https://mesonet.agron.iastate.edu"


def _to_float(x) -> float | None:
    """IEM uses 'M', '', 'None' for missing; ints/floats otherwise."""
    if x is None:
        return None
    s = str(x).strip()
    if s in ("", "M", "None", "NA", "T"):  # 'T' = trace (precip); N/A for temps
        return None
    try:
        return float(s)
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# 1. CLI daily climate highs (settlement source)
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class CliDay:
    date: date
    high_f: float | None
    low_f: float | None


class IemCliClient:
    def __init__(self, http: HttpClient, station_id: str) -> None:
        self.http = http
        self.station_id = station_id

    def year(self, year: int) -> list[CliDay]:
        url = f"{IEM_ROOT}/json/cli.py"
        data = self.http.get_json(url, params={"station": self.station_id, "year": year})
        out: list[CliDay] = []
        for row in data.get("results", []):
            try:
                d = datetime.strptime(row["valid"], "%Y-%m-%d").date()
            except (KeyError, ValueError):
                continue
            out.append(CliDay(date=d, high_f=_to_float(row.get("high")),
                              low_f=_to_float(row.get("low"))))
        return out

    def range_years(self, start_year: int, end_year: int) -> pd.DataFrame:
        """CLI highs for [start_year, end_year] inclusive, as a DataFrame."""
        rows: list[CliDay] = []
        for y in range(start_year, end_year + 1):
            try:
                rows.extend(self.year(y))
            except Exception as exc:  # never let one bad year kill the download
                log.warning("CLI year %d failed: %s", y, exc)
        df = pd.DataFrame([{"date": r.date, "cli_high_f": r.high_f, "cli_low_f": r.low_f}
                           for r in rows])
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"])
            df = df.dropna(subset=["cli_high_f"]).drop_duplicates("date").sort_values("date")
        return df.reset_index(drop=True)


# --------------------------------------------------------------------------- #
# 2. ASOS daily summary (secondary daily high)
# --------------------------------------------------------------------------- #
class IemAsosClient:
    def __init__(self, http: HttpClient, network: str, station: str) -> None:
        self.http = http
        self.network = network
        self.station = station

    def daily_highs(self, start: date, end: date) -> pd.DataFrame:
        url = f"{IEM_ROOT}/cgi-bin/request/daily.py"
        params = {
            "network": self.network,
            "stations": self.station,
            "year1": start.year, "month1": start.month, "day1": start.day,
            "year2": end.year, "month2": end.month, "day2": end.day,
            "var": "max_temp_f,min_temp_f",
            "format": "comma",
            "na": "blank",
        }
        text = self.http.get_text(url, params=params)
        df = pd.read_csv(io.StringIO(text))
        if df.empty:
            return pd.DataFrame(columns=["date", "asos_high_f", "asos_low_f"])
        df = df.rename(columns={"day": "date", "max_temp_f": "asos_high_f",
                                "min_temp_f": "asos_low_f"})
        df["date"] = pd.to_datetime(df["date"])
        return df[["date", "asos_high_f", "asos_low_f"]].sort_values("date").reset_index(drop=True)


# --------------------------------------------------------------------------- #
# 3. MOS archive (historical forecast guidance)
# --------------------------------------------------------------------------- #
class IemMosClient:
    def __init__(self, http: HttpClient, station_id: str) -> None:
        self.http = http
        self.station_id = station_id

    def fetch_raw(self, iem_model: str, start: date, end: date) -> pd.DataFrame:
        """Raw MOS CSV rows for one model over [start, end)."""
        url = f"{IEM_ROOT}/cgi-bin/request/mos.py"
        params = {
            "station": self.station_id,
            "model": iem_model,
            "sts": f"{start.isoformat()}T00:00Z",
            "ets": f"{end.isoformat()}T00:00Z",
            "format": "csv",
        }
        text = self.http.get_text(url, params=params)
        reader = csv.DictReader(io.StringIO(text))
        return pd.DataFrame(list(reader))
