"""ktf — shared library for the Kalshi daily-temperature forecasting project.

Modules
-------
config       : load the TOML config into a typed object.
climate_day  : timezone / climate-day boundary logic (heavily tested).
http         : a requests.Session with retry + exponential backoff.
nws          : api.weather.gov observation client (live intraday data).
iem          : Iowa Environmental Mesonet clients (CLI highs + MOS archive).
probability  : forecast-error -> exceedance-probability helpers.
"""

__version__ = "0.1.0"
