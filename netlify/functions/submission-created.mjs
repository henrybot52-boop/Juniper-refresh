// Netlify invokes a function with this exact name on every form submission.
// When a Resend API key is configured, look book sign-ups get their copy by
// email immediately — signed hello@, with the flip-reader link — so someone
// who fills the form on their phone still has the book on their laptop later.
//
// Without RESEND_API_KEY this does nothing (the studio's Leads tab and the
// hello@ notification hook are unaffected either way).

export default async (req) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return new Response('email disabled', { status: 200 });

  let payload;
  try { payload = (await req.json()).payload; } catch { return new Response('bad payload', { status: 200 }); }
  if (!payload || payload.form_name !== 'lookbook') return new Response('ignored', { status: 200 });

  const d = payload.data || {};
  const first = String(d.name || '').trim().split(/\s+/)[0] || 'there';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'Juniper Floral Studio <hello@juniperfloralstudio.com>',
      to: [d.email],
      reply_to: 'hello@juniperfloralstudio.com',
      subject: 'Your Juniper look book',
      html: `
<div style="font-family:Georgia,serif;color:#2f2a26;max-width:34rem;margin:0 auto;line-height:1.7">
  <p>Hi ${first},</p>
  <p>Here's the look book — it reads best in the flip-through version:</p>
  <p style="margin:1.6rem 0">
    <a href="https://juniperfloralstudio.com/lookbook/view/"
       style="background:#2f2a26;color:#faf8f4;padding:12px 28px;text-decoration:none;letter-spacing:.12em;font-size:13px;text-transform:uppercase">
      Read the look book</a>
  </p>
  <p>Or <a href="https://juniperfloralstudio.com/lookbook/juniper-look-book.pdf" style="color:#8b7d5e">download the PDF</a> to keep.</p>
  <p>If a date is circled on your calendar, hit reply and tell us about it — we take on a
     limited number of weddings each season and we're happy to say honestly whether yours is open.</p>
  <p>— Kate<br>Juniper Floral Studio · Austin, TX<br>
     <a href="https://juniperfloralstudio.com" style="color:#8b7d5e">juniperfloralstudio.com</a></p>
</div>`,
    }),
  });
  return new Response(r.ok ? 'sent' : 'send failed', { status: 200 });
};
