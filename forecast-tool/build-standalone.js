// Builds the fully self-contained (offline) version of the forecasting tool:
// embeds SheetJS and Chart.js into the HTML so the file makes zero network
// requests and can be emailed / opened anywhere.
// Run from forecast-tool/:  npm install --no-save xlsx-js-style chart.js@4.4.1
//                           node build-standalone.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = fs.readFileSync(path.join(root, 'oracle-project-forecast.html'), 'utf8');

function lib(p) {
  // resolve via node_modules directly: chart.js's "exports" map blocks require.resolve on dist files
  const candidates = [path.join(root, 'node_modules', p), path.join(root, '..', 'node_modules', p)];
  const file = candidates.find(f => fs.existsSync(f));
  if (!file) throw new Error('Cannot find ' + p + ' — run: npm install --no-save xlsx@0.18.5 chart.js@4.4.1');
  let js = fs.readFileSync(file, 'utf8');
  // a literal "</script>" inside the JS would terminate the inline tag early;
  // it only ever appears inside string literals, where "<\/" is a safe escape
  js = js.replace(/<\/script/gi, '<\\/script');
  return js;
}

const xlsxJs = lib('xlsx-js-style/dist/xlsx.bundle.js');
const chartJs = lib('chart.js/dist/chart.umd.js');

let out = src
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx[^"]*"[^>]*><\/script>/,
    () => '<script>/* SheetJS 0.18.5 via xlsx-js-style (Apache-2.0) — embedded for offline use, with styled .xlsx output */\n' + xlsxJs + '\n</script>')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js[^"]*"[^>]*><\/script>/,
    () => '<script>/* Chart.js 4.4.1 (MIT) — embedded for offline use */\n' + chartJs + '\n</script>');

if (out.includes('cdn.jsdelivr.net')) throw new Error('CDN reference still present — replacement failed');

out = out.replace('<title>Oracle Project Forecasting Tool</title>',
  '<title>Oracle Project Forecasting Tool (offline)</title>');

const dest = path.join(root, 'oracle-project-forecast-standalone.html');
fs.writeFileSync(dest, out);
console.log('Wrote', dest, (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + ' MB');
