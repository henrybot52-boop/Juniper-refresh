// Revenue QC on the Billing tab: earned revenue through a chosen date reconciled
// against the invoice log, with monthly + task breakdowns and an extract cross-check.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync('forecast-tool/oracle-project-forecast.html', 'utf8');
const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => ({});
w.Chart = function (c, cfg) { this.cfg = cfg; }; w.Chart.prototype.destroy = function () {};
const alerts = []; w.alert = m => alerts.push(String(m)); w.confirm = () => true;
w.URL.createObjectURL = () => 'blob:x';
const xlsxSrc = fs.readFileSync(require.resolve('xlsx-js-style/dist/xlsx.bundle.js'), 'utf8');
const fail = [], ok = [];
function check(n, c, x) { (c ? ok : fail).push(n + (x ? ' — ' + x : '')); }
setTimeout(() => { try { w.eval(xlsxSrc); run(); } catch (e) { console.error('THREW:', e.stack); process.exit(1); } }, 300);

function run() {
  w.eval(`window.__t = { get data(){return data}, state, FIELDS, parseDateVal, recomputePeriods, switchTab,
    rowRevenue, rqBuild, renderRevQc, renderBillingTab, exportRevQcXlsx, $, $$, get ppCtx(){return ppCtx} };`);
  const g = w.__t;
  const D = s => g.parseDateVal(s);
  const proj = 'P-100';
  const mk = o => { const r = {}; for (const f of g.FIELDS) r[f.key] = f.type === 'num' ? 0 : (f.type === 'date' ? null : ''); return Object.assign(r, o); };

  // May: Alice 10h @200 = 2000 (billed per extract) ; June: Alice 15h @200 = 3000 (unbilled)
  // June: sub row subsCost 1000 @10% markup = 1100 (billed) ; July: 5h @200 = 1000 (after cut-off)
  // burden row in May: $0 revenue
  g.data.length = 0;
  const base = { projectNumber: proj, projectName: 'Job', topTaskNumber: '1', topTaskName: 'Ph1' };
  g.data.push(mk({ ...base, employee: 'Alice Smith', taskNumber: '1.1', taskName: 'Design', hours: 10, salaries: 400,
    totalCost: 939, glDate: D('2026-05-10'), transactionDate: D('2026-05-10'), billedStatus: 'Billed' }));
  g.data.push(mk({ ...base, employee: 'Alice Smith', taskNumber: '1.1', taskName: 'Design', hours: 15, salaries: 600,
    totalCost: 1409, glDate: D('2026-06-10'), transactionDate: D('2026-06-10'), billedStatus: 'Unbilled' }));
  g.data.push(mk({ ...base, employee: 'Acme Corp', taskNumber: '1.9', taskName: 'Subs', hours: 0, subsCost: 1000,
    oncost: 100, totalCost: 1100, glDate: D('2026-06-20'), transactionDate: D('2026-06-20'), billedStatus: 'Billed' }));
  g.data.push(mk({ ...base, employee: 'Alice Smith', taskNumber: '1.1', taskName: 'Design', hours: 5, salaries: 200,
    totalCost: 470, glDate: D('2026-07-05'), transactionDate: D('2026-07-05'), billedStatus: 'Unbilled' }));
  g.data.push(mk({ ...base, employee: '', taskNumber: '1.8', taskName: 'Burden', hours: 0, fringe: 500, totalCost: 500,
    glDate: D('2026-05-15'), transactionDate: D('2026-05-15') }));
  g.state.mapping.subsCost = 'Subs Cost'; g.state.mapping.billedStatus = 'Billed Status';
  g.recomputePeriods();
  const meta = (g.state.plans[proj] = g.state.plans[proj] || {});
  meta._rateTable = { 'Alice Smith': { cost: 100, bill: 200 } };
  meta._nlMarkup = 10;
  meta._bills = [
    { id: 'i1', period: 'May', invoice: 'INV-001', amount: 2000, date: '2026-05-26', status: 'Paid' },
    { id: 'i2', period: 'June', invoice: 'INV-002', amount: 3800, date: '2026-06-22', status: 'Submitted' },
    { id: 'i3', period: 'July', invoice: 'INV-003', amount: 1000, date: '2026-07-20', status: 'Submitted' },  // after cut-off
    { id: 'i4', period: 'June', invoice: 'INV-004', amount: 999, date: '2026-06-25', status: 'Draft' },       // draft: excluded
  ];
  meta._rqDate = '2026-06-30';

  g.state.settings.ppProject = proj;
  g.switchTab('billing');
  check('billing tab renders the QC card', !!g.$('#rqCard') && g.$('#rqDate').value === '2026-06-30', g.$('#rqDate').value);

  const q = g.rqBuild();
  // earned through 6/30: 2000 + 3000 + 1100 + 0(burden) = 6100 ; July's 1000 excluded
  check('earned through the date, Dashboard-priced', Math.round(q.earned) === 6100, q.earned);
  check('invoiced = submitted + paid on or before the date', q.inv === 5800, q.inv);   // 2000 + 3800
  check('draft invoices excluded and reported', q.invDraft === 999, q.invDraft);
  check('extract cross-check picks up billed rows only', Math.round(q.exBilled) === 3100, q.exBilled); // 2000 + 1100
  // months
  const may = q.months.find(m => m[0] === '2026-05'), jun = q.months.find(m => m[0] === '2026-06');
  check('May bucket: earned 2000 / invoiced 2000', Math.round(may[1].earned) === 2000 && may[1].inv === 2000,
    may[1].earned + '/' + may[1].inv);
  check('June bucket: earned 4100 / invoiced 3800', Math.round(jun[1].earned) === 4100 && jun[1].inv === 3800,
    jun[1].earned + '/' + jun[1].inv);
  check('no July bucket beyond the cut-off', !q.months.some(m => m[0] === '2026-07'), q.months.map(m => m[0]).join(','));
  // tasks
  const design = q.tasks.find(t => /Design/.test(t.task)), subs = q.tasks.find(t => /Subs/.test(t.task));
  check('task split: Design earned 5000, 2000 billed', Math.round(design.earned) === 5000 && Math.round(design.ex) === 2000,
    design.earned + '/' + design.ex);
  check('task split: Subs earned 1100, all billed', Math.round(subs.earned) === 1100 && Math.round(subs.ex) === 1100,
    subs.earned + '/' + subs.ex);
  check('burden task earns nothing and is dropped from the table', !q.tasks.some(t => /Burden/.test(t.task) && Math.abs(t.earned) > 0.5));

  // ---- the rendered card ----
  const kpiText = g.$('#rqKpis').textContent;
  check('KPIs show earned, invoiced and the WIP gap', /\$6,100/.test(kpiText) && /\$5,800/.test(kpiText) && /\$300/.test(kpiText), kpiText);
  check('extract cross-check KPI shown', /Billed per extract/.test(kpiText) && /\$3,100/.test(kpiText));
  const verdict = g.$('#rqVerdict').textContent;
  check('verdict flags the gap with its %', /\$300/.test(verdict) && /4\.9%/.test(verdict) && /earned but not invoiced/.test(verdict), verdict);
  check('verdict reports the excluded drafts', /\$999/.test(verdict) && /draft/i.test(verdict), verdict);
  const mRows = [...g.$('#rqMonths').querySelectorAll('tbody tr')];
  check('monthly table has a row per month', mRows.length === 2, mRows.length);
  check('cumulative gap column lands on $300', /300/.test(mRows[1].lastChild.textContent), mRows[1].lastChild.textContent);
  const tHeads = [...g.$('#rqTasks').querySelectorAll('thead th')].map(h => h.textContent);
  check('task table carries the unbilled column', tHeads.includes('Unbilled'), tHeads.join('|'));

  // ---- moving the date recomputes and persists ----
  g.$('#rqDate').value = '2026-07-31';
  g.$('#rqDate').dispatchEvent(new w.Event('change'));
  check('date change persists on the project', meta._rqDate === '2026-07-31');
  const q2 = g.rqBuild();
  check('later date pulls in July on both sides', Math.round(q2.earned) === 7100 && q2.inv === 6800,
    q2.earned + '/' + q2.inv);
  check('reconciles within tolerance at the later date', Math.abs(q2.earned - q2.inv) === 300);
  meta._rqDate = '2026-06-30';

  // ---- undated invoice warning ----
  meta._bills.push({ id: 'i5', invoice: 'INV-005', amount: 500, date: '', status: 'Paid' });
  g.renderBillingTab();
  check('undated invoices counted and flagged', /no invoice date/.test(g.$('#rqVerdict').textContent)
    && /\$500/.test(g.$('#rqVerdict').textContent), g.$('#rqVerdict').textContent);
  const q3 = g.rqBuild();
  check('undated invoice included in the total', q3.inv === 6300, q3.inv);
  meta._bills.pop();

  // ---- default cut-off falls back sensibly ----
  delete meta._rqDate;
  const q4 = g.rqBuild();
  check('default cut-off = latest real invoice date', q4.cutS === '2026-07-20', q4.cutS);

  // ---- Excel export round-trips the numbers ----
  meta._rqDate = '2026-06-30';
  let wbOut = null;
  const realWrite = w.XLSX.write;
  w.XLSX.write = (wb, o) => { const r = realWrite(wb, o); wbOut = r; return r; };
  alerts.length = 0;
  g.exportRevQcXlsx();
  w.XLSX.write = realWrite;
  check('Excel export writes clean', !!wbOut && !alerts.length, alerts.join('/'));
  if (wbOut) {
    const wb = w.XLSX.read(new Uint8Array(wbOut), { type: 'array' });
    const grid = w.XLSX.utils.sheet_to_json(wb.Sheets['Revenue QC'], { header: 1, defval: '' });
    const find = lbl => grid.find(r => r[0] === lbl);
    check('export carries earned / invoiced / gap', find('Earned revenue')[1] === 6100 && find('Invoiced (submitted + paid)')[1] === 5800
      && find('Gap (earned − invoiced)')[1] === 300, [find('Earned revenue')[1], find('Invoiced (submitted + paid)')[1]].join('/'));
    check('export has the monthly section', grid.some(r => r[0] === '2026-05' && r[1] === 2000));
    check('export has the task section', grid.some(r => /Design/.test(r[0]) && r[1] === 5000));
  }

  report();
}
function report() {
  console.log('\nPASS (' + ok.length + ')'); ok.forEach(s => console.log('  ✓ ' + s));
  if (fail.length) { console.log('\nFAIL (' + fail.length + ')'); fail.forEach(s => console.log('  ✗ ' + s)); process.exit(1); }
  console.log('\nALL GOOD'); process.exit(0);
}
