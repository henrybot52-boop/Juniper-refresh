// smoke test: load the sample extract and render every tab, failing on any thrown error
const fs = require('fs');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync('forecast-tool/oracle-project-forecast.html', 'utf8');
const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => ({});
w.Chart = function (c, cfg) { this.cfg = cfg; }; w.Chart.prototype.destroy = function () {};
w.alert = () => {}; w.confirm = () => true;
const errs = [];
setTimeout(() => { try { run(); } catch (e) { console.error('THREW:', e.stack); process.exit(1); } }, 300);
function run() {
  w.eval(`window.__t = { get data(){return data}, state, FIELDS, parseDateVal, recomputePeriods, switchTab, buildAllFilterbars, $, $$ };`);
  const g = w.__t;
  const csv = fs.readFileSync('forecast-tool/sample-data/oracle-extract-sample.csv', 'utf8');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = splitCsv(lines[0]); const idx = {};
  for (const f of g.FIELDS) { const i = head.findIndex(h => h.trim().toLowerCase() === f.label.toLowerCase()); if (i >= 0) idx[f.key] = i; }
  const rows = lines.slice(1).map(l => { const c = splitCsv(l), o = {};
    for (const f of g.FIELDS) { const v = idx[f.key] == null ? '' : c[idx[f.key]];
      o[f.key] = f.type === 'num' ? (Number(String(v).replace(/[$,()]/g, '')) || 0) : (f.type === 'date' ? g.parseDateVal(v) : String(v || '').trim()); }
    return o; });
  g.data.length = 0; g.data.push(...rows);
  console.log('loaded', g.data.length, 'sample rows');
  g.recomputePeriods(); g.buildAllFilterbars();
  const uniq = [...new Set([...g.$$('button[data-tab]')].map(b => b.dataset.tab))];
  console.log('tabs:', uniq.join(', '));
  for (const t of uniq) { try { g.switchTab(t); } catch (e) { errs.push(t + ': ' + e.message); } }
  for (const m of ['base', 'work']) { try { g.state.settings.ppMode = m; g.switchTab('pplan'); } catch (e) { errs.push('pplan/' + m + ': ' + e.message); } }
  if (errs.length) { console.log('\nERRORS:'); errs.forEach(e => console.log('  x ' + e)); process.exit(1); }
  console.log('\nALL TABS RENDER CLEAN'); process.exit(0);
}
function splitCsv(line) { const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i];
    if (q) { if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out; }
