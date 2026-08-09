import { getStore } from '@netlify/blobs';
import queueData from '../ig-queue.json' with { type: 'json' };

// Posts the next queued portfolio photo to Instagram.
//
// SAFETY: this does nothing until IG_POSTING_ENABLED is set to "true" in the
// Netlify environment. Until then it runs in dry-run mode and only logs what it
// would have posted, so the schedule can be watched for a cycle or two before
// anything reaches a public business account.

const IG_USER_ID = '28726583660262417';   // @juniperfloralstudio
const GRAPH = 'https://graph.instagram.com/v21.0';

async function getToken(store) {
  const stored = await store.get('token', { type: 'json' }).catch(() => null);
  return stored?.value || process.env.IG_ACCESS_TOKEN;
}

export default async () => {
  const store = getStore('instagram');
  const enabled = String(process.env.IG_POSTING_ENABLED).toLowerCase() === 'true';

  // Strong consistency so a stale read can't republish something already sent.
  const state = (await store.get('post-state', { type: 'json', consistency: 'strong' }).catch(() => null)) || { index: 0, history: [] };
  const overrides = (await store.get('overrides', { type: 'json', consistency: 'strong' }).catch(() => null)) || {};
  const queue = queueData.queue || [];
  const postedIds = new Set((state.history || []).map((h) => h.id));

  // Only publish what someone approved on the /studio page, in queue order.
  // Nothing goes out on the strength of being next in line alone.
  const item = queue
    .filter((q) => !postedIds.has(q.id) && overrides[q.id]?.status === 'approved')
    .map((q) => ({ ...q, caption: overrides[q.id]?.caption ?? q.caption }))[0];

  if (!item) {
    console.log('ig-post: nothing approved and waiting — approve posts at /studio');
    return new Response('nothing approved', { status: 200 });
  }

  if (!enabled) {
    console.log(`ig-post DRY RUN (IG_POSTING_ENABLED not set): would post approved item ` +
      `${item.id} -> ${item.image}\ncaption: ${item.caption.split('\n')[0]}`);
    return new Response(`dry-run: would post ${item.id}`, { status: 200 });
  }

  const token = await getToken(store);
  if (!token) { console.error('ig-post: no access token'); return new Response('no token', { status: 500 }); }

  try {
    // 1. stage the image in a container
    const createRes = await fetch(`${GRAPH}/${IG_USER_ID}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ image_url: item.image, caption: item.caption, access_token: token }),
    });
    const created = await createRes.json();
    if (created.error || !created.id) {
      console.error('ig-post: container failed:', JSON.stringify(created.error || created));
      return new Response('container failed', { status: 500 });
    }

    // 1b. a container isn't publishable the moment it's created — publishing
    //     immediately fails with "Media ID is not available"
    let ready = false;
    for (let i = 0; i < 8 && !ready; i++) {
      const s = await (await fetch(`${GRAPH}/${created.id}?fields=status_code&access_token=${token}`)).json();
      if (s.status_code === 'FINISHED') { ready = true; break; }
      if (s.status_code === 'ERROR') {
        console.error('ig-post: Instagram could not process', item.image);
        return new Response('image rejected', { status: 500 });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!ready) {
      console.error('ig-post: container still processing, will retry next run');
      return new Response('still processing', { status: 500 });
    }

    // 2. publish it
    const pubRes = await fetch(`${GRAPH}/${IG_USER_ID}/media_publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: created.id, access_token: token }),
    });
    const published = await pubRes.json();
    if (published.error || !published.id) {
      console.error('ig-post: publish failed:', JSON.stringify(published.error || published));
      // don't advance the index — the same item retries next run
      return new Response('publish failed', { status: 500 });
    }

    // 3. only record it once publishing actually succeeded, so a failure
    //    leaves the item approved and it retries on the next run
    state.history = [...(state.history || []), { id: item.id, postId: published.id, at: Date.now() }].slice(-200);
    await store.setJSON('post-state', state);

    console.log(`ig-post: published ${item.id} as ${published.id}`);
    return new Response(`posted ${item.id}`, { status: 200 });
  } catch (e) {
    console.error('ig-post: error', e.message);
    return new Response('error', { status: 500 });
  }
};

// Tuesdays and Fridays, 9am Austin (CDT = UTC-5) -> 14:00 UTC.
export const config = { schedule: '0 14 * * 2,5' };
