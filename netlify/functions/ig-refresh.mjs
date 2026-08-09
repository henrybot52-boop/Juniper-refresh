import { getStore } from '@netlify/blobs';

// Instagram long-lived tokens expire 60 days after issue. Refreshing one
// returns a fresh 60-day token, so a weekly run keeps the feed alive
// indefinitely without anyone touching the Meta dashboard.
//
// The refreshed token is written to Netlify Blobs. The env var IG_ACCESS_TOKEN
// stays as the seed/fallback; instagram.mjs prefers the stored one when present.

export default async () => {
  const store = getStore('instagram');
  const current = (await store.get('token', { type: 'json' }).catch(() => null))?.value
    || process.env.IG_ACCESS_TOKEN;

  if (!current) {
    console.error('ig-refresh: no token available');
    return new Response('no token', { status: 500 });
  }

  const url = `https://graph.instagram.com/v21.0/refresh_access_token?grant_type=ig_refresh_token&access_token=${current}`;
  const r = await fetch(url);
  const data = await r.json();

  if (data.error || !data.access_token) {
    // Refresh fails if the token is already expired or was revoked — that needs
    // a human to regenerate it in the Meta dashboard, so make it loud in the logs.
    console.error('ig-refresh FAILED:', JSON.stringify(data.error || data));
    return new Response('refresh failed', { status: 500 });
  }

  const days = Math.round((data.expires_in || 0) / 86400);
  await store.setJSON('token', { value: data.access_token, at: Date.now(), expiresInDays: days });
  console.log(`ig-refresh: ok, token good for ~${days} days`);
  return new Response(`refreshed, ~${days} days`, { status: 200 });
};

// Weekly. Tokens must be >24h old to refresh, and a 60-day life means a weekly
// cadence has ~8 chances to succeed before anything could lapse.
export const config = { schedule: '@weekly' };
