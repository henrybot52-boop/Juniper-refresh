import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const SITE = '/home/user/Juniper-refresh/site';
const SP = process.env.SP;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(SITE, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(8902, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:8902/lookbook/', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: SP + '/lookbook-page.png', fullPage: false });
await browser.close(); server.close();
console.log('shot saved');
