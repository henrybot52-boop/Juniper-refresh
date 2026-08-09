import { getStore } from '@netlify/blobs';

// Connects the studio to Pinterest with WRITE access.
//
// The "Generate token" button on Pinterest's developer page only ever issues
// read-only tokens (pins:read, boards:read, user_accounts:read) — write scopes
// are granted exclusively through the OAuth consent flow, where the account
// owner approves the app in their own browser. This function is both ends of
// that flow:
//
//   Start:    /pinterest-oauth?key=<studio password>
//             → redirects to Pinterest's consent screen asking for write scopes
//   Callback: /pinterest-oauth?code=...&state=...
//             → exchanges the code for an access + refresh token, saved in Blobs
//
// pinterest.mjs prefers the Blobs token over the env one and refreshes it
// automatically, so this is a connect-once affair.
//
// Requires PINTEREST_APP_ID and PINTEREST_APP_SECRET in the environment, and
// this function's URL added under "Redirect URIs" on the Pinterest app page:
//   https://juniperfloralstudio.com/.netlify/functions/pinterest-oauth

const REDIRECT_URI = 'https://juniperfloralstudio.com/.netlify/functions/pinterest-oauth';
const SCOPES = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';

const page = (title, body, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="font-family:system-ui,sans-serif;background:#faf8f4;color:#2f2a26;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px">
<div style="max-width:26rem;text-align:center;line-height:1.6">
<h1 style="font-size:1.3rem">${title}</h1><p>${body}</p></div></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );

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
  const url = new URL(req.url);
  const appId = process.env.PINTEREST_APP_ID;
  const appSecret = process.env.PINTEREST_APP_SECRET;
  if (!appId || !appSecret) {
    return page('Not configured', 'PINTEREST_APP_ID and PINTEREST_APP_SECRET need setting in Netlify first.', 503);
  }
  const store = getStore('instagram');

  const code = url.searchParams.get('code');
  if (!code) {
    // Start of the flow — gated by the studio password so only we can initiate.
    if (!keyOk(url.searchParams.get('key'))) return page('Unauthorised', 'The key in the link is missing or wrong.', 401);
    const state = crypto.randomUUID();
    await store.setJSON('pinterest-oauth-state', { state, at: Date.now() });
    const auth = new URL('https://www.pinterest.com/oauth/');
    auth.searchParams.set('client_id', appId);
    auth.searchParams.set('redirect_uri', REDIRECT_URI);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('state', state);
    return Response.redirect(auth.toString(), 302);
  }

  // Callback from Pinterest.
  const saved = await store.get('pinterest-oauth-state', { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!saved || saved.state !== url.searchParams.get('state') || Date.now() - saved.at > 15 * 60 * 1000) {
    return page('Something went stale', 'This link has expired — start again from the connect link.', 400);
  }
  await store.delete('pinterest-oauth-state').catch(() => {});

  const r = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${appId}:${appSecret}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    return page('Pinterest said no', `The token exchange failed: ${d.message || d.error || r.status}. Try the connect link again.`, 502);
  }

  await store.setJSON('pinterest-token', {
    access_token: d.access_token,
    refresh_token: d.refresh_token || null,
    scope: d.scope || SCOPES,
    expiresAt: Date.now() + (d.expires_in || 0) * 1000,
    refreshExpiresAt: d.refresh_token_expires_in ? Date.now() + d.refresh_token_expires_in * 1000 : null,
  });

  const canWrite = /pins:write/.test(d.scope || '');
  return page(
    canWrite ? 'Pinterest connected' : 'Connected, but read-only',
    canWrite
      ? 'Write access granted — pinning from the studio works now. You can close this tab.'
      : `Pinterest granted only: ${d.scope}. Write scopes are missing, so pinning will still be refused — this usually means the app's access tier does not allow them yet.`,
  );
};
