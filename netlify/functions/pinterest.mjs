import { getStore } from '@netlify/blobs';
import queueData from '../ig-queue.json' with { type: 'json' };

// Pinterest side of the studio: list the account's boards, and create pins.
//
// Pins take an image by URL, same as Instagram — so the photos already on the
// site and the ones uploaded through the studio both work with no extra step.
//
// Two things make Pinterest different from Instagram, and the code reflects it:
//   1. A pin carries a destination link. That is the whole point — pins send
//      people to the website, which Instagram refuses to do. Each pin links to
//      that wedding's portfolio page.
//   2. Descriptions are search text, not voice. Pinterest is a search engine;
//      the Studio McGee restraint that works on Instagram is invisible here.
//
// The same photo belongs on several boards (bouquet + palette + location), which
// is normal on Pinterest, so a pin request takes a list of boards.

const API = 'https://api.pinterest.com/v5';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function keyOk(supplied) {
  const expected = process.env.STUDIO_PASSWORD || '';
  if (!expected) return false;
  const a = String(supplied || '');
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// The OAuth flow (pinterest-oauth.mjs) stores a read+write token in Blobs;
// prefer it over the env token, which Pinterest's quick generator only ever
// issues read-only. Access tokens last ~30 days — refresh ahead of expiry so
// the connection survives untouched.
async function getToken(store) {
  const saved = await store.get('pinterest-token', { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!saved) return process.env.PINTEREST_ACCESS_TOKEN || null;
  if (Date.now() < saved.expiresAt - 5 * 60 * 1000) return saved.access_token;
  if (!saved.refresh_token) return process.env.PINTEREST_ACCESS_TOKEN || null;
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refresh_token }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) return null; // refresh dead — reconnect via the OAuth link
  await store.setJSON('pinterest-token', {
    ...saved,
    access_token: d.access_token,
    refresh_token: d.refresh_token || saved.refresh_token,
    expiresAt: Date.now() + (d.expires_in || 0) * 1000,
  });
  return d.access_token;
}

async function pin(token, body) {
  const r = await fetch(`${API}/pins`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || `Pinterest returned ${r.status}`);
  return d;
}

export default async (req) => {
  if (!keyOk(req.headers.get('x-studio-key'))) return json({ error: 'unauthorised' }, 401);

  const store = getStore('instagram');
  const token = await getToken(store);
  if (!token) return json({ error: 'not-connected', hint: 'Connect via the pinterest-oauth link (or set PINTEREST_ACCESS_TOKEN).' }, 503);

  // list the account's boards so the studio can offer them as checkboxes —
  // no board names are hardcoded, whatever exists on the account shows up
  if (req.method === 'GET') {
    const r = await fetch(`${API}/boards?page_size=100`, { headers: { authorization: `Bearer ${token}` } });
    const d = await r.json();
    if (!r.ok) return json({ error: d.message || 'could not list boards' }, 502);
    const pinned = (await store.get('pinned', { type: 'json', consistency: 'strong' }).catch(() => null)) || {};
    return json({
      boards: (d.items || []).map((b) => ({ id: b.id, name: b.name, pinCount: b.pin_count })),
      pinned,
    });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }
    const { id, boardIds, title, description } = body || {};

    const uploads = (await store.get('uploads', { type: 'json', consistency: 'strong' }).catch(() => null)) || [];
    const item = [...uploads, ...(queueData.queue || [])].find((q) => q.id === id);
    if (!item) return json({ error: 'unknown-id' }, 404);
    if (!Array.isArray(boardIds) || !boardIds.length) return json({ error: 'pick at least one board' }, 400);

    // Link the pin at that wedding's portfolio page where one exists, so a pin
    // that catches someone's eye lands them on more of the same work.
    const slug = String(item.wedding || '').replace(/[^a-z0-9-]/gi, '');
    const link = slug && !item.id.startsWith('up-')
      ? `https://juniperfloralstudio.com/portfolio/${slug}/`
      : 'https://juniperfloralstudio.com/portfolio/';

    const results = [];
    for (const boardId of boardIds) {
      try {
        const created = await pin(token, {
          board_id: boardId,
          title: (title || 'Wedding florals by Juniper Floral Studio').slice(0, 100),
          description: (description || '').slice(0, 800),
          link,
          media_source: { source_type: 'image_url', url: item.image },
        });
        results.push({ boardId, ok: true, pinId: created.id });
      } catch (e) {
        results.push({ boardId, ok: false, error: e.message });
      }
    }

    // Record which boards this photo has already gone to, so the studio can grey
    // them out and the same photo isn't pinned twice to the same board.
    const pinned = (await store.get('pinned', { type: 'json', consistency: 'strong' }).catch(() => null)) || {};
    pinned[id] = [...new Set([...(pinned[id] || []), ...results.filter((r) => r.ok).map((r) => r.boardId)])];
    await store.setJSON('pinned', pinned);

    return json({ ok: results.some((r) => r.ok), results, link });
  }

  return json({ error: 'method' }, 405);
};
