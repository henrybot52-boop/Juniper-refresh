"""Tests for the probability estimators."""

import numpy as np
import pytest

from ktf.probability import (
    CONTINUITY,
    ErrorStats,
    IntradayParams,
    brier_score,
    exceedance_prob_empirical,
    exceedance_prob_normal,
    intraday_exceedance,
    reliability_table,
    remaining_rise_estimate,
)


# --------------------------------------------------------------------------- #
# day-ahead estimators
# --------------------------------------------------------------------------- #
def test_normal_exceedance_monotonic_in_threshold():
    ps = [exceedance_prob_normal(100, t, bias=0.0, sigma=3.0)
          for t in (95, 98, 100, 102, 105)]
    assert ps == sorted(ps, reverse=True)  # higher threshold -> lower prob
    assert all(0.0 <= p <= 1.0 for p in ps)


def test_normal_exceedance_bias_shifts_up():
    # A cold bias (+2) means actuals run warmer -> higher exceedance prob.
    cold = exceedance_prob_normal(100, 102, bias=2.0, sigma=3.0)
    unbiased = exceedance_prob_normal(100, 102, bias=0.0, sigma=3.0)
    assert cold > unbiased


def test_normal_continuity_correction_applied():
    # forecast 100, bias 0, tiny sigma: threshold exactly 100 should be ~certain
    # because P(high>=100)=P(high>99.5) and the point mass sits at 100.
    p = exceedance_prob_normal(100, 100, bias=0.0, sigma=0.5)
    assert p > 0.8


def test_empirical_exceedance_fraction():
    errors = np.array([-2, -1, 0, 1, 2], dtype=float)
    # forecast 100, threshold 100 -> needed = 99.5-100 = -0.5 -> errors >= -0.5:
    # {0,1,2} -> 3/5 = 0.6
    p = exceedance_prob_empirical(100, 100, errors)
    assert p == pytest.approx(0.6)


def test_empirical_empty_is_nan():
    assert np.isnan(exceedance_prob_empirical(100, 100, np.array([])))


def test_error_stats_bias_sign():
    # actual - forecast all positive -> model runs cold, bias positive.
    st = ErrorStats.from_errors(np.array([1.0, 2.0, 3.0]))
    assert st.n == 3
    assert st.bias == pytest.approx(2.0)
    assert st.mae == pytest.approx(2.0)
    assert st.sigma == pytest.approx(1.0)


# --------------------------------------------------------------------------- #
# reliability
# --------------------------------------------------------------------------- #
def test_reliability_perfectly_calibrated():
    rng = np.random.default_rng(0)
    p = rng.uniform(0, 1, size=20000)
    outcomes = (rng.uniform(0, 1, size=20000) < p).astype(float)
    table = reliability_table(p, outcomes, n_bins=10)
    for row in table:
        assert abs(row["mean_predicted"] - row["observed_freq"]) < 0.05


def test_brier_bounds():
    p = np.array([0.0, 1.0, 0.5])
    o = np.array([0.0, 1.0, 1.0])
    assert brier_score(p, o) == pytest.approx((0 + 0 + 0.25) / 3)


# --------------------------------------------------------------------------- #
# intraday model
# --------------------------------------------------------------------------- #
PARAMS = IntradayParams(peak_hour_local=16, base_sigma_f=4.0)


def test_intraday_already_reached_is_certain():
    # threshold at or below running max -> probability 1.
    assert intraday_exceedance(101, 100, local_hour=13, recent_trend_f_per_hr=1,
                               params=PARAMS) == 1.0


def test_intraday_after_peak_locks_in():
    # Late evening, running max 99, threshold 100: little chance of more rise.
    p = intraday_exceedance(99, 100, local_hour=22, recent_trend_f_per_hr=0.0,
                            params=PARAMS)
    assert p < 0.2


def test_intraday_morning_more_uncertain_than_evening():
    # Same gap to threshold, but earlier in the day -> higher chance of getting there.
    morning = intraday_exceedance(95, 100, local_hour=9, recent_trend_f_per_hr=3.0,
                                  params=PARAMS)
    evening = intraday_exceedance(95, 100, local_hour=20, recent_trend_f_per_hr=0.0,
                                  params=PARAMS)
    assert morning > evening


def test_remaining_rise_shrinks_toward_peak():
    early_mean, early_sd = remaining_rise_estimate(8, 2.0, PARAMS)
    late_mean, late_sd = remaining_rise_estimate(15, 2.0, PARAMS)
    assert early_mean > late_mean
    assert early_sd > late_sd


def test_remaining_rise_zero_past_peak():
    mean, sd = remaining_rise_estimate(18, 3.0, PARAMS)
    assert mean == pytest.approx(0.0)
    # Past the peak the residual sd decays below the peak-hour floor.
    assert 0.0 < sd < PARAMS.min_sigma_f


def test_remaining_rise_sigma_keeps_decaying_after_peak():
    _, sd_18 = remaining_rise_estimate(18, 0.0, PARAMS)
    _, sd_22 = remaining_rise_estimate(22, 0.0, PARAMS)
    assert sd_22 < sd_18  # later in the evening -> more locked in
    assert sd_22 >= PARAMS.floor_sigma_f
