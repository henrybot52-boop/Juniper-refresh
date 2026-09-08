import { getStore } from '@netlify/blobs';
import queueData from '../ig-queue.json' with { type: 'json' };
import { publish, nextApproved } from '../lib/ig-publish.mjs';

// Posts the next queued portfolio photo to Instagram.
//
// SAFETY: this does nothing until IG_POSTING_ENABLED is set to "true" in the
// Netlify environment. Until then it runs in dry-run mode and only logs what it
// would have posted, so the schedule can be watched for a cycle or two before
// anything reaches a public business account.

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
  const carousels = (await store.get('carousels', { type: 'json', consistency: 'strong' }).catch(() => null)) || [];
  const queue = queueData.queue || [];
  const postedIds = new Set((state.history || []).map((h) => h.id));

  // Only publish what someone approved on the /studio page. Nothing goes out on
  // the strength of being next in line alone.
  const item = nextApproved(carousels, queue, overrides, postedIds);

  if (!item) {
    console.log('ig-post: nothing approved and waiting — approve posts at /studio');
    return new Response('nothing approved', { status: 200 });
  }

  if (!enabled) {
    const what = item.images ? `carousel of ${item.images.length}` : item.image;
    console.log(`ig-post DRY RUN (IG_POSTING_ENABLED not set): would post approved item ` +
      `${item.id} -> ${what}\ncaption: ${item.caption.split('\n')[0]}`);
    return new Response(`dry-run: would post ${item.id}`, { status: 200 });
  }

  const token = await getToken(store);
  if (!token) { console.error('ig-post: no access token'); return new Response('no token', { status: 500 }); }

  try {
    const postId = await publish(item, token);

    // Only record it once publishing actually succeeded, so a failure leaves
    // the item approved and it retries on the next run.
    state.history = [...(state.history || []), { id: item.id, postId, at: Date.now() }].slice(-200);
    await store.setJSON('post-state', state);

    console.log(`ig-post: published ${item.id} as ${postId}`);
    return new Response(`posted ${item.id}`, { status: 200 });
  } catch (e) {
    console.error('ig-post: error', e.message);
    return new Response('error', { status: 500 });
  }
};

// Steady cadence: Tuesdays and Fridays at 9am Austin (CDT = UTC-5) -> 14:00 UTC.
// The launch-period daily burst ('0 14 * * *') ended once the grid was refilled;
// twice a week keeps the queue alive for about a year.
export const config = { schedule: '0 14 * * 2,5' };
