// Dashboard revenue and Project Plan revenue must agree: actual revenue everywhere is
// priced per transaction by rowRevenue (the Dashboard's rule). Regression for the
// misalignment where the plan tab billed burden rows and totalCost x markup.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync('forecast-tool/oracle-project-forecast.html', 'utf8');
const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => ({});
w.Chart = function (c, cfg) { this.cfg = cfg; }; w.Chart.prototype.destroy = function () {};
w.alert = () => {}; w.confirm = () => true;
const fail = [], ok = [];
function check(n, c, x) { (c ? ok : fail).push(n + (x ? ' — ' + x : '')); }
setTimeout(() => { try { run(); } catch (e) { console.error('THREW:', e.stack); process.exit(1); } }, 300);

function run() {
  w.eval(`
    const _drawChart = drawChart;
    window.__charts = {};
    drawChart = function(id, cfg) { window.__charts[id] = cfg; _drawChart(id, cfg); };
    window.__t = { get data(){return data}, state, FIELDS, parseDateVal, wkKey, recomputePeriods, switchTab,
      planNode, renderActualsPage, rowRevenue, leadPacks, revByDiscipline, updateRevChart, $, $$,
      get ppCtx(){return ppCtx} };
  `);
  const g = w.__t;
  const D = s => g.parseDateVal(s);
  const proj = 'P-100';
  const mk = o => { const r = {}; for (const f of g.FIELDS) r[f.key] = f.type === 'num' ? 0 : (f.type === 'date' ? null : ''); return Object.assign(r, o); };

  // the fixture that used to diverge:
  g.data.length = 0;
  const base = { projectNumber: proj, projectName: 'Job', topTaskNumber: '1', topTaskName: 'Ph1' };
  // plain labor: 10 h @ bill 200 = $2,000
  g.data.push(mk({ ...base, employee: 'Alice Smith', taskNumber: '1.1', taskName: 'Design', taskManager: 'Jane Lead',
    hours: 10, salaries: 400, totalCost: 939, glDate: D('2026-05-01'), transactionDate: D('2026-05-01') }));
  // reversal pair @ bill 150: +5 h then -5 h — nets to zero hours AND zero revenue
  g.data.push(mk({ ...base, employee: 'Bob Jones', taskNumber: '1.1', taskName: 'Design', taskManager: 'Jane Lead',
    hours: 5, salaries: 200, totalCost: 470, glDate: D('2026-05-01'), transactionDate: D('2026-05-01') }));
  g.data.push(mk({ ...base, employee: 'Bob Jones', taskNumber: '1.1', taskName: 'Design', taskManager: 'Jane Lead',
    hours: -5, salaries: -200, totalCost: -470, glDate: D('2026-05-08'), transactionDate: D('2026-05-08') }));
  // fringe/oncost burden line: earns $0 everywhere
  g.data.push(mk({ ...base, employee: '', taskNumber: '1.8', taskName: 'Burden', taskManager: 'Jane Lead',
    hours: 0, fringe: 500, totalCost: 500, glDate: D('2026-05-01'), transactionDate: D('2026-05-01'),
    transactionType: 'Burden', expenditureType: 'Fringe' }));
  // genuine sub: subsCost 1000, oncost 100 -> bills 1000 x 1.10 = $1,100 (NOT totalCost 1100 x 1.10)
  g.data.push(mk({ ...base, employee: 'Acme Corp', taskNumber: '1.9', taskName: 'Subs', taskManager: 'Jane Lead',
    hours: 0, subsCost: 1000, oncost: 100, totalCost: 1100, glDate: D('2026-05-08'), transactionDate: D('2026-05-08'),
    expenditureType: 'Subconsultants' }));
  g.state.mapping.subsCost = 'Subs Cost'; g.state.mapping.expensesCost = 'Expenses Cost';
  g.recomputePeriods();
  const meta = (g.state.plans[proj] = g.state.plans[proj] || {});
  meta._rateTable = { 'Alice Smith': { cost: 100, bill: 200 }, 'Bob Jones': { cost: 90, bill: 150 } };
  meta._nlMarkup = 10;

  Object.assign(g.state.settings, { ppProject: proj, ppPast: '26', ppAhead: 8, ppMode: 'work' });
  g.switchTab('pplan');
  const rows = g.data.filter(r => (r.projectNumber || r.projectName) === proj);
  const dash = Math.round(rows.reduce((s, r) => s + g.rowRevenue(r), 0));
  check('dashboard fixture total is $3,100', dash === 3100, dash);   // 2000 + 750 - 750 + 0 + 1100

  const W = g.ppCtx.visWeeks, law = g.ppCtx.lastActualWeek;
  const iw = k => W.indexOf(k);
  const w1 = g.wkKey(D('2026-05-01')), w2 = g.wkKey(D('2026-05-08'));

  // 1. the revenue chart's actual series
  const rc = w.__charts['chRev'];
  const actDs = rc.data.datasets.find(d => /^Actual revenue/.test(d.label));
  const chartTotal = actDs.data.filter(v => v != null).pop();     // cumulative by default
  check('plan-tab revenue chart total equals the Dashboard', chartTotal === dash, chartTotal + ' vs ' + dash);
  check('info line reports the same figure with no clipping note', /Actual revenue to date \$3,100/.test(g.$('#revInfo').textContent)
    && !/visible window/.test(g.$('#revInfo').textContent), g.$('#revInfo').textContent);

  // per-week: w1 = 2000 + 750 = 2750 ; w2 = -750 + 1100 = 350
  g.$('#revCum').checked = false; g.$('#revCum').dispatchEvent(new w.Event('change'));
  const perWk = w.__charts['chRev'].data.datasets.find(d => /^Actual revenue/.test(d.label));
  check('week 1 actual revenue includes the +reversal leg', perWk.data[iw(w1)] === 2750, perWk.data[iw(w1)]);
  check('week 2 nets the reversal and bills the sub correctly', perWk.data[iw(w2)] === 350, perWk.data[iw(w2)]);
  g.$('#revCum').checked = true; g.$('#revCum').dispatchEvent(new w.Event('change'));

  // 2. burden earns $0, sub bills on subsCost not totalCost
  const items = g.ppCtx.items;
  const burden = items.find(i => /Burden/.test(i.label));
  check('burden item prices to $0 on the plan tab', ![...(burden.revW || new Map()).values()].some(v => v),
    JSON.stringify([...(burden.revW || new Map())]));
  const sub = items.find(i => /Subs/.test(i.label) && /Acme/.test(i.label));
  check('sub bills subsCost x markup, not totalCost x markup', Math.round([...sub.revW.values()].reduce((a, b) => a + b, 0)) === 1100,
    [...sub.revW.values()].join(','));

  // 3. cost chart's revenue series agrees
  const cc = w.__charts['chCost'];
  const ccRa = cc.data.datasets.find(d => d.label === 'Actual revenue');
  check('cost chart revenue series agrees per week', ccRa.data[iw(w1)] === 2750 && ccRa.data[iw(w2)] === 350,
    ccRa.data[iw(w1)] + '/' + ccRa.data[iw(w2)]);

  // 4. weekly revenue rows under the grid
  const achieved = g.ppCtx._revActRow.tot.textContent;
  check('grid "Revenue — achieved" total equals the Dashboard', /3,100/.test(achieved), achieved);

  // 5. revenue-by-discipline report reconciles
  const rd = g.revByDiscipline();
  check('discipline report achieved total equals the Dashboard', Math.round(rd.groups.reduce((s, x) => s + x.actT, 0)) === dash,
    rd.groups.reduce((s, x) => s + x.actT, 0));

  // 6. lead packs reconcile
  const lp = g.leadPacks();
  const lpTotal = Math.round(lp.leads.reduce((s, l) => s + l.actRevTD, 0));
  check('lead packs achieved total equals the Dashboard', lpTotal === dash, lpTotal + ' vs ' + dash);

  // 7. the no-bill flag stays a plan-tab refinement
  const node = g.planNode(proj, 'taskEmployee');
  node.nb['1.1 Design · Alice Smith'] = true;
  g.renderActualsPage();
  const nbTotal = w.__charts['chRev'].data.datasets.find(d => /^Actual revenue/.test(d.label)).data.filter(v => v != null).pop();
  check('no-bill flag removes that row from plan revenue', nbTotal === 1100, nbTotal);   // 3100 - 2000 - (750-750)... nb only on Alice: 3100-2000=1100
  check('info explains the plan tab is below the Dashboard on purpose here', /Actual revenue to date \$1,100/.test(g.$('#revInfo').textContent));
  delete node.nb['1.1 Design · Alice Smith'];

  // 8. clipping the window is visible, not silent — a plan start after the earliest
  // actuals pushes those weeks into the "Earlier" column, off the chart
  const saveStart = node.baseStart;
  node.baseStart = w2;
  g.renderActualsPage();
  check('week 1 really is outside the visible window now', !g.ppCtx.visWeeks.includes(w1), g.ppCtx.visWeeks[0]);
  const clippedInfo = g.$('#revInfo').textContent;
  check('clipped window shows the note with the all-weeks figure', /visible window/.test(clippedInfo) && /3,100/.test(clippedInfo)
    && /plan start earlier/.test(clippedInfo), clippedInfo);
  const clippedTotal = w.__charts['chRev'].data.datasets.find(d => /^Actual revenue/.test(d.label)).data.filter(v => v != null).pop();
  check('clipped chart shows only the in-window revenue', clippedTotal === 350, clippedTotal);
  node.baseStart = saveStart;
  g.renderActualsPage();

  report();
}
function report() {
  console.log('\nPASS (' + ok.length + ')'); ok.forEach(s => console.log('  ✓ ' + s));
  if (fail.length) { console.log('\nFAIL (' + fail.length + ')'); fail.forEach(s => console.log('  ✗ ' + s)); process.exit(1); }
  console.log('\nALL GOOD'); process.exit(0);
}
