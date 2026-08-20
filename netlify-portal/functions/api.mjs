import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const SECRET = process.env.SIGNING_SECRET || "insecure-dev-secret-change-me";
const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || "";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const store = () => getStore("proposals");

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}
function b64u(buf) { return Buffer.from(buf).toString("base64url"); }
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + mac;
}
function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}
function cookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function studioAuthed(req) {
  const p = verify(cookie(req, "sess"));
  return !!(p && p.role === "studio");
}
function clientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
    ""
  ).trim();
}
function constEq(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function newToken() { return crypto.randomBytes(18).toString("base64url"); }
function sha256(s) { return crypto.createHash("sha256").update(s || "").digest("hex"); }
function cookieHeader(value, maxAge) {
  return `sess=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;
  const s = store();

  try {
    // ---------- studio auth ----------
    if (path === "/api/studio-login" && method === "POST") {
      if (!STUDIO_PASSWORD) return json({ error: "Portal not configured yet (no studio password set)." }, 500);
      const { password } = await req.json().catch(() => ({}));
      if (!password || !constEq(password, STUDIO_PASSWORD)) return json({ error: "Incorrect password." }, 401);
      const tok = sign({ role: "studio", exp: Date.now() + SESSION_MS });
      return json({ ok: true }, 200, { "set-cookie": cookieHeader(tok, 604800) });
    }
    if (path === "/api/studio-logout" && method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
    }
    if (path === "/api/session" && method === "GET") {
      return json({ authed: studioAuthed(req) });
    }

    // ---------- studio: list proposals ----------
    if (path === "/api/proposals" && method === "GET") {
      if (!studioAuthed(req)) return json({ error: "Unauthorized" }, 401);
      const { blobs } = await s.list();
      const out = [];
      for (const bl of blobs) {
        const p = await s.get(bl.key, { type: "json", consistency: "strong" });
        if (!p) continue;
        out.push({
          token: p.token,
          names: p.couple?.names || "",
          email: p.couple?.email || "",
          weddingDate: p.couple?.weddingDate || "",
          venue: p.couple?.venue || "",
          total: p.quote?.total || 0,
          status: p.status,
          createdAt: p.createdAt,
          signedAt: p.signature?.at || null,
          signedBy: p.signature?.name || null,
        });
      }
      out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return json({ proposals: out });
    }

    // ---------- studio: create proposal ----------
    if (path === "/api/proposals" && method === "POST") {
      if (!studioAuthed(req)) return json({ error: "Unauthorized" }, 401);
      const data = await req.json().catch(() => null);
      if (!data || !data.couple) return json({ error: "Invalid payload" }, 400);
      const tok = newToken();
      const rec = {
        token: tok,
        id: tok,
        createdAt: new Date().toISOString(),
        couple: {
          names: String(data.couple.names || "").slice(0, 200),
          email: String(data.couple.email || "").slice(0, 200),
          weddingDate: String(data.couple.weddingDate || "").slice(0, 40),
          venue: String(data.couple.venue || "").slice(0, 200),
          guests: String(data.couple.guests || "").slice(0, 20),
        },
        quote: data.quote || {},
        contractText: String(data.contractText || "").slice(0, 20000),
        status: "sent",
        events: [{ type: "created", at: new Date().toISOString() }],
        signature: null,
      };
      await s.setJSON(tok, rec);
      return json({ ok: true, token: tok, url: `${url.origin}/portal.html?t=${tok}` });
    }

    // ---------- studio: delete proposal ----------
    if (path === "/api/proposal" && method === "DELETE") {
      if (!studioAuthed(req)) return json({ error: "Unauthorized" }, 401);
      const t = url.searchParams.get("token");
      if (t) await s.delete(t);
      return json({ ok: true });
    }

    // ---------- couple: fetch proposal (public, token-gated) ----------
    if (path === "/api/proposal" && method === "GET") {
      const t = url.searchParams.get("token");
      if (!t) return json({ error: "Missing token" }, 400);
      const p = await s.get(t, { type: "json", consistency: "strong" });
      if (!p) return json({ error: "This link isn't valid. Please check with your florist." }, 404);
      if (p.status === "sent") {
        p.status = "viewed";
        p.events.push({ type: "viewed", at: new Date().toISOString(), ip: clientIp(req) });
        await s.setJSON(t, p);
      }
      return json({
        proposal: {
          names: p.couple.names,
          weddingDate: p.couple.weddingDate,
          venue: p.couple.venue,
          guests: p.couple.guests,
          quote: p.quote,
          contractText: p.contractText,
          status: p.status,
          signature: p.signature ? { name: p.signature.name, at: p.signature.at } : null,
        },
      });
    }

    // ---------- couple: sign (public, token-gated) ----------
    if (path === "/api/sign" && method === "POST") {
      const t = url.searchParams.get("token");
      if (!t) return json({ error: "Missing token" }, 400);
      const p = await s.get(t, { type: "json", consistency: "strong" });
      if (!p) return json({ error: "This link isn't valid." }, 404);
      if (p.signature) return json({ ok: true, already: true, signature: { name: p.signature.name, at: p.signature.at } });
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || "").trim();
      if (!name) return json({ error: "Please type your full name to sign." }, 400);
      if (body.consent !== true) return json({ error: "Please tick the box to agree before signing." }, 400);
      p.signature = {
        name: name.slice(0, 200),
        at: new Date().toISOString(),
        ip: clientIp(req),
        agent: String(req.headers.get("user-agent") || "").slice(0, 300),
        contractHash: sha256(p.contractText),
      };
      p.status = "accepted";
      p.events.push({ type: "signed", at: p.signature.at, ip: p.signature.ip });
      await s.setJSON(t, p);
      return json({ ok: true, signature: { name: p.signature.name, at: p.signature.at } });
    }

    // ---------- quote drafts: short shareable prefill links ----------
    if (path === "/api/draft" && method === "POST") {
      if (!studioAuthed(req)) return json({ error: "Unauthorized" }, 401);
      const data = await req.json().catch(() => null);
      if (!data || typeof data !== "object") return json({ error: "Invalid payload" }, 400);
      const t = newToken();
      const drafts = getStore("drafts");
      await drafts.setJSON(t, { data, createdAt: new Date().toISOString() });
      return json({ ok: true, token: t, url: `${url.origin}/?draft=${t}` });
    }
    if (path === "/api/draft" && method === "GET") {
      const t = url.searchParams.get("token");
      if (!t) return json({ error: "Missing token" }, 400);
      const drafts = getStore("drafts");
      const rec = await drafts.get(t, { type: "json", consistency: "strong" });
      if (!rec) return json({ error: "This quote link wasn't found — it may have been deleted. Ask for a fresh one." }, 404);
      return json({ draft: rec.data });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: "Server error", detail: String((e && e.message) || e) }, 500);
  }
};

export const config = { path: "/api/*" };
