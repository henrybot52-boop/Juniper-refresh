import { getStore } from '@netlify/blobs';

// Serves the latest Instagram posts to the homepage feed row.
// The access token never reaches the browser — it stays here on the server.
// Results are cached so a burst of visitors doesn't burn through the API quota.

const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const WANT = 8;                 // photos shown in the homepage row
const FETCH = 40;               // pull extra so filtering still leaves enough
const CACHE_MINUTES = 30;

// Only show posts that look like floral work. The account also carries the
// occasional unrelated post; without this a non-floral post could lead the
// row on a wedding-florist homepage. Empty list = show everything.
const REQUIRE_ANY = ['#juniperfloralstudio', '#weddingflorals', '#floral', '#wedding', '#bloom', '#flowers'];

const isFloral = (post) => {
  if (!REQUIRE_ANY.length) return true;
  const c = (post.caption || '').toLowerCase();
  return REQUIRE_ANY.some((t) => c.includes(t));
};

// Videos/reels have no still image of their own — use their thumbnail.
const imageFor = (p) => (p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url) || p.thumbnail_url || p.media_url;

export default async () => {
  const store = getStore('instagram');
  // ig-refresh.mjs writes the rotated token here; the env var is the seed/fallback
  const stored = await store.get('token', { type: 'json' }).catch(() => null);
  const token = stored?.value || process.env.IG_ACCESS_TOKEN;

  const respond = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        // let the CDN serve it, and keep serving the stale copy while revalidating
        'cache-control': `public, max-age=${CACHE_MINUTES * 60}, stale-while-revalidate=86400`,
      },
    });

  if (!token) return respond({ posts: [], error: 'not-configured' });

  // fresh-enough cache? serve it and skip the API entirely
  try {
    const cached = await store.get('feed', { type: 'json' });
    if (cached && Date.now() - cached.at < CACHE_MINUTES * 60 * 1000 && cached.posts?.length) {
      return respond({ posts: cached.posts, cached: true });
    }
  } catch { /* cache is an optimisation — never fail the request over it */ }

  try {
    const url = `https://graph.instagram.com/v21.0/me/media?fields=${FIELDS}&limit=${FETCH}&access_token=${token}`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.error) {
      // Token expired or revoked: fall back to the last good copy rather than
      // leaving a hole in the page.
      const stale = await store.get('feed', { type: 'json' }).catch(() => null);
      if (stale?.posts?.length) return respond({ posts: stale.posts, stale: true });
      return respond({ posts: [], error: data.error.message || 'instagram-error' });
    }

    const all = data.data || [];
    const floral = all.filter(isFloral);
    // if the filter is too aggressive (e.g. captions stop using tags), fall back
    // to unfiltered rather than showing an empty row
    const chosen = (floral.length >= WANT ? floral : all).slice(0, WANT);

    const posts = chosen.map((p) => ({
      id: p.id,
      image: imageFor(p),
      permalink: p.permalink,
      caption: (p.caption || '').split('\n')[0].slice(0, 140),
      timestamp: p.timestamp,
      isVideo: p.media_type === 'VIDEO',
    })).filter((p) => p.image);

    if (posts.length) await store.setJSON('feed', { at: Date.now(), posts }).catch(() => {});
    return respond({ posts });
  } catch (e) {
    const stale = await store.get('feed', { type: 'json' }).catch(() => null);
    if (stale?.posts?.length) return respond({ posts: stale.posts, stale: true });
    return respond({ posts: [], error: String(e.message || e) });
  }
};
