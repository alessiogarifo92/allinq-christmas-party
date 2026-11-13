import test from "node:test";
import assert from "node:assert/strict";
import { validateRsvp, tallyDays, normalizeRecord, escapeHtml, safeEqual, weekdayIndex, dayLabel, HOLIDAYS } from "./lib.js";
import { renderResults } from "./results.js";
import worker from "./worker.js";

const base = {
  id: "abcd1234-ef", name: "  Mario   Rossi ", note: " porto il vino ",
  dinner: { attending: true, available: [19, 5, 5], unavailable: [24] },
  santa: { attending: true, available: [16], unavailable: [] },
};
const withEv = (key, patch) => ({ ...base, [key]: { ...base[key], ...patch } });

test("weekdays of December 2026", () => {
  assert.equal(weekdayIndex(1), 1);   // Tuesday
  assert.equal(weekdayIndex(25), 4);  // Friday
  assert.equal(weekdayIndex(31), 3);  // Thursday
  assert.equal(dayLabel(19), "Sat 19 Dec");
});

test("8 December is not marked as a holiday", () => {
  assert.equal(HOLIDAYS[8], undefined);
  assert.equal(HOLIDAYS[25], "Christmas Day");
});

test("valid two-event RSVP is normalised", () => {
  const r = validateRsvp(base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    id: "abcd1234-ef", name: "Mario Rossi", v: 2, note: "porto il vino",
    dinner: { available: [5, 19], unavailable: [24] },
    santa: { available: [16], unavailable: [] },
  });
});

test("both events must be a yes", () => {
  for (const key of ["dinner", "santa"]) {
    assert.equal(validateRsvp(withEv(key, { attending: false })).ok, false, key);
    assert.equal(validateRsvp(withEv(key, { attending: "true" })).ok, false, key);
    assert.equal(validateRsvp({ ...base, [key]: undefined }).ok, false, key);
    assert.equal(validateRsvp({ ...base, [key]: [] }).ok, false, key);
  }
  assert.match(validateRsvp(withEv("santa", { attending: false })).error, /Secret Santa is yes/);
});

test("rejects bad names, ids, days, notes", () => {
  for (const bad of [{ name: "" }, { name: "   " }, { name: "x".repeat(61) }, { name: 5 },
    { id: "short" }, { id: "../../etc" }, { id: undefined }, { note: "x".repeat(301) }, { note: {} }])
    assert.equal(validateRsvp({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  for (const key of ["dinner", "santa"])
    for (const bad of [{ available: [] }, { available: [0] }, { available: [32] }, { available: [1.5] }, { available: "1" },
      { unavailable: [40] }, { unavailable: base[key].available }])
      assert.equal(validateRsvp(withEv(key, bad)).ok, false, key + JSON.stringify(bad));
  assert.equal(validateRsvp(null).ok, false);
  assert.equal(validateRsvp([]).ok, false);
});

test("missing unavailable and note are fine", () => {
  const r = validateRsvp({ ...withEv("dinner", { unavailable: undefined }), note: undefined });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.dinner.unavailable, []);
  assert.equal(r.value.note, "");
});

test("old single-event answers count for both events, flagged legacy", () => {
  const old = { id: "old-0000-1", name: "Alessia", attending: true, available: [3, 4], unavailable: [8] };
  const n = normalizeRecord(old);
  assert.equal(n.legacy, true);
  assert.deepEqual(n.dinner, { available: [3, 4], unavailable: [8] });
  assert.deepEqual(n.santa, n.dinner);
  const v2 = validateRsvp(base).value;
  assert.equal(normalizeRecord(v2).legacy, false);
});

test("tally ranks per event: most yes, then fewest no, then earliest", () => {
  const recs = [
    { name: "A", dinner: { available: [12, 19], unavailable: [5] }, santa: { available: [16], unavailable: [] } },
    { name: "B", dinner: { available: [12, 19, 5], unavailable: [] }, santa: { available: [16, 17], unavailable: [] } },
    { name: "C", dinner: { available: [19], unavailable: [12] }, santa: { available: [17], unavailable: [16] } },
    { name: "Old", available: [19], unavailable: [] },
  ];
  const dinner = tallyDays(recs, "dinner");
  assert.equal(dinner.days.length, 31);
  assert.deepEqual(dinner.days[18].yes, ["A", "B", "C", "Old"]);
  assert.deepEqual(dinner.ranking.map((d) => d.day), [19, 12, 5]);
  const santa = tallyDays(recs, "santa");
  assert.deepEqual(santa.ranking.map((d) => d.day), [17, 16, 19]);
  assert.deepEqual(tallyDays([], "dinner").ranking, []);
});

test("escaping and key comparison", () => {
  assert.equal(escapeHtml(`<b a="1">'&`), "&lt;b a=&quot;1&quot;&gt;&#39;&amp;");
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("", "x"), false);
  assert.equal(safeEqual(undefined, "x"), false);
});

test("results page escapes guest input and shows both events and old answers", () => {
  const now = new Date().toISOString();
  const out = renderResults([
    { id: "abcd1234-ef", name: "<script>x</script>", note: "<img onerror=1>", updatedAt: now, dinner: { available: [3], unavailable: [] }, santa: { available: [4], unavailable: [] } },
    { id: "old-0000-1", name: "Alessia", available: [5], unavailable: [], updatedAt: now },
  ], "k&1");
  assert.ok(!out.includes("<script>x"));
  assert.ok(!out.includes("<img onerror"));
  assert.ok(out.includes("k%261"));
  assert.ok(out.includes("Christmas Dinner") && out.includes("Office Secret Santa"));
  assert.ok(out.includes("old form"));
});

// Worker routes against an in-memory KV.
function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }; },
  };
}
const env = { RSVP: fakeKV(), ADMIN_KEY: "secret-key-123" };
const req = (path, init) => new Request("https://festa.test" + path, init);
const post = (body) => worker.fetch(req("/api/rsvp", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), env);

test("worker: invite page, RSVP save/update, legacy upgrade, admin gate, delete", async () => {
  const home = await worker.fetch(req("/"), env);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Are you coming to the Christmas dinner/);
  assert.match(html, /Are you in for the Secret Santa/);
  assert.doesNotMatch(html, /panettone|mulled wine/i);

  // An answer from the old form, then the same guest re-answers with the new form: one record, upgraded.
  env.RSVP.m.set("rsvp:abcd1234-ef", JSON.stringify({ id: "abcd1234-ef", name: "Mario", attending: true, available: [1], unavailable: [], createdAt: "2026-11-13T08:00:00.000Z" }));
  assert.equal((await post(base)).status, 200);
  const upgraded = JSON.parse(env.RSVP.m.get("rsvp:abcd1234-ef"));
  assert.equal(env.RSVP.m.size, 1);
  assert.equal(upgraded.createdAt, "2026-11-13T08:00:00.000Z");
  assert.deepEqual(upgraded.santa.available, [16]);
  assert.equal(upgraded.available, undefined);

  assert.equal((await post(withEv("santa", { attending: false }))).status, 400);
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post("x".repeat(5000))).status, 413);

  assert.equal((await worker.fetch(req("/results"), env)).status, 403);
  assert.equal((await worker.fetch(req("/results?k=wrong"), env)).status, 403);
  assert.equal((await worker.fetch(req("/api/results?k=wrong"), env)).status, 403);
  const page = await worker.fetch(req("/results?k=secret-key-123"), env);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Mario Rossi/);
  const data = await (await worker.fetch(req("/api/results?k=secret-key-123"), env)).json();
  assert.equal(data.records.length, 1);
  assert.equal(data.ranking.dinner[0].day, 5);
  assert.equal(data.ranking.santa[0].day, 16);

  const fd = new FormData(); fd.set("id", "abcd1234-ef");
  assert.equal((await worker.fetch(req("/results/delete?k=wrong", { method: "POST", body: fd }), env)).status, 403);
  assert.equal(env.RSVP.m.size, 1);
  const del = await worker.fetch(req("/results/delete?k=secret-key-123", { method: "POST", body: fd }), env);
  assert.equal(del.status, 303);
  assert.equal(env.RSVP.m.size, 0);

  assert.equal((await worker.fetch(req("/nope"), env)).status, 404);
});
