"""Forecast-error -> exceedance-probability helpers.

Two regimes:

* **Day-ahead / calibration** (used by data_pipeline + backtest): given a model
  forecast ``F`` for the day's high and the empirical distribution of that
  model's errors ``e = actual - forecast`` in a matching bucket, estimate
  ``P(actual_high >= threshold)``. We expose both a purely empirical estimator
  and a normal-fit estimator (robust for small buckets), plus reliability
  scoring.

* **Intraday** (used by obs_watcher): given the running max so far and the
  time-of-day, estimate ``P(final_high >= threshold)`` from a small
  remaining-rise model. This is an honest heuristic, not a trained model — it is
  clearly parameterised in config and is meant to be sanity-checked against, and
  eventually replaced by, the backtest-derived error distributions.

No scipy: the normal CDF is built from ``math.erf``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# Kalshi high-temp markets settle on an integer °F. ``P(high >= T)`` for integer
# T is therefore ``P(high > T - 0.5)`` — a half-degree continuity correction that
# matters right at the strike.
CONTINUITY = 0.5


def normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


# --------------------------------------------------------------------------- #
# Day-ahead estimators
# --------------------------------------------------------------------------- #
def exceedance_prob_normal(
    forecast: float, threshold: float, bias: float, sigma: float
) -> float:
    """P(actual >= threshold) modelling actual = forecast + bias + N(0, sigma).

    ``bias`` is the mean error (actual - forecast); positive means the model runs
    *cold* (actual comes in warmer than forecast).
    """
    if sigma <= 1e-9:
        # Degenerate: point mass at forecast + bias.
        return 1.0 if (forecast + bias) >= threshold else 0.0
    z = (threshold - CONTINUITY - (forecast + bias)) / sigma
    return float(min(1.0, max(0.0, 1.0 - normal_cdf(z))))


def exceedance_prob_empirical(
    forecast: float, threshold: float, errors: np.ndarray
) -> float:
    """P(actual >= threshold) as the empirical fraction of historical errors that
    would push ``forecast`` up to/over ``threshold``.

    P(actual >= T) = P(forecast + e >= T) = P(e >= T - forecast).
    Falls back to the normal estimator's shape if ``errors`` is empty.
    """
    errors = np.asarray(errors, dtype=float)
    errors = errors[~np.isnan(errors)]
    if errors.size == 0:
        return float("nan")
    needed = (threshold - CONTINUITY) - forecast
    return float(np.mean(errors >= needed))


@dataclass(frozen=True)
class ErrorStats:
    """Summary of a model's error distribution within one bucket."""

    n: int
    bias: float   # mean(actual - forecast); + => model runs cold
    mae: float
    sigma: float  # std of error

    @classmethod
    def from_errors(cls, errors: np.ndarray) -> "ErrorStats":
        errors = np.asarray(errors, dtype=float)
        errors = errors[~np.isnan(errors)]
        if errors.size == 0:
            return cls(n=0, bias=float("nan"), mae=float("nan"), sigma=float("nan"))
        return cls(
            n=int(errors.size),
            bias=float(np.mean(errors)),
            mae=float(np.mean(np.abs(errors))),
            sigma=float(np.std(errors, ddof=1)) if errors.size > 1 else 0.0,
        )


# --------------------------------------------------------------------------- #
# Reliability (calibration) scoring
# --------------------------------------------------------------------------- #
def reliability_table(
    predicted: np.ndarray, outcomes: np.ndarray, n_bins: int = 10
) -> "list[dict]":
    """Group predictions into probability bins and compare predicted vs observed.

    ``predicted`` are probabilities in [0, 1]; ``outcomes`` are 0/1 (did the
    threshold verify?). Returns one row per non-empty bin with the mean predicted
    probability, the observed frequency, and the count — the classic reliability
    diagram in table form.
    """
    predicted = np.asarray(predicted, dtype=float)
    outcomes = np.asarray(outcomes, dtype=float)
    mask = ~np.isnan(predicted) & ~np.isnan(outcomes)
    predicted, outcomes = predicted[mask], outcomes[mask]
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows = []
    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        in_bin = (predicted >= lo) & (predicted < hi if i < n_bins - 1 else predicted <= hi)
        if not in_bin.any():
            continue
        rows.append({
            "bin_lo": round(lo, 3),
            "bin_hi": round(hi, 3),
            "n": int(in_bin.sum()),
            "mean_predicted": float(predicted[in_bin].mean()),
            "observed_freq": float(outcomes[in_bin].mean()),
        })
    return rows


def brier_score(predicted: np.ndarray, outcomes: np.ndarray) -> float:
    predicted = np.asarray(predicted, dtype=float)
    outcomes = np.asarray(outcomes, dtype=float)
    mask = ~np.isnan(predicted) & ~np.isnan(outcomes)
    if not mask.any():
        return float("nan")
    return float(np.mean((predicted[mask] - outcomes[mask]) ** 2))


# --------------------------------------------------------------------------- #
# Intraday remaining-rise model (obs_watcher)
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class IntradayParams:
    peak_hour_local: float          # clock hour the high typically peaks
    base_sigma_f: float             # remaining-rise sd at day start
    # Fraction of the recent trend that carries forward, integrated to the peak.
    # Warming decelerates toward the peak, hence < 1.
    trend_carry: float = 0.5
    max_expected_rise_f: float = 14.0
    min_sigma_f: float = 0.5          # residual sd at the peak hour
    post_peak_tau_hr: float = 2.5     # how fast certainty firms up after the peak
    floor_sigma_f: float = 0.1        # never claim absolute certainty


def remaining_rise_estimate(
    local_hour: float,
    recent_trend_f_per_hr: float | None,
    params: IntradayParams,
) -> tuple[float, float]:
    """Estimate (mean, sd) of the *additional* rise still to come today.

    Heuristic:
      * mean rise = clamp(recent warming trend, >=0) carried forward to the peak,
        decelerating (``trend_carry``). Zero once we're at/past the peak hour.
      * sd shrinks from ``base_sigma`` toward ``min_sigma`` as we approach and pass
        the peak — after the peak, the day's high is essentially locked in.
    """
    hours_to_peak = max(0.0, params.peak_hour_local - local_hour)
    hours_past_peak = max(0.0, local_hour - params.peak_hour_local)

    trend = 0.0 if recent_trend_f_per_hr is None else max(0.0, recent_trend_f_per_hr)
    mean_rise = trend * hours_to_peak * params.trend_carry
    mean_rise = min(params.max_expected_rise_f, max(0.0, mean_rise))

    if hours_past_peak > 0.0:
        # After the peak the high is essentially set; certainty firms up as the
        # afternoon fades, decaying below the peak-hour floor.
        sigma = params.min_sigma_f * math.exp(-hours_past_peak / params.post_peak_tau_hr)
        sigma = max(params.floor_sigma_f, sigma)
    else:
        # Before the peak, uncertainty scales with how much of the pre-peak
        # window is still ahead of us, floored at the peak-hour residual.
        span = max(params.peak_hour_local, 1.0)
        remaining_window_frac = min(1.0, hours_to_peak / span)
        sigma = max(params.min_sigma_f, params.base_sigma_f * math.sqrt(remaining_window_frac))
    return mean_rise, sigma


def intraday_exceedance(
    running_max_f: float,
    threshold: float,
    local_hour: float,
    recent_trend_f_per_hr: float | None,
    params: IntradayParams,
) -> float:
    """P(final_high >= threshold) given the running max and time of day.

    final_high = running_max + R, R ~ Normal(mean_rise, sigma) truncated at 0.
    If the threshold is already met by the running max, probability is 1.
    """
    if threshold <= running_max_f:
        return 1.0
    mean_rise, sigma = remaining_rise_estimate(local_hour, recent_trend_f_per_hr, params)
    needed = (threshold - CONTINUITY) - running_max_f  # additional rise required
    if sigma <= 1e-9:
        return 1.0 if mean_rise >= needed else 0.0
    z = (needed - mean_rise) / sigma
    return float(min(1.0, max(0.0, 1.0 - normal_cdf(z))))
