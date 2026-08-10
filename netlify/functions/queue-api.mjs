import { getStore } from '@netlify/blobs';
import queueData from '../ig-queue.json' with { type: 'json' };
import { publish, MAX_CAROUSEL, MIN_CAROUSEL } from '../lib/ig-publish.mjs';
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
  const carousels = (await store.get('carousels', { type: 'json', consistency: 'strong' }).catch(() => null)) || [];
  // Carousels sit in the same list as single photos so approving, captioning,
  // posting and history all work on them without a parallel code path.
  const base = [...carousels, ...uploads, ...(queueData.queue || [])];
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
    const all = merge();
    const items = all.filter((i) => !i.images);
    return json({
      items,
      carousels: all.filter((i) => i.images),
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

    // Group photos from one wedding into a swipeable carousel. Instagram ranks
    // saves far above likes, and a set someone can swipe through is what earns
    // them — a single image rarely does.
    if (action === 'createCarousel') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length < MIN_CAROUSEL) return json({ error: `Pick at least ${MIN_CAROUSEL} photos.` }, 400);
      if (ids.length > MAX_CAROUSEL) return json({ error: `Instagram allows at most ${MAX_CAROUSEL} photos.` }, 400);
      const picked = ids.map((i) => base.find((q) => q.id === i && !q.images)).filter(Boolean);
      if (picked.length !== ids.length) return json({ error: 'unknown-id' }, 404);
      if (picked.some((p) => postedIds.has(p.id))) return json({ error: 'One of those has already posted on its own.' }, 409);

      const car = {
        id: 'car-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        wedding: picked[0].wedding,
        images: picked.map((p) => p.image),
        memberIds: picked.map((p) => p.id),
        caption: String(body.caption || picked[0].caption || '').slice(0, 2200),
        at: new Date().toISOString(),
      };
      await store.setJSON('carousels', [car, ...carousels]);

      // The members must not also go out on their own.
      for (const p of picked) overrides[p.id] = { ...(overrides[p.id] || {}), status: 'skipped', inCarousel: car.id };
      await store.setJSON('overrides', overrides);
      return json({ ok: true, carousel: car });
    }

    if (action === 'deleteCarousel') {
      const car = carousels.find((c) => c.id === id);
      if (!car) return json({ error: 'unknown-id' }, 404);
      if (postedIds.has(id)) return json({ error: 'already-posted' }, 409);
      await store.setJSON('carousels', carousels.filter((c) => c.id !== id));
      // Release the photos back into the queue.
      for (const mid of car.memberIds || []) {
        if (overrides[mid]?.inCarousel === car.id) {
          const o = { ...overrides[mid] };
          delete o.inCarousel;
          o.status = 'pending';
          overrides[mid] = o;
        }
      }
      await store.setJSON('overrides', overrides);
      return json({ ok: true });
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
