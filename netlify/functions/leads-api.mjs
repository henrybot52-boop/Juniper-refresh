import { getStore } from '@netlify/blobs';

// The funnel behind /studio's Leads tab. Submissions live in Netlify Forms
// (the permanent record); this function reads them through the Netlify API
// and layers the studio's own pipeline state — stage + notes — from Blobs,
// so nothing here ever rewrites or loses a submission.
//
// GET            → { leads: [...], stages: [...] }
// GET  ?csv=1    → the whole list as a CSV download
// POST {id, stage?, note?} → update pipeline state for one lead

const SITE_ID = '5771283a-3e8b-4462-83e7-df31a4c7f4df';
const STAGES = ['new', 'replied', 'talking', 'booked', 'passed'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function keyOk(supplied) {
  const expected = process.env.STUDIO_PASSWORD || '';
  if (!expected) return false;
  const a = String(supplied || '');
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function fetchSubmissions(token) {
  const forms = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}/forms`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const leads = [];
  for (const form of forms) {
    const subs = await fetch(`https://api.netlify.com/api/v1/forms/${form.id}/submissions?per_page=100`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    for (const s of subs) {
      const d = s.data || {};
      leads.push({
        id: s.id,
        form: form.name,
        name: d.name || '',
        email: d.email || '',
        eventDate: d['event-date'] || d.date || '',
        message: d.message || '',
        at: s.created_at,
      });
    }
  }
  leads.sort((a, b) => new Date(b.at) - new Date(a.at));
  return leads;
}

export default async (req) => {
  if (!keyOk(req.headers.get('x-studio-key'))) return json({ error: 'unauthorised' }, 401);
  const token = process.env.JUNIPER_NETLIFY_TOKEN;
  if (!token) return json({ error: 'not-configured', hint: 'JUNIPER_NETLIFY_TOKEN missing' }, 503);

  const store = getStore('leads');

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }

    // Manually logged leads — WeddingWire, The Knot, Instagram DMs, referrals.
    // They live in Blobs (Netlify Forms only holds real form submissions) and
    // flow through the same pipeline, stages, and CSV as everything else.
    if (body.action === 'add') {
      const { name, email, source, eventDate, message } = body;
      if (!name && !email) return json({ error: 'need at least a name or email' }, 400);
      const manual = (await store.get('manual', { type: 'json', consistency: 'strong' }).catch(() => null)) || [];
      const lead = {
        id: 'man-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        form: String(source || 'other').toLowerCase(),
        name: String(name || ''), email: String(email || ''),
        eventDate: String(eventDate || ''), message: String(message || ''),
        at: new Date().toISOString(),
      };
      manual.unshift(lead);
      await store.setJSON('manual', manual);
      return json({ ok: true, lead });
    }
    if (body.action === 'removeManual') {
      const manual = (await store.get('manual', { type: 'json', consistency: 'strong' }).catch(() => null)) || [];
      await store.setJSON('manual', manual.filter((l) => l.id !== body.id));
      return json({ ok: true });
    }

    const { id, stage, note } = body || {};
    if (!id) return json({ error: 'missing id' }, 400);
    if (stage && !STAGES.includes(stage)) return json({ error: 'unknown stage' }, 400);
    const meta = (await store.get('meta', { type: 'json', consistency: 'strong' }).catch(() => null)) || {};
    meta[id] = { ...(meta[id] || {}) };
    if (stage) meta[id].stage = stage;
    if (note !== undefined) meta[id].note = note;
    meta[id].updatedAt = new Date().toISOString();
    await store.setJSON('meta', meta);
    return json({ ok: true, meta: meta[id] });
  }

  const [formLeads, manual, meta] = await Promise.all([
    fetchSubmissions(token),
    store.get('manual', { type: 'json', consistency: 'strong' }).catch(() => null),
    store.get('meta', { type: 'json', consistency: 'strong' }).catch(() => null),
  ]);
  const leads = [...(manual || []), ...formLeads]
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const m = meta || {};
  for (const l of leads) {
    l.stage = m[l.id]?.stage || 'new';
    l.note = m[l.id]?.note || '';
    l.manual = l.id.startsWith('man-');
  }

  const url = new URL(req.url);
  if (url.searchParams.get('csv')) {
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['submitted', 'source', 'name', 'email', 'event date', 'stage', 'note', 'message']];
    for (const l of leads) rows.push([l.at, l.form, l.name, l.email, l.eventDate, l.stage, l.note, l.message]);
    return new Response(rows.map((r) => r.map(esc).join(',')).join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="juniper-leads.csv"',
        'cache-control': 'no-store',
      },
    });
  }

  return json({ leads, stages: STAGES });
};
