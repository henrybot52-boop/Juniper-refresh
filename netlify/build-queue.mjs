// Builds the Instagram posting queue from the portfolio photos already on the site.
//
//   node netlify/build-queue.mjs
//
// Photos are served publicly from juniperfloralstudio.com, which is what the
// Instagram API needs (it fetches by URL — it can't take an upload).
// Output: netlify/ig-queue.json (machine) + netlify/QUEUE.md (human review).

import fs from 'fs';
import path from 'path';

const SITE = path.join(process.cwd(), 'site');
const IMAGES = path.join(SITE, 'images');
const BASE = 'https://juniperfloralstudio.com';
const MIN_PX = 1080;          // Instagram renders anything smaller as soft

// --- jpeg/webp dimensions without a dependency -------------------------------
function dimensions(file) {
  const d = fs.readFileSync(file);
  if (d[0] === 0xff && d[1] === 0xd8) {                    // jpeg
    let i = 2;
    while (i < d.length - 9) {
      if (d[i] !== 0xff) { i++; continue; }
      const m = d[i + 1];
      if (m >= 0xc0 && m <= 0xc3) return { w: d.readUInt16BE(i + 7), h: d.readUInt16BE(i + 5) };
      if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + d.readUInt16BE(i + 2);
    }
  }
  if (d.slice(0, 4).toString() === 'RIFF' && d.slice(8, 12).toString() === 'WEBP') {
    const t = d.slice(12, 16).toString();
    if (t === 'VP8X') return { w: (d.readUIntLE(24, 3) & 0xffffff) + 1, h: (d.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (t === 'VP8 ') return { w: d.readUInt16LE(26) & 0x3fff, h: d.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') {
      const b = d.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

// --- captions ----------------------------------------------------------------
// Voice: Studio McGee — understated, sensory, sentence case, no exclamation
// pile-ups, no emoji. Short declaratives that trust the photograph.
//
// These are written to be true of ANY of the portfolio images (palette, craft,
// process, philosophy) rather than naming specific arrangements, because a
// caption describing bud vases under a bouquet close-up reads as careless.
// Swap in specific lines per photo where you want them — QUEUE.md is the place.
const CAPTIONS = [
  'Soft palettes, and just enough green to keep them honest.',
  'The kind of arrangement that looks gathered rather than arranged.',
  'Texture does the work here. The palette stays quiet.',
  'We build them to look like they grew there.',
  'Blush and ivory, with a little movement through the middle.',
  'Restraint is the hardest part of this job. Also the best part.',
  'Garden roses hold their shape all day. Worth every penny.',
  'A palette that shifts with the light, from ceremony through last dance.',
  'Greenery, candlelight, and not much else.',
  'The details you notice on the second look.',
  'Neutrals are never actually neutral. There are a dozen shades in here.',
  'Designed to frame the moment, never to compete with it.',
  'Loose, low, and a little wild. Our favourite brief.',
  'White on white, softened at the edges.',
  'Every stem placed by hand, the morning of.',
  'Colour lives in the details when the palette stays soft.',
  'Structure underneath, softness on top. That is the whole trick.',
  'A little asymmetry keeps things from feeling stiff.',
  'The best compliment we get is that it looked effortless.',
  'Seasonal, local where we can, always at its peak.',
  'Warm tones read beautifully once the sun drops.',
  'Built to be photographed, made to be lived around.',
  'Quiet palettes let the room speak.',
  'Layers of ivory, cream, and something almost pink.',
  'This is what months of planning looks like on the day.',
  'Fresh from the cooler at 6am, in place by noon.',
  'Depth comes from texture, not from adding more colour.',
  'A ceremony moment worth standing still for.',
  'Understated, and all the better for it.',
  'The greenery matters as much as the blooms.',
  'Balance is the goal. Symmetry rarely is.',
  'Soft light and softer edges.',
  'We keep coming back to this palette for a reason.',
  'Simple, considered, and finished properly.',
  'Something about the way these catch the afternoon light.',
  'It should feel like it belongs to the room, not like it arrived in a van.',
  'Held together with wire, ribbon, and a lot of coffee.',
  'The palette was set months before the first stem was cut.',
  'Full without being heavy. That balance takes practice.',
  'Blooms chosen for how they age through the day, not just how they open.',
];

// A small, deliberately short tag block. Studio McGee barely uses hashtags —
// these are here because the account is relaunching in a new market and needs
// to be findable in Austin. Delete the line if you want the purer look.
const TAGS = '\n\n#austinwedding #austinweddingflorist #hillcountrywedding #texaswedding #weddingflorals #juniperfloralstudio';

// --- collect photos ----------------------------------------------------------
const weddings = [];
for (const dir of fs.readdirSync(IMAGES).sort()) {
  const full = path.join(IMAGES, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  const photos = [];
  for (const f of fs.readdirSync(full).sort()) {
    // JPEG only — Instagram's publishing API rejects everything else
    // ("JPEG is the only image format supported"). The .webp originals have
    // .jpg twins alongside them for this reason; the site still serves the webp.
    if (!/\.jpe?g$/i.test(f)) continue;
    const file = path.join(full, f);
    let dim = null;
    try { dim = dimensions(file); } catch { /* unreadable header — skip below */ }
    if (!dim) continue;
    const tooSmall = dim.w < MIN_PX && dim.h < MIN_PX;
    photos.push({ url: `${BASE}/images/${dir}/${f}`, w: dim.w, h: dim.h, tooSmall });
  }
  if (photos.length) weddings.push({ wedding: dir, photos });
}

const usable = weddings.map((w) => ({ ...w, photos: w.photos.filter((p) => !p.tooSmall) }))
  .filter((w) => w.photos.length);
const skipped = weddings.flatMap((w) => w.photos.filter((p) => p.tooSmall));

// Interleave weddings so the feed doesn't run six photos of one wedding in a
// row — round-robin, taking one from each wedding per pass.
const queue = [];
let pass = 0, ci = 0;
for (;;) {
  let added = 0;
  for (const w of usable) {
    if (pass >= w.photos.length) continue;
    const p = w.photos[pass];
    queue.push({
      id: `${w.wedding}-${pass + 1}`,
      wedding: w.wedding,
      image: p.url,
      size: `${p.w}x${p.h}`,
      caption: CAPTIONS[ci++ % CAPTIONS.length] + TAGS,
      posted: false,
    });
    added++;
  }
  if (!added) break;
  pass++;
}

fs.writeFileSync(path.join('netlify', 'ig-queue.json'), JSON.stringify({ createdAt: null, queue }, null, 2));

// human-readable review file
const perWeek = 2;
let md = `# Instagram queue\n\n`;
md += `${queue.length} posts from ${usable.length} weddings — about ${Math.round(queue.length / perWeek)} weeks at ${perWeek} posts/week.\n`;
md += `${skipped.length} photos skipped as too small for Instagram (under ${MIN_PX}px on both sides).\n\n`;
md += `This file is generated for reading. To change what gets posted, edit \`netlify/ig-queue.json\` — `;
md += `captions there are what actually publish. Re-running the builder regenerates both and resets edits.\n\n`;
md += `| # | Wedding | Caption | Photo |\n|---|---|---|---|\n`;
queue.forEach((q, i) => {
  md += `| ${i + 1} | ${q.wedding} | ${q.caption.split('\n')[0]} | [${q.size}](${q.image}) |\n`;
});
fs.writeFileSync(path.join('netlify', 'QUEUE.md'), md);

console.log(`queue: ${queue.length} posts from ${usable.length} weddings`);
console.log(`skipped (too small): ${skipped.length}`);
console.log(`at ${perWeek}/week that is ~${Math.round(queue.length / perWeek)} weeks of content`);
