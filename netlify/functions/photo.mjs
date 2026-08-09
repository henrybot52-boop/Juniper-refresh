import { getStore } from '@netlify/blobs';

// Serves an uploaded photo at a public URL.
//
// Instagram fetches images by URL — it can't take an upload, and it can't read
// Google Drive links (those are permission-gated HTML, not image bytes). So
// photos added through the studio are stored in Blobs and served from here.
//
// Reachable as /p/<id>.jpg via a redirect rule, which is what goes to Instagram.

export default async (req) => {
  const url = new URL(req.url);
  // accept /p/<id>.jpg, /.netlify/functions/photo/<id>, or ?id=<id>
  const id = (url.searchParams.get('id') || url.pathname.split('/').pop() || '')
    .replace(/\.jpe?g$/i, '');

  if (!/^[a-z0-9-]{6,64}$/i.test(id)) return new Response('bad id', { status: 400 });

  const store = getStore('photos');
  const blob = await store.get(id, { type: 'arrayBuffer' }).catch(() => null);
  if (!blob) return new Response('not found', { status: 404 });

  return new Response(blob, {
    headers: {
      'content-type': 'image/jpeg',
      // immutable: an id always maps to the same bytes
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
