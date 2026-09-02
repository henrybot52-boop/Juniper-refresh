// jsdom verification: the cost-$ mirror of the hours chart on the Project Plan tab
const fs = require('fs');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync('forecast-tool/oracle-project-forecast.html', 'utf8');
const charts = {};
const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = function () { return {}; };
w.Chart = function (c, cfg) { this.cfg = cfg; charts[this._id] = cfg; charts.last = cfg; };
w.Chart.prototype.destroy = function () {};
w.alert = () => {}; w.confirm = () => true;
const fail = [], ok = [];
function check(n, c, x) { (c ? ok : fail).push(n + (x ? ' — ' + x : '')); }
setTimeout(() => { try { run(); } catch (e) { console.error('THREW:', e.stack); process.exit(1); } }, 300);

function run() {
  // capture per-canvas: wrap drawChart's Chart creation by canvas id
  w.eval(`
    const _drawChart = drawChart;
    window.__charts = {};
    drawChart = function(id, cfg) { window.__charts[id] = cfg; _drawChart(id, cfg); };
    window.__t = { get data(){return data}, state, FIELDS, parseDateVal, wkKey, recomputePeriods,
      switchTab, planNode, renderActualsPage, updateCostChart, $, $$, get ppCtx(){return ppCtx}, SUB_PALETTE };
  `);
  const g = w.__t;
  const D = s => g.parseDateVal(s);
  const proj = 'P-100';
  const mk = o => { const r = {}; for (const f of g.FIELDS) r[f.key] = f.type === 'num' ? 0 : (f.type === 'date' ? null : ''); return Object.assign(r, o); };

  // staff actuals: cost 1000 / 1200 / 600 over three weeks, plus a 500 expense row in week 1
  g.data.length = 0;
  const stf = [['2026-05-01', 10, 1000], ['2026-05-08', 12, 1200], ['2026-05-15', 6, 600]];
  for (const [d, h, c] of stf)
    g.data.push(mk({ projectNumber: proj, projectName: 'Job', employee: 'Alice Smith', taskNumber: '1.1', taskName: 'Design',
      topTaskNumber: '1', topTaskName: 'Ph1', hours: h, salaries: h * 40, totalCost: c, glDate: D(d), transactionDate: D(d) }));
  g.data.push(mk({ projectNumber: proj, projectName: 'Job', employee: '', taskNumber: '1.9', taskName: 'Expenses',
    topTaskNumber: '1', topTaskName: 'Ph1', hours: 0, expensesCost: 500, totalCost: 500,
    glDate: D('2026-05-01'), transactionDate: D('2026-05-01'), expenditureType: 'Expenses' }));
  const meta = (g.state.plans[proj] = g.state.plans[proj] || {});
  meta._rateTable = { 'Alice Smith': { cost: 100, bill: 200 } };
  meta._subs = [{ vendor: 'Acme Structural', commit: 50000 }];
  meta._subTS = [{ id: 'a', vendor: 'Acme Structural', task: '9.1 Subconsultant - Acme', entries: [
    { emp: 'R. Patel', date: '2026-05-01', hours: 8, billing: 1200 },
    { emp: 'R. Patel', date: '2026-05-08', hours: 12, billing: 1800 },
  ] }];
  g.recomputePeriods();

  Object.assign(g.state.settings, { ppProject: proj, ppPast: '26', ppAhead: 12, ppMode: 'work' });
  g.switchTab('pplan');
  const node = g.planNode(proj, 'taskEmployee');
  const W = g.ppCtx.visWeeks, law = g.ppCtx.lastActualWeek;
  const wk = d => g.wkKey(D(d));
  const w1 = wk('2026-05-01'), w2 = wk('2026-05-08'), w3 = wk('2026-05-15');
  const fut = W.filter(x => x > law);
  // forecast: baseline 12/12/12 h, current 12/12/8 h + future 8 h — cost rate 100
  for (const [wkk, b, c] of [[w1, 12, 12], [w2, 12, 12], [w3, 12, 8]]) {
    node.baseline['1.1 Design · Alice Smith|' + wkk] = b;
    node.current['1.1 Design · Alice Smith|' + wkk] = c;
  }
  node.current['1.1 Design · Alice Smith|' + fut[0]] = 8;
  node.baselineAt = new Date().toISOString();
  g.renderActualsPage();

  const cfg = w.__charts['chCost'];
  check('cost chart draws with the plan page', !!cfg);
  const iw = k => W.indexOf(k);
  const ds = cfg.data.datasets, names = ds.map(d => d.label);
  const staff = ds.find(d => d.label === 'Actual cost — staff');
  const acme = ds.find(d => d.label === 'Actual cost — Acme Structural');
  const upd = ds.find(d => d.label === 'Updated forecast cost');
  const orig = ds.find(d => d.label === 'Original forecast cost');
  check('staff + vendor + two forecast series', !!staff && !!acme && !!upd && !!orig, names.join(' | '));

  // hand-computed: week1 total actual = 1000 + 500 + 1200(sub) → staff bar 1500, sub bar 1200
  check('week 1 staff cost = staff labor + expenses', staff.data[iw(w1)] === 1500, staff.data[iw(w1)]);
  check('week 1 vendor bar carries the sub cost', acme.data[iw(w1)] === 1200, acme.data[iw(w1)]);
  check('week 2 staff cost', staff.data[iw(w2)] === 1200, staff.data[iw(w2)]);
  check('week 2 vendor bar', acme.data[iw(w2)] === 1800, acme.data[iw(w2)]);
  check('week 3 has no sub cost', staff.data[iw(w3)] === 600 && (acme.data[iw(w3)] || 0) === 0,
    staff.data[iw(w3)] + '/' + acme.data[iw(w3)]);
  check('actual bars stop at the last actual week', staff.data[iw(fut[0])] === null);
  // forecast lines: current hours × cost rate 100
  check('updated forecast cost = current hrs × cost rate', upd.data[iw(w3)] === 800 && upd.data[iw(fut[0])] === 800,
    upd.data[iw(w3)] + '/' + upd.data[iw(fut[0])]);
  check('original forecast cost from the baseline', orig.data[iw(w1)] === 1200 && orig.data[iw(w3)] === 1200,
    orig.data[iw(w1)] + '/' + orig.data[iw(w3)]);
  // same stacking discipline as the hours chart
  check('actual bars share one stack', staff.stack === 'act' && acme.stack === 'act');
  check('forecast lines sit in their own stacks', upd.stack === 'fc-u' && orig.stack === 'fc-b');
  check('both axes stacked', cfg.options.scales.x.stacked === true && cfg.options.scales.y.stacked === true);
  check('vendor colour matches the hours chart', acme.backgroundColor === w.__charts['chPlan'].data.datasets
    .find(d => /Acme/.test(d.label)).backgroundColor, acme.backgroundColor);
  // info line
  const info = g.$('#costInfo').textContent;
  check('info reports actual cost to date', /\$6,300/.test(info), info);   // 1000+500+1200 + 1200+1800 + 600
  check('info reports the to-date variance vs baseline', /planned to date/.test(info), info);

  // ---- revenue series on the same chart ----
  const ra = ds.find(d => d.label === 'Actual revenue');
  const ru = ds.find(d => d.label === 'Updated forecast revenue');
  check('revenue series shown by default', !!ra && !!ru, names.join(' | '));
  // actual revenue = charged hours x bill 200; expenses at cost (markup 0): w1 = 10x200 + 500 = 2500
  check('week 1 actual revenue = hours x bill + expenses at markup', ra.data[iw(w1)] === 2500, ra.data[iw(w1)]);
  check('week 2 actual revenue', ra.data[iw(w2)] === 2400, ra.data[iw(w2)]);
  check('updated forecast revenue = current hrs x bill', ru.data[iw(w3)] === 1600 && ru.data[iw(fut[0])] === 1600,
    ru.data[iw(w3)] + '/' + ru.data[iw(fut[0])]);
  check('actual revenue stops at the last actual week', ra.data[iw(fut[0])] === null);
  check('revenue lines are lines with their own stacks', ra.type === 'line' && ru.type === 'line' &&
    ra.stack !== 'act' && ru.stack !== ra.stack, ra.stack + '/' + ru.stack);
  const info0 = g.$('#costInfo').textContent;
  // rev TD = 2500 + 2400 + (6x200=1200) + subs? sub timesheet rows are labor items: w1 8h, w2 12h with no bill rate -> $0
  check('info reports revenue and margin to date', /revenue to date \$6,100/.test(info0) && /margin to date -\$200/.test(info0), info0);
  // toggle revenue off
  g.$('#costShowRev').checked = false;
  g.$('#costShowRev').dispatchEvent(new w.Event('change'));
  const dsOff = w.__charts['chCost'].data.datasets;
  check('unchecking hides the revenue series', !dsOff.some(d => /revenue/i.test(d.label)),
    dsOff.map(d => d.label).join(' | '));
  check('info drops revenue when hidden', !/revenue to date/.test(g.$('#costInfo').textContent));
  g.$('#costShowRev').checked = true;
  g.$('#costShowRev').dispatchEvent(new w.Event('change'));

  // ---- cumulative mode: the budget burn curve ----
  g.$('#costCum').checked = true;
  g.$('#costCum').dispatchEvent(new w.Event('change'));
  const cfg2 = w.__charts['chCost'];
  check('cumulative mode switches to lines', cfg2.type === 'line' &&
    cfg2.data.datasets.every(d => d.type === 'line'), cfg2.type);
  const act2 = cfg2.data.datasets.find(d => d.label === 'Actual cost');
  check('cumulative actual includes subs in one line', !!act2 &&
    !cfg2.data.datasets.some(d => /Acme/.test(d.label)), cfg2.data.datasets.map(d => d.label).join(' | '));
  const ra2 = cfg2.data.datasets.find(d => d.label === 'Actual revenue');
  check('cumulative mode carries revenue too', !!ra2 && ra2.data.filter(v => v != null).pop() === 6100,
    ra2 && ra2.data.filter(v => v != null).pop());
  const lastVal = act2.data.filter(v => v != null).pop();
  check('cumulative actual ends at total cost to date', lastVal === 6300, lastVal);
  check('cumulative actual is monotonic', (() => { let p = -1; for (const v of act2.data) { if (v == null) continue; if (v < p) return false; p = v; } return true; })());
  const upd2 = cfg2.data.datasets.find(d => d.label === 'Updated forecast cost');
  check('cumulative forecast keeps climbing into future weeks', upd2.data[iw(fut[0])] > upd2.data[iw(w3)],
    upd2.data[iw(w3)] + ' -> ' + upd2.data[iw(fut[0])]);
  g.$('#costCum').checked = false;
  g.$('#costCum').dispatchEvent(new w.Event('change'));
  check('toggle back re-renders bars', w.__charts['chCost'].type === 'bar');

  // ---- no subs: plain single bar ----
  meta._subTS = [];
  g.recomputePeriods(); g.renderActualsPage();
  const ds3 = w.__charts['chCost'].data.datasets;
  check('without subs the bar is plain "Actual cost"', ds3.some(d => d.label === 'Actual cost') &&
    !ds3.some(d => /— /.test(d.label) && d.type === 'bar'), ds3.map(d => d.label).join(' | '));

  report();
}
function report() {
  console.log('\nPASS (' + ok.length + ')'); ok.forEach(s => console.log('  ✓ ' + s));
  if (fail.length) { console.log('\nFAIL (' + fail.length + ')'); fail.forEach(s => console.log('  ✗ ' + s)); process.exit(1); }
  console.log('\nALL GOOD'); process.exit(0);
}
