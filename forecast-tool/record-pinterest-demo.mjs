// Records the Pinterest standard-access demo video: the studio logging in,
// opening the pinning queue, and creating a pin (via ?sandbox=1, so the pin
// is created for real against Pinterest's API Sandbox as their review asks).
//
// The sandbox proxy blocks Chromium's own networking, so every request is
// relayed through curl (which is proxy-configured) and fulfilled into the page.
import { chromium } from 'playwright-core';
import { spawn } from 'child_process';
import fs from 'fs';

const OUT = process.argv[2] || '/tmp/demo-video';
const PW = fs.readFileSync(process.env.SP + '/.studiopw', 'utf8').trim();

// Async relay — a blocking relay starves Playwright's control connection
// while the page's ~135 images download, and every wait times out.
function curlBuf(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('curl', args);
    const out = [], err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('close', () => {
      const buf = Buffer.concat(out);
      buf.length ? resolve(buf) : reject(new Error('curl empty: ' + Buffer.concat(err)));
    });
    if (input) p.stdin.write(input);
    p.stdin.end();
  });
}

async function relay(req) {
  const args = ['-sS', '-i', '--max-time', '30', '-X', req.method()];
  const h = req.headers();
  for (const k of ['content-type', 'x-studio-key']) if (h[k]) args.push('-H', `${k}: ${h[k]}`);
  args.push('-H', 'accept-encoding: identity');
  const body = req.postDataBuffer();
  if (body) args.push('--data-binary', '@-');
  args.push(req.url());
  let buf = await curlBuf(args, body);
  // The proxy's "HTTP/1.1 200 Connection Established" preamble (and any 1xx
  // continuation blocks) precede the real response headers — skip them.
  let sep = buf.indexOf('\r\n\r\n');
  while (sep > -1) {
    const first = buf.slice(0, buf.indexOf('\r\n')).toString('utf8');
    if (/Connection Established/i.test(first) || /^HTTP\/[\d.]+ 1\d\d/.test(first)) {
      buf = buf.slice(sep + 4);
      sep = buf.indexOf('\r\n\r\n');
      continue;
    }
    break;
  }
  const head = buf.slice(0, sep).toString('utf8').split('\r\n');
  const status = parseInt(head[0].split(' ')[1], 10) || 200;
  const headers = {};
  for (const line of head.slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  delete headers['content-length']; delete headers['content-encoding']; delete headers['transfer-encoding'];
  return { status, headers, body: buf.slice(sep + 4) };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
const page = await ctx.newPage();
await page.route('**/*', async (route) => {
  try { await route.fulfill(await relay(route.request())); }
  catch (e) { await route.abort().catch(() => {}); }
});

await page.goto('https://juniperfloralstudio.com/studio/?sandbox=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Log in like a human would
await page.click('input[type=password]');
await page.type('input[type=password]', PW, { delay: 90 });
await page.waitForTimeout(600);
await page.keyboard.press('Enter');

// Grid loads — let the reviewer see the app: banner + photo cards
try {
  await page.waitForSelector('.card', { timeout: 30000 });
} catch (e) {
  await page.screenshot({ path: process.env.SP + '/demo-fail.png' });
  console.log('BODY:', (await page.evaluate(() => document.body.innerText)).slice(0, 500));
  throw e;
}
await page.waitForTimeout(3000);
await page.mouse.wheel(0, 500); await page.waitForTimeout(1500);
await page.mouse.wheel(0, -500); await page.waitForTimeout(1200);

// Open the pinning queue
await page.evaluate(() => {
  for (const b of document.querySelectorAll('#filters button')) if (b.textContent.startsWith('To pin')) b.click();
});
await page.waitForTimeout(2000);

// Open the Pinterest panel on the first card and pick the flagship board
const card = page.locator('.card').first();
await card.locator('details summary').click();
await page.waitForTimeout(1500);
await card.locator('label', { hasText: 'Austin & Hill Country Wedding Flowers' }).locator('input').check();
await page.waitForTimeout(1200);
await card.locator('details').scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

// Pin it — sandbox mode creates the pin for real against api-sandbox
await card.locator('button', { hasText: 'Pin to selected boards' }).click();
await card.locator('button', { hasText: /^Pinned$/ }).waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);

await ctx.close();
await browser.close();
const file = fs.readdirSync(OUT).find((f) => f.endsWith('.webm'));
console.log('VIDEO:' + OUT + '/' + file);
