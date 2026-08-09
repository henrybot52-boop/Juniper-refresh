import { getStore } from '@netlify/blobs';
import queueData from '../ig-queue.json' with { type: 'json' };

// Back end for the /studio approval page.
//
// The committed queue file is the source of the photo list; anything the studio
// changes (approve, skip, edited caption) lives in Blobs as an override, so
// approvals don't need a redeploy and survive one.
//
// Every request must carry the shared studio password in x-studio-key. It is
// compared here on the server — the browser never sees the Instagram token, and
// a visitor who finds the URL can't read or change anything without the key.

const IG_USER_ID = '28726583660262417';
const GRAPH = 'https://graph.instagram.com/v21.0';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// length-independent comparison so timing doesn't leak the password
function keyOk(supplied) {
  const expected = process.env.STUDIO_PASSWORD || '';
  if (!expected) return false;
  const a = String(supplied || '');
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function publish(item, token) {
  const createRes = await fetch(`${GRAPH}/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: item.image, caption: item.caption, access_token: token }),
  });
  const created = await createRes.json();
  if (created.error || !created.id) throw new Error(created.error?.message || 'could not stage the image');

  const pubRes = await fetch(`${GRAPH}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: created.id, access_token: token }),
  });
  const published = await pubRes.json();
  if (published.error || !published.id) throw new Error(published.error?.message || 'could not publish');
  return published.id;
}

export default async (req) => {
  if (!process.env.STUDIO_PASSWORD) return json({ error: 'not-configured' }, 500);
  if (!keyOk(req.headers.get('x-studio-key'))) return json({ error: 'unauthorised' }, 401);

  const store = getStore('instagram');
  const overrides = (await store.get('overrides', { type: 'json' }).catch(() => null)) || {};
  const state = (await store.get('post-state', { type: 'json' }).catch(() => null)) || { index: 0, history: [] };
  const base = queueData.queue || [];
  const postedIds = new Set((state.history || []).map((h) => h.id));

  const merge = () => base.map((q) => {
    const o = overrides[q.id] || {};
    return {
      ...q,
      caption: o.caption ?? q.caption,
      status: postedIds.has(q.id) ? 'posted' : (o.status || 'pending'),
      postedAt: (state.history || []).find((h) => h.id === q.id)?.at || null,
      edited: o.caption != null,
    };
  });

  if (req.method === 'GET') {
    const items = merge();
    return json({
      items,
      postingEnabled: String(process.env.IG_POSTING_ENABLED).toLowerCase() === 'true',
      counts: ['posted', 'approved', 'pending', 'skipped'].reduce((a, s) => {
        a[s] = items.filter((i) => i.status === s).length; return a;
      }, {}),
    });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }
    const { action, id, status, caption } = body || {};

    if (action === 'update') {
      const item = base.find((q) => q.id === id);
      if (!item) return json({ error: 'unknown-id' }, 404);
      if (postedIds.has(id)) return json({ error: 'already-posted' }, 409);
      const o = { ...(overrides[id] || {}) };
      if (status) {
        if (!['pending', 'approved', 'skipped'].includes(status)) return json({ error: 'bad-status' }, 400);
        o.status = status;
      }
      if (caption != null) o.caption = String(caption).slice(0, 2200);   // Instagram's caption limit
      overrides[id] = o;
      await store.setJSON('overrides', overrides);
      return json({ ok: true, id, ...o });
    }

    // bulk approve/skip — the page sends every visible id at once
    if (action === 'bulk') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!['pending', 'approved', 'skipped'].includes(status)) return json({ error: 'bad-status' }, 400);
      let n = 0;
      for (const i of ids) {
        if (!base.some((q) => q.id === i) || postedIds.has(i)) continue;
        overrides[i] = { ...(overrides[i] || {}), status };
        n++;
      }
      await store.setJSON('overrides', overrides);
      return json({ ok: true, updated: n });
    }

    if (action === 'postNow') {
      const item = merge().find((q) => q.id === id);
      if (!item) return json({ error: 'unknown-id' }, 404);
      if (item.status === 'posted') return json({ error: 'already-posted' }, 409);
      const stored = await store.get('token', { type: 'json' }).catch(() => null);
      const token = stored?.value || process.env.IG_ACCESS_TOKEN;
      if (!token) return json({ error: 'no-token' }, 500);
      try {
        const postId = await publish(item, token);
        state.history = [...(state.history || []), { id: item.id, postId, at: Date.now() }].slice(-200);
        await store.setJSON('post-state', state);
        return json({ ok: true, postId });
      } catch (e) {
        return json({ error: e.message }, 502);
      }
    }

    return json({ error: 'unknown-action' }, 400);
  }

  return json({ error: 'method' }, 405);
};
