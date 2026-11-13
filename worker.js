import PAGE from "./page.js";
import { validateRsvp, tallyDays, safeEqual } from "./lib.js";
import { renderResults } from "./results.js";

const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEC_HEADERS } });
const html = (body, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SEC_HEADERS } });

async function allRecords(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.RSVP.list({ prefix: "rsvp:", cursor });
    const vals = await Promise.all(page.keys.map((k) => env.RSVP.get(k.name, "json")));
    for (const v of vals) if (v) out.push(v);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  out.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const key = url.searchParams.get("k") || "";
    const isAdmin = () => safeEqual(key, env.ADMIN_KEY || "");

    if (pathname === "/" && request.method === "GET") return html(PAGE);

    if (pathname === "/api/rsvp" && request.method === "POST") {
      const text = await request.text();
      if (text.length > 4000) return json({ ok: false, error: "Request too large." }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
      const v = validateRsvp(body);
      if (!v.ok) return json(v, 400);
      const k = "rsvp:" + v.value.id;
      const prev = await env.RSVP.get(k, "json");
      const now = new Date().toISOString();
      await env.RSVP.put(k, JSON.stringify({ ...v.value, createdAt: prev?.createdAt || now, updatedAt: now }));
      return json({ ok: true });
    }

    if (pathname === "/api/results" && request.method === "GET") {
      if (!isAdmin()) return json({ ok: false, error: "Missing or wrong key." }, 403);
      const records = await allRecords(env);
      return json({ ok: true, records, ...tallyDays(records) });
    }

    if (pathname === "/results/delete" && request.method === "POST") {
      if (!isAdmin()) return html("Missing or wrong key.", 403);
      const form = await request.formData();
      const id = String(form.get("id") || "");
      if (/^[A-Za-z0-9-]{8,64}$/.test(id)) await env.RSVP.delete("rsvp:" + id);
      return Response.redirect(`${url.origin}/results?k=${encodeURIComponent(key)}`, 303);
    }

    if (pathname === "/results" && request.method === "GET") {
      if (!isAdmin()) return html("<!doctype html><meta charset=utf-8><title>Results</title><p style='font-family:system-ui;padding:24px'>This page needs the organiser's key.</p>", 403);
      const records = await allRecords(env);
      return html(renderResults(records, key));
    }

    return html("<!doctype html><meta charset=utf-8><p style='font-family:system-ui;padding:24px'>Page not found. <a href='/'>Go to the invitation</a></p>", 404);
  },
};
