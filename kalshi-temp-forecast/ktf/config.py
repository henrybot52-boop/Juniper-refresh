"""Configuration loading.

Uses the stdlib ``tomllib`` (Python 3.11+) so the project needs no YAML/TOML
third-party dependency. Everything city-specific lives in ``config.toml``.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.toml"


@dataclass(frozen=True)
class MosModel:
    """A MOS guidance model to pull from the IEM archive."""

    name: str          # friendly name, e.g. "NBM"
    iem_model: str     # code the IEM mos.py service expects, e.g. "NBS"
    max_field: str     # CSV column holding the max/min temp, e.g. "txn"


@dataclass(frozen=True)
class Config:
    # station
    station_id: str
    station_name: str
    timezone: str
    iem_asos_network: str
    iem_asos_station: str
    # markets
    thresholds_f: list[float]
    # watcher
    poll_interval_seconds: int
    settlement_sensor_offset_f: float
    peak_hour_local: int
    remaining_rise_sigma_f: float
    # history
    history_years: int
    mos_models: list[MosModel]
    # paths
    data_dir: str
    training_parquet: str
    calibration_csv: str
    # http
    user_agent: str
    max_retries: int
    backoff_base_seconds: float
    timeout_seconds: int
    # bookkeeping
    project_dir: Path = field(default=DEFAULT_CONFIG_PATH.parent)

    def path(self, relative: str) -> Path:
        """Resolve a config path relative to the project directory."""
        p = Path(relative)
        return p if p.is_absolute() else self.project_dir / p


def load_config(path: str | Path | None = None) -> Config:
    """Load and validate ``config.toml`` into a :class:`Config`."""
    cfg_path = Path(path) if path else DEFAULT_CONFIG_PATH
    with open(cfg_path, "rb") as fh:
        raw: dict[str, Any] = tomllib.load(fh)

    station = raw["station"]
    markets = raw["markets"]
    watcher = raw["watcher"]
    history = raw["history"]
    paths = raw["paths"]
    http = raw["http"]

    mos_models = [
        MosModel(name=m["name"], iem_model=m["iem_model"], max_field=m["max_field"])
        for m in history["mos_models"]
    ]

    return Config(
        station_id=station["id"],
        station_name=station.get("name", station["id"]),
        timezone=station["timezone"],
        iem_asos_network=station["iem_asos_network"],
        iem_asos_station=station["iem_asos_station"],
        thresholds_f=[float(t) for t in markets["thresholds_f"]],
        poll_interval_seconds=int(watcher["poll_interval_seconds"]),
        settlement_sensor_offset_f=float(watcher["settlement_sensor_offset_f"]),
        peak_hour_local=int(watcher["peak_hour_local"]),
        remaining_rise_sigma_f=float(watcher["remaining_rise_sigma_f"]),
        history_years=int(history["years"]),
        mos_models=mos_models,
        data_dir=paths["data_dir"],
        training_parquet=paths["training_parquet"],
        calibration_csv=paths["calibration_csv"],
        user_agent=http["user_agent"],
        max_retries=int(http["max_retries"]),
        backoff_base_seconds=float(http["backoff_base_seconds"]),
        timeout_seconds=int(http["timeout_seconds"]),
        project_dir=cfg_path.resolve().parent,
    )
