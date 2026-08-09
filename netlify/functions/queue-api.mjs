import { getStore } from '@netlify/blobs';
import queueData from '../ig-queue.json' with { type: 'json' };
import captionPools from '../captions.json' with { type: 'json' };

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

// A container is not publishable the instant it is created, even though the
// create call returns an id. Publishing straight away fails with "Media ID is
// not available", so wait for Instagram to report the image processed.
async function waitForContainer(id, token, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${GRAPH}/${id}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR') throw new Error('Instagram could not process this image.');
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('Instagram is still processing the image. Try again in a moment.');
}

async function publish(item, token) {
  // Instagram publishes JPEG and nothing else. Catch it here with a message a
  // human can act on, rather than letting Meta return an opaque media error.
  if (!/\.jpe?g$/i.test(new URL(item.image).pathname)) {
    throw new Error('Instagram only accepts JPEG images, and this one is not a .jpg — swap the photo for a JPEG version.');
  }

  const createRes = await fetch(`${GRAPH}/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: item.image, caption: item.caption, access_token: token }),
  });
  const created = await createRes.json();
  if (created.error || !created.id) throw new Error(created.error?.message || 'could not stage the image');

  await waitForContainer(created.id, token);

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
  // Strong consistency: an eventually-consistent read here can miss a post that
  // just went out, which would show it as still approved and invite a duplicate.
  const overrides = (await store.get('overrides', { type: 'json', consistency: 'strong' }).catch(() => null)) || {};
  const state = (await store.get('post-state', { type: 'json', consistency: 'strong' }).catch(() => null)) || { index: 0, history: [] };
  // Photos added through the studio live in Blobs and sit at the FRONT of the
  // queue — freshly added work is what you want going out next, not something
  // from two years ago.
  const uploads = (await store.get('uploads', { type: 'json', consistency: 'strong' }).catch(() => null)) || [];
  const base = [...uploads, ...(queueData.queue || [])];
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
      captionPools,
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

    // Record something already published (posted by hand, or recovered after a
    // publish that succeeded but whose bookkeeping didn't). Without this the
    // item stays approved and the scheduler would post it a second time.
    if (action === 'markPosted') {
      const item = base.find((q) => q.id === id);
      if (!item) return json({ error: 'unknown-id' }, 404);
      if (postedIds.has(id)) return json({ ok: true, already: true });
      state.history = [...(state.history || []), { id, postId: body.postId || null, at: body.at || Date.now() }].slice(-200);
      await store.setJSON('post-state', state);
      return json({ ok: true, id });
    }

    // Store an uploaded photo and put it at the front of the queue. The browser
    // has already resized it and re-encoded it as JPEG, so what arrives here is
    // always a format Instagram accepts.
    if (action === 'addPhoto') {
      const { dataUrl, caption: cap, label } = body;
      const m = /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
      if (!m) return json({ error: 'expected a JPEG data URL' }, 400);
      const bytes = Buffer.from(m[1], 'base64');
      if (bytes.length > 8 * 1024 * 1024) return json({ error: 'image too large' }, 413);

      const pid = 'up-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      await getStore('photos').set(pid, bytes);

      const entry = {
        id: pid,
        wedding: String(label || 'added').slice(0, 60),
        image: `https://juniperfloralstudio.com/p/${pid}.jpg`,
        size: '',
        caption: cap || captionPools.flowers[0],
        posted: false,
      };
      const list = [entry, ...uploads];
      await store.setJSON('uploads', list);
      return json({ ok: true, id: pid, image: entry.image });
    }

    // Remove an uploaded photo from the queue (does not touch posted history).
    if (action === 'removePhoto') {
      const list = uploads.filter((u) => u.id !== id);
      if (list.length === uploads.length) return json({ error: 'unknown-id' }, 404);
      await store.setJSON('uploads', list);
      await getStore('photos').delete(id).catch(() => {});
      return json({ ok: true });
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
