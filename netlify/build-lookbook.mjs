// Turns the look book PDF into web-ready page images.
//
//   node netlify/build-lookbook.mjs [path-to-source.pdf]
//
// Why not just serve the PDF: the reader would download the whole file plus
// ~1.4MB of pdf.js before showing anything, then rasterise 50+ pages in the
// browser. With a print-resolution source that becomes minutes of waiting and
// hundreds of megabytes of memory. Rendering here instead means the browser
// downloads only the spreads someone actually looks at, at exactly the
// resolution their screen can show.
//
// Output: site/lookbook/pages/p001@{850,1700}.webp + pages.json

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SRC = process.argv[2] || 'site/lookbook/juniper-look-book.pdf';
const OUT = 'site/lookbook/pages';
const WIDTHS = [850, 1700];   // ~1100px and ~2200px tall on a 8.5x11 page
const RENDER_SCALE = 3.2;     // pdfium scale; ~230dpi source before downsampling

if (!fs.existsSync(SRC)) { console.error('no such pdf:', SRC); process.exit(1); }
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Render each page to a PNG with pdfium (via python), then let sharp do the
// resizing and WebP encoding — sharp's resampling is far better than asking
// the rasteriser for a small size directly.
const tmp = fs.mkdtempSync('/tmp/lb-');
const meta = JSON.parse(execFileSync('python3', ['-c', `
import pypdfium2 as pdfium, json, sys
doc = pdfium.PdfDocument(${JSON.stringify(SRC)})
out = []
for i in range(len(doc)):
    img = doc[i].render(scale=${RENDER_SCALE}).to_pil().convert('RGB')
    p = "${tmp}/p%03d.png" % (i + 1)
    img.save(p)
    out.append({"page": i + 1, "w": img.width, "h": img.height, "file": p})
print(json.dumps({"pages": out}))
`], { maxBuffer: 64 * 1024 * 1024 }).toString());

const pages = [];
let total = 0;
for (const p of meta.pages) {
  const name = 'p' + String(p.page).padStart(3, '0');
  for (const w of WIDTHS) {
    const dest = path.join(OUT, `${name}@${w}.webp`);
    await sharp(p.file).resize({ width: w, withoutEnlargement: true })
      .webp({ quality: w > 1000 ? 80 : 82, effort: 5 })
      .toFile(dest);
    total += fs.statSync(dest).size;
  }
  pages.push({ n: p.page, w: p.w, h: p.h });
  fs.rmSync(p.file);
}
fs.rmSync(tmp, { recursive: true, force: true });

const manifest = {
  count: pages.length,
  ratio: +(pages[0].w / pages[0].h).toFixed(4),
  widths: WIDTHS,
  // Bumped on every rebuild and appended to image URLs, so the pages can be
  // cached hard for a year and a new edition still reaches everyone at once.
  v: Date.now().toString(36),
};
fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify(manifest));

const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
console.log(`${pages.length} pages → ${OUT}`);
console.log(`total on disk: ${mb(total)} (both sizes)`);
console.log(`a reader downloads roughly ${mb(total / WIDTHS.length / pages.length * 2)} per spread`);
