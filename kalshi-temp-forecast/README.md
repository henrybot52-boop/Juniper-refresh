# Kalshi daily-high-temperature forecasting — Camp Mabry (KATT)

Probabilistic forecasting of the **daily high temperature** at NWS station
**Camp Mabry, Austin TX (KATT)**, built to inform trading of Kalshi daily
temperature markets.

The markets settle on the NWS **CLI daily climate report**, which uses the
station's *continuous* max-temperature sensor — this can read **1–2 °F above**
the hourly METAR spot temperature. Everything here targets that CLI high and
produces **exceedance probabilities** — `P(daily_high ≥ threshold)` — not point
forecasts.

> ⚠️ Forecast and calibration only. There is **no Kalshi API integration and no
> trading logic** here, by design.

---

## Modules

| Module | What it does |
| --- | --- |
| `obs_watcher.py` | Live intraday tracker. Polls api.weather.gov, maintains the running daily max over the local climate day, and prints `P(final high ≥ threshold)` for each configured threshold. |
| `data_pipeline.py` | Builds the historical training set: 5 yr of CLI highs + NBM/GFS MOS guidance from the Iowa Environmental Mesonet (IEM), joined into one parquet. |
| `backtest.py` | Calibration analysis: forecast bias / MAE by model·lead·season, and a reliability table (“when we say 70%, does it verify 70% of the time?”). |

Shared library lives in `ktf/`. The timezone / climate-day boundary logic —
the part that would silently poison everything if it were off by a day — is
isolated in `ktf/climate_day.py` and covered by `tests/test_climate_day.py`.

---

## Install

```bash
cd kalshi-temp-forecast
python3.11 -m venv .venv && source .venv/bin/activate   # optional
pip install -r requirements.txt
```

Requires **Python 3.11+** (uses stdlib `tomllib` and `zoneinfo`). Dependencies
are intentionally minimal: `pandas`, `requests`, `pyarrow`, `numpy`. No GRIB
processing.

Set a real contact string in `config.toml` under `[http] user_agent` —
api.weather.gov asks callers to identify themselves.

---

## Configuration — `config.toml`

Everything city-specific is here, so you can point the same code at other Kalshi
cities (KNYC, KMDW, …) by editing one file. Key fields:

```toml
[station]
id = "KATT"                 # NWS/ASOS/IEM station id
timezone = "America/Chicago"# defines the climate day (local midnight→midnight)
iem_asos_network = "TX_ASOS"
iem_asos_station = "ATT"

[markets]
thresholds_f = [95, 98, 100, 101, 102, 103, 105]   # strikes you care about

[watcher]
poll_interval_seconds = 420
settlement_sensor_offset_f = 1.0   # spot → continuous-sensor adjustment
peak_hour_local = 16               # when the high typically peaks
remaining_rise_sigma_f = 4.0       # start-of-day uncertainty of remaining rise

[history]
years = 5
# MOS models to pull; max_field is the CSV column holding the daytime-max temp
[[history.mos_models]]
name = "NBM"; iem_model = "NBS"; max_field = "txn"
[[history.mos_models]]
name = "GFS"; iem_model = "GFS"; max_field = "n_x"
```

To retarget another city: change `[station]`, the ASOS network/id, and the
thresholds. The MOS model list usually stays the same.

---

## 1. `obs_watcher.py` — live intraday tracker

```bash
python obs_watcher.py            # loop, polling every poll_interval_seconds
python obs_watcher.py --once     # single snapshot then exit
```

Each cycle prints:

```
Camp Mabry, Austin TX  |  climate day 2026-07-31  (America/Chicago, now 20:51)
------------------------------------------------------------------
latest ob 19:51: 93.9F  (—, wind 200@5mph)
running spot max     : 99.0F        # highest METAR spot temp today
running 6-hour max   :   n/aF       # highest METAR 6-hour-max group today
settlement est. max  : 100.0F       # max(6h-max, spot + offset) — what probs use
trend (last ~hr)     : -2.2F/hr
time left in day     : 3h 08m
------------------------------------------------------------------
P(final daily high >= threshold):
   >=   100F : 100.0%  ...  <-- already reached
   >=   101F :   0.0%  ...
```

**What the numbers mean**
- **running spot max** — highest hourly METAR temperature seen this climate day.
- **running 6-hour max** — highest 6-hour-max group (reported near 00/06/12/18Z);
  it comes from the same continuous sensor the CLI settles on, so it's the better
  proxy when present.
- **settlement est. max** — `max(running 6-hour max, running spot max + offset)`.
  The offset (`settlement_sensor_offset_f`) approximates the continuous sensor
  reading ~1–2 °F above the spot temperature. **Probabilities are based on this.**
- **P(final high ≥ threshold)** — from the intraday remaining-rise model: the
  final high is modelled as `running max + R`, where `R ≥ 0` is the additional
  warming still to come. Its mean is the recent warming trend carried forward to
  `peak_hour_local` (decelerating), and its spread shrinks toward zero after the
  peak. If the running max already clears a threshold, that row shows 100%.

> The intraday model is an **honest heuristic**, not a trained model. Its
> parameters are in `[watcher]`. It's meant to be sanity-checked against — and
> eventually replaced by — the error distributions from `backtest.py`. It never
> crashes on an API hiccup: a failed poll is logged and the loop waits for the
> next cycle.

## 2. `data_pipeline.py` — historical training data

```bash
python data_pipeline.py                 # uses history.years from config
python data_pipeline.py --years 5
```

Downloads and joins three IEM sources (all free, keyless):

1. **CLI daily highs** (`json/cli.py`) — the **settlement source** → `actual_cli_high`.
2. **ASOS daily highs** (`request/daily.py`) — a secondary METAR-derived cross-check → `asos_high`.
3. **MOS archive** (`request/mos.py`) — NBM (`NBS`, col `txn`) and GFS MOS
   (`GFS`, col `n_x`). The daytime max is the value at the **00Z valid time**;
   the 12Z value is the overnight min and is dropped.

Output: `data/training.parquet`, one row per **(date, model, lead_time)**:

| column | meaning |
| --- | --- |
| `date` | local climate day |
| `model` | `NBM` or `GFS` |
| `lead_time` | whole local days between the model run and the target day (0 = same-day afternoon run) |
| `forecast_high` | the model's forecast daytime max (°F) |
| `actual_cli_high` | the CLI settlement high (°F) |
| `asos_high` | secondary ASOS high (°F) |
| `error` | `actual_cli_high − forecast_high` (**+ = model ran cold**) |
| `month`, `doy`, `season` | calendar features |
| `forecast_wind_dir`, `forecast_wind_speed`, `forecast_cloud_frac` | MOS features at the max valid time |

**The climate-day join** is the delicate part. Every MOS valid time is in UTC;
the 00Z max is 6–7 pm *the previous local evening*, so it belongs to that
afternoon's climate day. `ktf/climate_day.py` does that mapping (DST-aware), and
`lead_time` is measured in local days. When several model cycles cover the same
(day, lead) the freshest run wins.

## 3. `backtest.py` — calibration analysis

```bash
python backtest.py               # reads data/training.parquet
```

Prints and saves:

- **Error stats** (`data/error_stats.csv`) — `bias`, `MAE`, `sigma` of the
  forecast error for every **model × lead × season** bucket. `bias > 0` ⇒ the
  model runs **cold** (actuals come in warmer than forecast).
- **Bias summary** — one line per model·lead in plain English. On the sample data
  GFS MOS runs **~2 °F hot** at KATT (the well-known MAV summer warm bias) while
  NBM is nearly unbiased.
- **Reliability table** (`data/calibration_table.csv`) — the headline
  sanity-check. Predicted probabilities (formed **leave-one-out** from each
  bucket's empirical error distribution, so the check is out-of-sample) are
  binned and compared to the observed frequency. Read each row as
  *“in this bin, `mean_predicted` should ≈ `observed_freq`.”* A `Brier score` is
  reported (lower is better; 0.25 = no skill).

Use it to answer: *does this model run hot or cold here, by how much, and when it
implies “70% chance of ≥ 100 °F”, does that actually verify ~70% of the time?*

---

## The probability method

Given a model forecast `F` and the empirical distribution of that model's errors
`e = actual − forecast` in a matching (model, lead, season) bucket:

```
P(actual ≥ T) = P(F + e ≥ T) = P(e ≥ T − F)
```

estimated either empirically (fraction of historical errors clearing the gap) or
with a normal fit (`bias`, `sigma`) for small buckets. A ½-degree continuity
correction is applied because the CLI high is an integer °F — it matters right at
the strike. See `ktf/probability.py`.

---

## Tests

```bash
python -m pytest -q
```

Coverage focuses on the load-bearing logic:
- `tests/test_climate_day.py` — midnight cutover, UTC→local mapping, **DST
  transition days** (23 h / 25 h), day bounds, fractions. Off-by-one here would
  corrupt everything.
- `tests/test_mos_parse.py` — 00Z-max-vs-12Z-min selection, local-day lead
  computation, freshest-run dedup (no network).
- `tests/test_probability.py` — monotonicity, bias shift, continuity correction,
  reliability, and the intraday remaining-rise behaviour.

---

## Caveats & next steps

- The **intraday model** is a documented heuristic; calibrate its parameters
  against `backtest.py` output for your station/season.
- Reliability bins for rare high thresholds can be thin — widen the history
  (`--years`) for firmer numbers.
- MOS archives occasionally have gaps; downloads are resilient (retry/backoff,
  per-source failures are skipped with a warning) but a sparse bucket is a sparse
  bucket.
- Not built yet (intentionally): Kalshi market mapping, position sizing, any
  trading logic.

## Data sources

- **api.weather.gov** — live observations (NWS/NOAA).
- **Iowa Environmental Mesonet (IEM)**, Iowa State University — CLI reports, ASOS
  daily summaries, and the MOS archive. Please be considerate with request
  volume.
