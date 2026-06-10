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
| **Project Plan** | Single-project weekly control sheet. Rows are items (Top Task + Employee/Vendor by default — adjustable), columns are weeks. Each cell shows the **actual** charged that week next to an editable **forecast** cell (hours for people, cost for subs/expenses). Red cells flag weekly overruns. Summary columns give actuals to date, plan to date, variance, plan to go, EAC in hours and dollars (using a burdened rate derived from actuals, overridable per person), and overrun vs your saved **original forecast**. Click an item to see every charge behind it. Paste hour blocks straight from Excel. |
| **Settings** | Period source (Period Name vs GL/Transaction Date month), currency, decimals, what counts as "billed". |

## Forecast methods (all adjustable)

- **Average of last N periods** — classic run-rate.
- **Weighted average** — recent months count more.
- **Linear trend** — least-squares fit projected forward (catches ramp-up / ramp-down).
- **Repeat last period**.
- A **monthly adjust %** compounds on top of any method (e.g. `-5` ramps spend down 5% per month).
- Option to exclude the latest period from burn-rate calcs since a weekly extract usually contains a partial month.
- Every dimension can be filtered (multi-select with search) before forecasting.

## Project Plan workflow (hours per employee per week)

1. Open the **Project Plan** tab and pick a project. Set the week-ending day
   (default Friday) and how many weeks ahead you want to plan.
2. Enter forecast hours per person per week — type, tab through, or paste a
   block straight from an Excel staffing plan. Use *Copy actual hours into past
   plan cells* to seed history.
3. Click **Save current plan as original forecast**. That snapshot becomes the
   baseline: from then on the tool shows overrun vs original per item (hours
   and dollars) while you keep revising the current forecast each week.
4. Each week, upload the new extract — actuals fill in, red cells show where
   someone burned more than forecast, and the chart compares actual vs current
   forecast vs original.
5. Rates: EAC cost uses each person's burdened rate derived from their actuals
   (total cost ÷ hours, so fringe and oncost are included); override any rate
   in the Rate column. Sub/expense items are planned in dollars instead of hours.

Plans and baselines are saved per project *and* per row-level, so a Top
Task + Employee plan and an Employee-only plan can coexist.

### Rate table, revenue and project totals

- The **rate table** (below the grid) lists every employee on the project with
  their derived burdened cost rate, an overridable **cost rate**, and a
  **bill rate (price to owner)**, plus margin per hour. Add people who haven't
  charged yet, and use *Set bill = cost × N* to fill empty bill rates from a
  multiplier. Rates are stored per project and shared across row levels.
- **Add plan row** above the grid creates rows for tasks/people with no
  charges yet (marked with a yellow *plan* pill, removable with ✕) — so a full
  baseline job plan can be built before the first timesheet hits.
- The **Project totals** card shows Labor hours, Cost, **Revenue** and
  **Margin** ($ and %) side by side for the *original baseline*, the *current
  forecast (EAC)* and *actuals to date*, with an EAC-vs-baseline variance
  column. Revenue = hours × bill rate; subs/expenses are billed at cost plus
  the adjustable non-labor markup %.

## Persistence

Column mapping, filters, forecast configuration and budgets are stored in the
browser's localStorage, so next week you just upload the new extract and
everything is already set up. Use **Export settings / Import settings** in the
header to back up the configuration or move it to another machine. Transaction
data itself is never stored.

## Sample data (try it in 30 seconds)

`sample-data/oracle-extract-sample.xlsx` (and the same data as `.csv`) is a
realistic mock of the weekly extract: 946 transactions, 6 projects, 13 periods
(JUN-25 → JUN-26, where JUN-26 is partial as if the extract ran on 10-Jun),
with the exact 35 Oracle column headings. Upload it and everything auto-maps.
It was generated by `sample-data/generate-sample-data.js` (run with
`node generate-sample-data.js` after `npm install xlsx` to regenerate).

Each project tells a different forecasting story:

| Project | Story | Burn ≈/mo | Suggested demo budget |
|---|---|---|---|
| 700123 Lakeview WTP Phase 2 Design | Steady labor-heavy | $71k | 1,500,000 → ~8 mo runway |
| 700248 SR-417 Widening PD&E Study | Ramping **up** (try Linear trend vs Average) | $88k | 1,200,000 → burning hot, ~100% used soon |
| 700301 Coastal Bridge Inspection Program | Ramping **down** | $46k | 1,100,000 → comfortable |
| 700415 Downtown Stormwater Master Plan | Small steady, near budget exhaustion | $37k | 600,000 → ~1.4 mo runway, depletion imminent |
| 700502 Airport APM Guideway Rehab | Subs-heavy, lumpy invoices (try longer look-back) | $89k | 1,800,000 |
| 700610 Regional Trail Feasibility Study | Started 4 months ago, ramping fast | $46k | 450,000 |

It also includes the messy bits a real extract has: negative cost-transfer
rows, non-billable rows (Bill Flag = N), and ~$865k unbilled in the recent
months so the unbilled KPI has something to show.

**Suggested demo walk-through**

1. Upload the sample file → mapping shows 35/35 auto-detected → Apply.
2. Dashboard: note the partial Jun-26 bar and the unbilled KPI.
3. Forecast tab: level = Project, method = *Average of last N*, look-back 3,
   horizon 6 → Run. Type the suggested budgets into the Budget/EAC column and
   watch % used, runway and depletion appear (700415 goes red).
4. Switch method to *Linear trend* and compare 700248 (ramping up) — the
   forecast rises instead of staying flat. Pick it in the chart dropdown.
5. Filter Project Manager = "Jordan Arafat" and re-run to forecast one PM's
   portfolio only.

## Notes

- Excel parsing (SheetJS) and charts (Chart.js) load from a CDN, so the first
  open needs internet access. CSV upload and all tables work offline.
- Numbers like `(1,234.56)` and `$1,234` are handled. Period names like
  `JAN-26`, `Jan-2026`, `2026-01` are all understood; otherwise the GL Date
  month is used.
