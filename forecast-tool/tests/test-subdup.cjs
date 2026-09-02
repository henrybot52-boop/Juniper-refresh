// reproduces the imported-hours inflation: sub-timesheet rows were saved into the
// workbook AND re-injected on open, duplicating their hours every save->open cycle
const fs = require('fs');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync('forecast-tool/oracle-project-forecast.html', 'utf8');
const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => ({});
w.Chart = function () {}; w.Chart.prototype.destroy = function () {};
const alerts = []; w.alert = m => alerts.push(String(m)); w.confirm = () => true;
w.URL.createObjectURL = () => 'blob:x';
const xlsxSrc = fs.readFileSync(require.resolve('xlsx-js-style/dist/xlsx.bundle.js'), 'utf8');
const fail = [], ok = [];
function check(n, c, x) { (c ? ok : fail).push(n + (x ? ' — ' + x : '')); }
setTimeout(() => { try { w.eval(xlsxSrc); run(); } catch (e) { console.error('THREW:', e.stack); process.exit(1); } }, 300);

function run() {
  w.eval(`window.__t = { get data(){return data}, state, FIELDS, parseDateVal, recomputePeriods,
    buildWorkbookObj, buildXlsx, applyWorkbookJson, injectSubTimesheets, switchTab, buildAllFilterbars, $, $$ };`);
  const g = w.__t;
  const D = s => g.parseDateVal(s);
  const proj = 'P-100';
  const mk = o => { const r = {}; for (const f of g.FIELDS) r[f.key] = f.type === 'num' ? 0 : (f.type === 'date' ? null : ''); return Object.assign(r, o); };

  // 5400 staff hours + a 600-hour subcontractor timesheet = 6000 total
  g.data.length = 0;
  for (let i = 0; i < 27; i++)
    g.data.push(mk({ projectNumber: proj, projectName: 'Job', employee: 'Staff ' + (i % 9), taskNumber: '1.1', taskName: 'Design',
      topTaskNumber: '1', topTaskName: 'Ph1', hours: 200, salaries: 10000, totalCost: 23474,
      glDate: D('2026-05-0' + (1 + i % 8)), transactionDate: D('2026-05-0' + (1 + i % 8)) }));
  const meta = (g.state.plans[proj] = g.state.plans[proj] || {});
  meta._subTS = [{ id: 'a', vendor: 'Acme Structural', task: '9.1 Subconsultant - Acme', entries: [
    { emp: 'R. Patel', date: '2026-05-04', hours: 400, billing: 60000 },
    { emp: 'K. Ng', date: '2026-05-11', hours: 200, billing: 30000 },
  ] }];
  g.recomputePeriods();

  const totalHours = () => Math.round(g.data.reduce((s, r) => s + (r.hours || 0), 0));
  const subRows = () => g.data.filter(r => r.transactionType === 'Subcontractor timesheet').length;
  check('baseline: 6,000 total hours after injection', totalHours() === 6000, totalHours());
  check('baseline: 2 injected timesheet rows', subRows() === 2, subRows());

  for (let cycle = 1; cycle <= 3; cycle++) {
    const json = JSON.stringify(g.buildWorkbookObj());
    const okOpen = g.applyWorkbookJson(json);
    check('cycle ' + cycle + ': workbook reopens', okOpen === true, alerts.join('/'));
    check('cycle ' + cycle + ': total hours still 6,000', totalHours() === 6000, totalHours());
    check('cycle ' + cycle + ': still exactly 2 timesheet rows', subRows() === 2, subRows());
  }

  const obj = g.buildWorkbookObj();
  check('saved workbook excludes injected rows', obj.rows.length === 27, obj.rows.length);
  check('saved workbook keeps the timesheet packs', obj.plans[proj]._subTS.length === 1);
  check('saved staff hours intact', Math.round(obj.rows.reduce((s, r) => s + (r.hours || 0), 0)) === 5400);

  const wb = g.buildXlsx(obj);
  const grid = w.XLSX.utils.sheet_to_json(wb.Sheets['Data'], { header: 1, defval: '' });
  check('Excel Data sheet excludes injected rows', grid.length - 1 === 27, grid.length - 1);

  // healing files corrupted by the old versions
  const corrupted = JSON.parse(JSON.stringify(obj));
  for (let copy = 0; copy < 2; copy++)
    for (const e of [['R. Patel', '2026-05-04', 400], ['K. Ng', '2026-05-11', 200]]) {
      const r = {}; for (const f of g.FIELDS) r[f.key] = f.type === 'num' ? 0 : (f.type === 'date' ? null : '');
      Object.assign(r, { projectNumber: proj, projectName: 'Job', employee: e[0], taskNumber: '9.1',
        taskName: 'Subconsultant - Acme', transactionType: 'Subcontractor timesheet',
        expenditureType: 'Subconsultant labor', glDate: e[1], transactionDate: e[1], hours: e[2] });
      corrupted.rows.push(r);
    }
  check('corrupted fixture really is inflated', corrupted.rows.reduce((s, r) => s + (r.hours || 0), 0) === 5400 + 1200);
  g.applyWorkbookJson(JSON.stringify(corrupted));
  check('opening a corrupted workbook heals it back to 6,000 hours', totalHours() === 6000, totalHours());
  check('healed file has exactly one copy of each timesheet row', subRows() === 2, subRows());

  g.state.plans[proj]._subTS = [];
  g.recomputePeriods();
  check('removing the pack removes its hours', totalHours() === 5400, totalHours());
  check('no timesheet rows remain', subRows() === 0, subRows());

  report();
}
function report() {
  console.log('\nPASS (' + ok.length + ')'); ok.forEach(s => console.log('  ✓ ' + s));
  if (fail.length) { console.log('\nFAIL (' + fail.length + ')'); fail.forEach(s => console.log('  ✗ ' + s)); process.exit(1); }
  console.log('\nALL GOOD'); process.exit(0);
}
