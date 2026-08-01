"""api.weather.gov observation client (live intraday data).

We pull the recent observation stream for the station and expose each ob as a
small typed record in °F, plus the METAR 6-hour-max field when present.

Why the 6-hour max matters
---------------------------
The CLI report Kalshi settles on comes from the station's *continuous* max-temp
sensor, which can read 1-2 °F above the hourly METAR spot temperature. METARs at
the synoptic hours (roughly 00/06/12/18 UTC) carry a 6-hour maximum group that is
produced by that same continuous sensor. api.weather.gov decodes it into the
``maxTemperatureLast6Hours`` property, so when it is present it is a better proxy
for settlement than the spot temperature. We track both.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .http import HttpClient
from .units import c_to_f, kmh_to_mph

API_ROOT = "https://api.weather.gov"


def _val(node: dict | None):
    """Extract ``value`` from an api.weather.gov quantity node, if present."""
    if not node:
        return None
    return node.get("value")


@dataclass(frozen=True)
class Observation:
    timestamp: datetime          # tz-aware UTC
    temp_f: float | None         # spot temperature
    max6_f: float | None         # 6-hour max group (continuous sensor), if present
    wind_dir_deg: float | None
    wind_speed_mph: float | None
    sky: str | None              # textDescription, e.g. "Clear", "Mostly Cloudy"
    cloud_cover_frac: float | None  # 0..1 derived from the highest cloud layer amount
    raw_metar: str | None

    @property
    def settlement_proxy_f(self) -> float | None:
        """Best single estimate of the settlement sensor reading for this ob:
        the 6-hour max when available, else the spot temperature."""
        if self.max6_f is not None:
            return self.max6_f
        return self.temp_f


# METAR sky-cover code -> approximate cloud-cover fraction (oktas midpoint / 8).
_SKY_FRACTION = {
    "CLR": 0.0, "SKC": 0.0, "NCD": 0.0, "NSC": 0.0,
    "FEW": 0.19, "SCT": 0.44, "BKN": 0.75, "OVC": 1.0, "VV": 1.0,
}


def _cloud_fraction(cloud_layers: list[dict] | None) -> float | None:
    if not cloud_layers:
        return None
    frac = None
    for layer in cloud_layers:
        amt = (layer or {}).get("amount")
        if amt in _SKY_FRACTION:
            f = _SKY_FRACTION[amt]
            frac = f if frac is None else max(frac, f)
    return frac


def _parse_feature(props: dict) -> Observation:
    ts = datetime.fromisoformat(props["timestamp"])
    return Observation(
        timestamp=ts,
        temp_f=c_to_f(_val(props.get("temperature"))),
        max6_f=c_to_f(_val(props.get("maxTemperatureLast6Hours"))),
        wind_dir_deg=_val(props.get("windDirection")),
        wind_speed_mph=kmh_to_mph(_val(props.get("windSpeed"))),
        sky=props.get("textDescription") or None,
        cloud_cover_frac=_cloud_fraction(props.get("cloudLayers")),
        raw_metar=props.get("rawMessage") or None,
    )


class NwsClient:
    def __init__(self, http: HttpClient, station_id: str) -> None:
        self.http = http
        self.station_id = station_id

    def latest(self) -> Observation:
        """Most recent observation for the station."""
        url = f"{API_ROOT}/stations/{self.station_id}/observations/latest"
        data = self.http.get_json(url)
        return _parse_feature(data["properties"])

    def recent(self, limit: int = 24) -> list[Observation]:
        """The last ``limit`` observations, oldest-first.

        Used to seed the running max at watcher startup (so a restart mid-day does
        not lose the morning's readings) and to compute the recent trend.
        """
        url = f"{API_ROOT}/stations/{self.station_id}/observations"
        data = self.http.get_json(url, params={"limit": limit})
        obs = []
        for feat in data.get("features", []):
            props = feat.get("properties")
            if not props or not props.get("timestamp"):
                continue
            try:
                obs.append(_parse_feature(props))
            except (KeyError, ValueError):
                continue
        obs.sort(key=lambda o: o.timestamp)
        return obs
