// Generates a realistic mock Oracle project-cost extract for demoing the
// forecasting tool. Produces oracle-extract-sample.xlsx and .csv with the
// exact 35 column headings of the weekly Oracle export.
// Run: node generate-sample-data.js
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// deterministic PRNG so the sample is reproducible
let seed = 42;
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function round2(v) { return Math.round(v * 100) / 100; }

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// Extract covers JUN-25 .. JUN-26; JUN-26 is partial (extract run 10-Jun-2026)
const periods = [];
for (let i = 0; i < 13; i++) {
  const y = 2025 + Math.floor((5 + i) / 12);
  const m = (5 + i) % 12; // 0-based; starts at June
  periods.push({ y, m, name: MONTHS[m] + '-' + String(y).slice(2), idx: i, partial: i === 12 });
}

// Each project tells a different forecasting story.
// shape(i) returns a monthly spend multiplier for month index i (0..12).
const projects = [
  { num: '700123', name: 'Lakeview WTP Phase 2 Design', pm: 'Jordan Arafat', div: 'Water', sub: 'Treatment', cc: 'CC-4101',
    base: 118000, mix: { labor: .72, subs: .16, exp: .12 }, shape: i => 0.92 + rand() * 0.16 },
  { num: '700248', name: 'SR-417 Widening PD&E Study', pm: 'Maria Delgado', div: 'Transportation', sub: 'Highways', cc: 'CC-4205',
    base: 95000, mix: { labor: .60, subs: .28, exp: .12 }, shape: i => 0.35 + 0.085 * i + rand() * 0.08 },
  { num: '700301', name: 'Coastal Bridge Inspection Program', pm: 'Jordan Arafat', div: 'Transportation', sub: 'Bridges', cc: 'CC-4210',
    base: 84000, mix: { labor: .55, subs: .25, exp: .20 }, shape: i => Math.max(0.15, 1.25 - 0.085 * i + rand() * 0.08) },
  { num: '700415', name: 'Downtown Stormwater Master Plan', pm: 'Sam Whitfield', div: 'Water', sub: 'Stormwater', cc: 'CC-4112',
    base: 38000, mix: { labor: .82, subs: .08, exp: .10 }, shape: i => 0.9 + rand() * 0.2 },
  { num: '700502', name: 'Airport APM Guideway Rehab', pm: 'Maria Delgado', div: 'Transportation', sub: 'Aviation', cc: 'CC-4230',
    base: 76000, mix: { labor: .30, subs: .60, exp: .10 }, shape: i => (i % 3 === 1 ? 1.55 : 0.65) + rand() * 0.2 },
  { num: '700610', name: 'Regional Trail Feasibility Study', pm: 'Sam Whitfield', div: 'Transportation', sub: 'Planning', cc: 'CC-4205',
    base: 52000, mix: { labor: .75, subs: .10, exp: .15 }, shape: i => i < 8 ? 0 : 0.45 + 0.18 * (i - 8) + rand() * 0.08 },
];

const topTasks = [
  ['1.0', 'Project Management'],
  ['2.0', 'Data Collection & Survey'],
  ['3.0', 'Analysis & Design'],
  ['4.0', 'Deliverables & Reports'],
  ['5.0', 'Field Services'],
];
const subTaskNames = { '1.0': ['Admin', 'Meetings & Coordination'], '2.0': ['Survey', 'Utility Locates'],
  '3.0': ['Modeling', 'Design Development'], '4.0': ['Draft Report', 'Final Report'], '5.0': ['Inspection', 'CEI Support'] };

const staff = [
  { name: 'Smith, Alice', num: 'E10231', rate: 78, cc: 'CC-4101', fh: 'Home' },
  { name: 'Jones, Robert', num: 'E10342', rate: 64, cc: 'CC-4101', fh: 'Home' },
  { name: 'Chen, Wei', num: 'E10455', rate: 92, cc: 'CC-4205', fh: 'Home' },
  { name: 'Patel, Devi', num: 'E10518', rate: 71, cc: 'CC-4205', fh: 'Home' },
  { name: 'Garcia, Luis', num: 'E10677', rate: 58, cc: 'CC-4210', fh: 'Field' },
  { name: 'Nguyen, Thao', num: 'E10742', rate: 66, cc: 'CC-4210', fh: 'Field' },
  { name: 'Brown, Marcus', num: 'E10803', rate: 85, cc: 'CC-4112', fh: 'Home' },
  { name: "O'Neill, Kate", num: 'E10911', rate: 74, cc: 'CC-4112', fh: 'Home' },
  { name: 'Kowalski, Jan', num: 'E11024', rate: 61, cc: 'CC-4230', fh: 'Field' },
  { name: 'Rivera, Sofia', num: 'E11138', rate: 88, cc: 'CC-4230', fh: 'Home' },
];
const vendors = ['GeoTech Drilling LLC', 'Apex Survey Partners', 'TransCore ITS Inc', 'BlueWater Environmental', 'Stratus Aerial Imaging'];
const expTypes = ['Travel & Lodging', 'Mileage', 'Reproduction', 'Field Supplies', 'Software & Data'];

let txId = 31400550;
const rows = [];

function addRow(p, period, task, sub, type, who, vals, comment) {
  const day = period.partial ? 1 + Math.floor(rand() * 7) : 1 + Math.floor(rand() * 27);
  const txDate = new Date(period.y, period.m, day);
  const glDate = new Date(period.y, period.m, Math.min(day + Math.floor(rand() * 3), period.partial ? 9 : 28));
  // last two months not yet invoiced
  const billed = period.idx < 11 && rand() > 0.08;
  const billable = rand() > 0.06;
  rows.push({
    'Business Unit': 'USA Infrastructure',
    'Division': p.div,
    'Sub Division': p.sub,
    'Cost Center': p.cc,
    'Project Manager': p.pm,
    'Project Number': p.num,
    'Project Name': p.name,
    'Employee/Vendor': who.name,
    'Employee #': who.num || '',
    'Employee Cost Center': who.cc || '',
    'Journal Name': (type === 'Timecard' ? 'PA Labor Cost ' : type === 'Supplier Invoice' ? 'AP Supplier Cost ' : 'PA Expense Cost ') + period.name,
    'Task Manager': p.pm,
    'Top Task Number': task[0],
    'Top Task Name': task[1],
    'Task Number': task[0].replace('.0', '') + '.' + sub.n,
    'Task Name': sub.name,
    'Field/Home': who.fh || 'Home',
    'Transaction Type': type,
    'Expenditure Org': 'US-Southeast Engineering',
    'Expenditure/Event Type': vals.expType,
    'Period Name': period.name,
    'GL Date': glDate,
    'Transaction Date': txDate,
    'Transaction ID': String(txId++),
    'Hours': vals.hours || 0,
    'Salaries': round2(vals.sal || 0),
    'Fringe': round2(vals.fringe || 0),
    'Subs Cost': round2(vals.subs || 0),
    'Expenses Cost': round2(vals.exp || 0),
    'Oncost': round2(vals.oncost || 0),
    'Total Cost': round2((vals.sal || 0) + (vals.fringe || 0) + (vals.subs || 0) + (vals.exp || 0) + (vals.oncost || 0)),
    'Bill Flag': billable ? 'Y' : 'N',
    'Billed Status': billed ? 'Billed' : 'Unbilled',
    'Invoice Number': billed ? 'INV-' + p.num.slice(3) + '-' + String(period.idx + 14).padStart(3, '0') : '',
    'Comments': comment || '',
  });
}

for (const p of projects) {
  for (const period of periods) {
    let factor = p.shape(period.idx);
    if (factor <= 0) continue;
    if (period.partial) factor *= 0.24; // extract run on the 10th — partial month
    const target = p.base * factor;
    const laborTarget = target * p.mix.labor;
    const subsTarget = target * p.mix.subs;
    const expTarget = target * p.mix.exp;

    // labor: spread over several staff/task timecards
    let laborLeft = laborTarget;
    const nCards = period.partial ? 4 : 7 + Math.floor(rand() * 5);
    for (let i = 0; i < nCards && laborLeft > 500; i++) {
      const emp = pick(staff);
      const task = pick(topTasks);
      const sub = { n: 1 + Math.floor(rand() * 2), name: pick(subTaskNames[task[0]]) };
      const maxH = Math.min(80, laborLeft / emp.rate);
      const hours = Math.round(Math.min(8 + rand() * 64, maxH) * 2) / 2;
      const sal = hours * emp.rate;
      const fringe = sal * 0.38;
      const oncost = (sal + fringe) * 0.045;
      laborLeft -= sal;
      addRow(p, period, task, sub, 'Timecard', emp,
        { hours, sal, fringe, oncost, expType: emp.fh === 'Field' ? 'Field Staff Labor' : 'Professional Staff Labor' });
    }
    // subs: 1-3 supplier invoices
    let subsLeft = subsTarget;
    const nSubs = subsTarget > 1000 ? 1 + Math.floor(rand() * 3) : 0;
    for (let i = 0; i < nSubs; i++) {
      const amt = i === nSubs - 1 ? subsLeft : subsLeft * (0.3 + rand() * 0.4);
      subsLeft -= amt;
      if (amt < 200) continue;
      addRow(p, period, ['3.0', 'Analysis & Design'], { n: 2, name: 'Design Development' },
        'Supplier Invoice', { name: pick(vendors), num: '', cc: '', fh: 'Field' },
        { subs: amt, oncost: amt * 0.045, expType: 'Subconsultant Services' });
    }
    // expenses: 2-5 expense reports
    let expLeft = expTarget;
    const nExp = expTarget > 400 ? 2 + Math.floor(rand() * 4) : 0;
    for (let i = 0; i < nExp; i++) {
      const amt = i === nExp - 1 ? expLeft : expLeft * (0.2 + rand() * 0.4);
      expLeft -= amt;
      if (amt < 25) continue;
      const emp = pick(staff);
      addRow(p, period, ['2.0', 'Data Collection & Survey'], { n: 1, name: 'Survey' },
        'Expense Report', emp, { exp: amt, oncost: amt * 0.045, expType: pick(expTypes) });
    }
    // occasional negative cost-transfer correction
    if (!period.partial && rand() < 0.18) {
      const emp = pick(staff);
      const sal = -(200 + rand() * 1200);
      addRow(p, period, ['1.0', 'Project Management'], { n: 1, name: 'Admin' }, 'Cost Transfer', emp,
        { hours: round2(sal / emp.rate), sal, fringe: sal * 0.38, oncost: (sal * 1.38) * 0.045, expType: 'Professional Staff Labor' },
        'Timesheet correction — prior period hours adjusted');
    }
  }
}

rows.sort((a, b) => a['GL Date'] - b['GL Date'] || a['Project Number'].localeCompare(b['Project Number']));

const headers = Object.keys(rows[0]);
const ws = XLSX.utils.json_to_sheet(rows, { header: headers, cellDates: true });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Project Cost Detail');
XLSX.writeFile(wb, path.join(__dirname, 'oracle-extract-sample.xlsx'), { cellDates: true });

const fmtDate = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => {
  let v = r[h];
  if (v instanceof Date) v = fmtDate(v);
  v = v == null ? '' : String(v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}).join(','))).join('\r\n');
fs.writeFileSync(path.join(__dirname, 'oracle-extract-sample.csv'), csv);

const total = rows.reduce((a, r) => a + r['Total Cost'], 0);
console.log(`Wrote ${rows.length} rows, total cost $${Math.round(total).toLocaleString()}`);
console.log('Periods: ' + periods.map(p => p.name).join(', '));
