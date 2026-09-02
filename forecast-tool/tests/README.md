# Regression tests

jsdom-based checks that load `../oracle-project-forecast.html` and drive it like a browser.

Run from the repository root (so `forecast-tool/...` paths resolve):

    npm install --no-save jsdom xlsx-js-style chart.js@4.4.1
    node forecast-tool/tests/test-smoke.cjs
    node forecast-tool/tests/test-subdup.cjs
    node forecast-tool/tests/test-costchart.cjs

- `test-smoke.cjs` — loads the 946-row sample extract and renders every tab, failing on any thrown error.
- `test-subdup.cjs` — subcontractor timesheet hours must not duplicate across workbook save→open cycles (regression for the 6,000→6,600 inflation bug), and corrupted workbooks must heal on open.
- `test-costchart.cjs` — the Cost $ by week chart on the Project Plan tab: staff/sub stacking, forecast lines at burdened cost rates, cumulative burn curve, parity with the hours chart.
