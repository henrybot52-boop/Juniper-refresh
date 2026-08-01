"""Tiny unit-conversion helpers. NWS reports Celsius / km·h⁻¹; markets are °F."""

from __future__ import annotations


def c_to_f(celsius: float | None) -> float | None:
    if celsius is None:
        return None
    return celsius * 9.0 / 5.0 + 32.0


def kmh_to_mph(kmh: float | None) -> float | None:
    if kmh is None:
        return None
    return kmh * 0.621371
