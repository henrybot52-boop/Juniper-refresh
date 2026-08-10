// Publishing to Instagram, shared by the scheduler (ig-post) and the studio's
// "Post now" (queue-api) so the two can never drift apart.
//
// Two shapes go through here:
//   single    { image, caption }
//   carousel  { images: [url, ...2-10], caption }
//
// A carousel is three round trips rather than one: every photo is staged as a
// child container, those ids are gathered into a parent container, and only the
// parent gets published. Carousels are worth the extra work — a swipeable set
// of one wedding earns saves, and saves are what Instagram actually ranks on.

export const IG_USER_ID = '28726583660262417';   // @juniperfloralstudio
export const GRAPH = 'https://graph.instagram.com/v21.0';

export const MAX_CAROUSEL = 10;
export const MIN_CAROUSEL = 2;

// A container is not publishable the instant it is created, even though the
// create call returns an id. Publishing straight away fails with "Media ID is
// not available", so wait for Instagram to report the image processed.
export async function waitForContainer(id, token, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${GRAPH}/${id}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR') throw new Error('Instagram could not process this image.');
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('Instagram is still processing the image. Try again in a moment.');
}

function assertJpeg(url) {
  // Instagram publishes JPEG and nothing else. Catch it here with a message a
  // human can act on, rather than letting Meta return an opaque media error.
  if (!/\.jpe?g$/i.test(new URL(url).pathname)) {
    throw new Error('Instagram only accepts JPEG images, and one of these is not a .jpg — swap it for a JPEG version.');
  }
}

async function createContainer(params, token) {
  const r = await fetch(`${GRAPH}/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, access_token: token }),
  });
  const d = await r.json();
  if (d.error || !d.id) throw new Error(d.error?.message || 'could not stage the image');
  return d.id;
}

export async function publish(item, token) {
  const images = Array.isArray(item.images) && item.images.length ? item.images : null;
  let parentId;

  if (images) {
    if (images.length < MIN_CAROUSEL) throw new Error('A carousel needs at least two photos.');
    if (images.length > MAX_CAROUSEL) throw new Error('Instagram allows at most ten photos in one carousel.');
    images.forEach(assertJpeg);

    const children = [];
    for (const url of images) {
      const id = await createContainer({ image_url: url, is_carousel_item: 'true' }, token);
      await waitForContainer(id, token);
      children.push(id);
    }
    parentId = await createContainer(
      { media_type: 'CAROUSEL', children: children.join(','), caption: item.caption },
      token,
    );
  } else {
    assertJpeg(item.image);
    parentId = await createContainer({ image_url: item.image, caption: item.caption }, token);
  }

  await waitForContainer(parentId, token);

  const pubRes = await fetch(`${GRAPH}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: parentId, access_token: token }),
  });
  const published = await pubRes.json();
  if (published.error || !published.id) throw new Error(published.error?.message || 'could not publish');
  return published.id;
}

// Approved carousels post ahead of approved singles: they are deliberately
// curated, so when one is ready it should be the next thing the feed shows.
export function nextApproved(carousels, queue, overrides, postedIds) {
  const withOverride = (x) => ({ ...x, caption: overrides[x.id]?.caption ?? x.caption });
  const car = (carousels || [])
    .filter((c) => !postedIds.has(c.id) && overrides[c.id]?.status === 'approved')
    .map(withOverride);
  if (car.length) return car[0];
  return (queue || [])
    .filter((q) => !postedIds.has(q.id) && overrides[q.id]?.status === 'approved')
    .map(withOverride)[0];
}
