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
| **Project Forecast** | The **baseline job plan** as a task tree: each task row expands to the people beneath it, hours are entered per person per week, and the task row shows the live sum of its people (plus rolled-up cost/revenue/margin). Add people per task, collapse/expand tasks, set the plan window (start date + number of weeks). Stays fixed as the original forecast. |
| **Actuals vs Forecast** | The weekly working page: actuals from each upload shown next to an editable **updated forecast** per cell, red weekly overruns, per-item EAC/variance columns, and a **comparison table — original vs updated vs actual** (hours, cost, revenue, margin) with a variance column. Buttons to seed the updated forecast from the original, copy actuals into past cells, or re-baseline. |
| **Cost Actuals** | Read-only view of every cost straight from the import — labor, subs, expenses, oncost. Group by employee/vendor, task, transaction type or expenditure type; weekly columns by default (or monthly), locked to the same plan window as the two project tabs when a project is selected; billed/unbilled per row, invoice counts, last charge date, click-through to each transaction. Nothing on this page is editable, so it always matches the extract exactly. |
| **Rate Table** | Own tab: derived cost rate = **Salaries ÷ Hours × overhead multiplier** (default 2.3474, with per-person exceptions, e.g. Jeff Frahm = 2.1138 — both editable), overridable per person, plus bill rate (price to owner), margin per hour, add-people and fill-from-multiplier helpers, summary KPIs. Drives cost/revenue/margin on both project tabs. |
| **Settings** | Period source (Period Name vs GL/Transaction Date month), currency, decimals, what counts as "billed". |

## Forecast methods (all adjustable)

- **Average of last N periods** — classic run-rate.
- **Weighted average** — recent months count more.
- **Linear trend** — least-squares fit projected forward (catches ramp-up / ramp-down).
- **Repeat last period**.
- A **monthly adjust %** compounds on top of any method (e.g. `-5` ramps spend down 5% per month).
- Option to exclude the latest period from burn-rate calcs since a weekly extract usually contains a partial month.
- Every dimension can be filtered (multi-select with search) before forecasting.

## Two-page project workflow

1. **Project Forecast tab** — set the plan window, add rows for each task/person,
   enter baseline hours per week (paste from Excel works), and set cost and bill
   rates on the Rate Table tab. The baseline totals card shows planned hours, cost,
   total revenue and margin. This is the original forecast and stays fixed.
2. **Actuals vs Forecast tab** — click *Copy original forecast → updated
   forecast* once to seed it. Each week, upload the new extract: actuals appear
   next to your forecast, red cells flag weekly overruns, and you revise the
   updated forecast freely. The comparison table at the top shows original vs
   updated vs actual side by side so the drift is always visible.
3. **Risk & contingency** — enter dollar amounts (or set from a % of baseline
   cost) on the Project Forecast tab. Baseline totals then show cost including
   reserves and margin after reserves, and the Actuals vs Forecast comparison
   tracks the **drawdown**: how much of the reserve the EAC cost overrun has
   consumed, what remains (red when blown), and EAC vs the total authorized
   budget including reserves.
4. If scope changes are approved, *Set new baseline from updated forecast*
   re-baselines the job.

Plans, baselines and rates are saved per project (and per row-level) in the
browser and survive weekly uploads. **Project Forecast, Actuals vs Forecast
and Cost Actuals all share one date range** — the plan window (start week +
number of weeks) set on the Project Forecast tab, automatically extended
through the latest actual week — so the week columns line up 1:1 across tabs.

## Saving your work

Everything you type auto-saves in the browser as you work. For durable files:

- **Save** — in Edge/Chrome it asks where to put the workbook once, then writes
  back to that same file every save (like Excel) and **auto-saves to it every
  2 minutes**. In other browsers it downloads a copy.
- **Save As…** — pick location and format: a real **Excel workbook (.xlsx)**
  with readable sheets (Data, Baseline Plan, Updated Forecast, Rate Table,
  Projects incl. reserves, Budgets) plus a hidden exact-state sheet, or compact
  JSON. Anyone can read the .xlsx in Excel; the tool reopens either losslessly.
- **Open** — restores a workbook exactly and keeps saving back to that file.
- Keep workbooks in a synced SharePoint/OneDrive folder and you get version
  history for free. Export/Import settings moves configuration only.

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

## Standalone / offline version

`oracle-project-forecast-standalone.html` is the same tool with SheetJS and
Chart.js embedded directly in the file (~1.1 MB): it makes **zero network
requests**, works with no internet at all, and can be emailed or dropped on a
shared drive. `oracle-project-forecast-standalone.zip` is the same file zipped
for mail filters that block .html attachments. Rebuild it after changing the
main file with `node build-standalone.js` (after
`npm install --no-save xlsx@0.18.5 chart.js@4.4.1`).

Neither version uses Claude or any AI/external service — it's plain
HTML/JavaScript running locally in the browser.

## Notes

- Excel parsing (SheetJS) and charts (Chart.js) load from a CDN, so the first
  open needs internet access. CSV upload and all tables work offline.
- Numbers like `(1,234.56)` and `$1,234` are handled. Period names like
  `JAN-26`, `Jan-2026`, `2026-01` are all understood; otherwise the GL Date
  month is used.
