# Oracle Project Forecasting Tool

A single-file web app for turning the weekly Oracle project cost extract into
forecasting information. No installation, no server, no IT request — everything
runs locally in your browser and **no data ever leaves your machine**.

## How to use

1. Download / save `oracle-project-forecast.html` anywhere (desktop, OneDrive, shared drive).
2. Double-click it to open in Edge or Chrome.
3. Click **Upload extract** and pick your weekly Oracle export (`.xlsx` or `.csv`).
4. The tool auto-detects the header row and auto-maps all standard columns
   (Business Unit → Comments). Fix anything it missed, then click
   **Apply mapping & load data**. The mapping is remembered for next week.

Click **Load sample data** in the header to try the tool without a real extract.

## What you get

| Tab | Purpose |
|-----|---------|
| **Dashboard** | KPIs (total cost, hours, labor, subs/expenses, unbilled, latest-period spend, 3-month average burn), cost-by-period chart with cumulative line, cost-mix breakdown, top-25 projects table. |
| **Pivot Explorer** | Group by any combination of the 30+ dimensions (project, task, PM, cost center, expenditure type, employee…), spread any metric across periods, or show all cost columns. Export to CSV. |
| **Forecast** | Pick a level (Project, Project + Top Task, PM, Cost Center, BU/Division, Expenditure Type), a method, look-back window, horizon and a monthly adjustment %. Enter a **Budget / EAC** per row to get remaining budget, % used, runway in months and a projected depletion period. Actuals-vs-forecast chart per group. Export to CSV. |
| **Settings** | Period source (Period Name vs GL/Transaction Date month), currency, decimals, what counts as "billed". |

## Forecast methods (all adjustable)

- **Average of last N periods** — classic run-rate.
- **Weighted average** — recent months count more.
- **Linear trend** — least-squares fit projected forward (catches ramp-up / ramp-down).
- **Repeat last period**.
- A **monthly adjust %** compounds on top of any method (e.g. `-5` ramps spend down 5% per month).
- Option to exclude the latest period from burn-rate calcs since a weekly extract usually contains a partial month.
- Every dimension can be filtered (multi-select with search) before forecasting.

## Persistence

Column mapping, filters, forecast configuration and budgets are stored in the
browser's localStorage, so next week you just upload the new extract and
everything is already set up. Use **Export settings / Import settings** in the
header to back up the configuration or move it to another machine. Transaction
data itself is never stored.

## Notes

- Excel parsing (SheetJS) and charts (Chart.js) load from a CDN, so the first
  open needs internet access. CSV upload and all tables work offline.
- Numbers like `(1,234.56)` and `$1,234` are handled. Period names like
  `JAN-26`, `Jan-2026`, `2026-01` are all understood; otherwise the GL Date
  month is used.
