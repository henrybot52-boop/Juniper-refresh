// Local test of the look book flip viewer: serve site/ statically with the
// test PDF in place, drive the viewer, flip pages, screenshot.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const SITE = '/home/user/Juniper-refresh/site';
const SP = process.env.SP;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.webp': 'image/webp' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/lookbook/juniper-look-book.pdf') {
    const b = fs.readFileSync(SP + '/test-lookbook.pdf');
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': b.length });
    return res.end(req.method === 'HEAD' ? undefined : b);
  }
  let file = path.join(SITE, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('nope'); }
  const b = fs.readFileSync(file);
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(b);
});
await new Promise((r) => server.listen(8901, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:8901/lookbook/view/', { waitUntil: 'domcontentloaded' });

// wait for render to finish (status removed) then flip twice
await page.waitForSelector('#status', { state: 'detached', timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: SP + '/flip-cover.png' });
await page.click('#next'); await page.waitForTimeout(1400);
await page.click('#next'); await page.waitForTimeout(1400);
await page.screenshot({ path: SP + '/flip-spread.png' });
console.log('pageno after 2 flips:', await page.textContent('#pageno'));
// wait for background rendering to finish, confirm position survived updates
await page.waitForFunction(() => !document.getElementById('pageno').textContent.includes('loading'), null, { timeout: 120000 });
console.log('pageno after full load:', await page.textContent('#pageno'));
for (let i = 0; i < 3; i++) { await page.click('#next'); await page.waitForTimeout(900); }
console.log('pageno after 3 more flips:', await page.textContent('#pageno'));

// missing-PDF path: block the PDF and reload
await page.route('**/juniper-look-book.pdf', (r) => r.fulfill({ status: 404, body: '' }));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
console.log('missing-pdf message:', (await page.textContent('#status')).replace(/\s+/g, ' ').trim().slice(0, 120));

await browser.close();
server.close();
