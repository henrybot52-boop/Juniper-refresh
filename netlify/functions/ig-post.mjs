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

  const state = (await store.get('post-state', { type: 'json' }).catch(() => null)) || { index: 0, history: [] };
  const queue = queueData.queue || [];

  if (state.index >= queue.length) {
    console.log('ig-post: queue finished — nothing left to post');
    return new Response('queue empty', { status: 200 });
  }

  const item = queue[state.index];

  if (!enabled) {
    console.log(`ig-post DRY RUN (IG_POSTING_ENABLED not set): would post #${state.index + 1}/${queue.length} ` +
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

    // 3. only advance once publishing actually succeeded
    state.history = [...(state.history || []), { id: item.id, postId: published.id, at: Date.now() }].slice(-100);
    state.index += 1;
    await store.setJSON('post-state', state);

    console.log(`ig-post: published ${item.id} as ${published.id} (${state.index}/${queue.length} done)`);
    return new Response(`posted ${item.id}`, { status: 200 });
  } catch (e) {
    console.error('ig-post: error', e.message);
    return new Response('error', { status: 500 });
  }
};

// Tuesdays and Fridays, 9am Austin (CDT = UTC-5) -> 14:00 UTC.
export const config = { schedule: '0 14 * * 2,5' };
