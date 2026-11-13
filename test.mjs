import test from "node:test";
import assert from "node:assert/strict";
import { validateRsvp, tallyDays, escapeHtml, safeEqual, weekdayIndex, dayLabel } from "./lib.js";
import { renderResults } from "./results.js";
import worker from "./worker.js";

const base = { id: "abcd1234-ef", name: "  Mario   Rossi ", attending: true, available: [19, 5, 5], unavailable: [24], note: " porto il vino " };

test("weekdays of December 2026", () => {
  assert.equal(weekdayIndex(1), 1);   // Tuesday
  assert.equal(weekdayIndex(25), 4);  // Friday
  assert.equal(weekdayIndex(31), 3);  // Thursday
  assert.equal(dayLabel(19), "Sat 19 Dec");
});

test("valid RSVP is normalised", () => {
  const r = validateRsvp(base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { id: "abcd1234-ef", name: "Mario Rossi", attending: true, available: [5, 19], unavailable: [24], note: "porto il vino" });
});

test("rejects saying no or missing attending", () => {
  assert.equal(validateRsvp({ ...base, attending: false }).ok, false);
  assert.equal(validateRsvp({ ...base, attending: "true" }).ok, false);
  assert.match(validateRsvp({ ...base, attending: undefined }).error, /yes/);
});

test("rejects bad names, ids, days, notes", () => {
  for (const bad of [
    { name: "" }, { name: "   " }, { name: "x".repeat(61) }, { name: 5 },
    { id: "short" }, { id: "../../etc" }, { id: undefined },
    { available: [] }, { available: [0] }, { available: [32] }, { available: [1.5] }, { available: "1" },
    { unavailable: [19] }, { unavailable: [40] },
    { note: "x".repeat(301) }, { note: {} },
  ]) assert.equal(validateRsvp({ ...base, ...bad }).ok, false, JSON.stringify(bad));
  assert.equal(validateRsvp(null).ok, false);
  assert.equal(validateRsvp([]).ok, false);
});

test("missing unavailable and note are fine", () => {
  const r = validateRsvp({ ...base, unavailable: undefined, note: undefined });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.unavailable, []);
  assert.equal(r.value.note, "");
});

test("tally ranks by most yes, then fewest no, then earliest", () => {
  const recs = [
    { name: "A", available: [12, 19], unavailable: [5] },
    { name: "B", available: [12, 19, 5], unavailable: [] },
    { name: "C", available: [19], unavailable: [12] },
  ];
  const { days, ranking } = tallyDays(recs);
  assert.equal(days.length, 31);
  assert.deepEqual(days[18].yes, ["A", "B", "C"]);
  assert.deepEqual(ranking.map((d) => d.day), [19, 12, 5]);
  assert.deepEqual(tallyDays([]).ranking, []);
});

test("escaping and key comparison", () => {
  assert.equal(escapeHtml(`<b a="1">'&`), "&lt;b a=&quot;1&quot;&gt;&#39;&amp;");
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("", "x"), false);
  assert.equal(safeEqual(undefined, "x"), false);
});

test("results page escapes guest input", () => {
  const out = renderResults([{ id: "abcd1234-ef", name: "<script>x</script>", available: [3], unavailable: [], note: "<img onerror=1>", updatedAt: new Date().toISOString() }], "k&1");
  assert.ok(!out.includes("<script>x"));
  assert.ok(!out.includes("<img onerror"));
  assert.ok(out.includes("k%261"));
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

test("worker: invite page, RSVP save/update, admin gate, delete", async () => {
  const home = await worker.fetch(req("/"), env);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Are you coming to the party/);

  assert.equal((await post(base)).status, 200);
  const first = JSON.parse(env.RSVP.m.get("rsvp:abcd1234-ef"));
  assert.equal((await post({ ...base, available: [12] })).status, 200);
  const second = JSON.parse(env.RSVP.m.get("rsvp:abcd1234-ef"));
  assert.equal(env.RSVP.m.size, 1);
  assert.deepEqual(second.available, [12]);
  assert.equal(second.createdAt, first.createdAt);

  assert.equal((await post({ ...base, attending: false })).status, 400);
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
  assert.equal(data.ranking[0].day, 12);

  const fd = new FormData(); fd.set("id", "abcd1234-ef");
  assert.equal((await worker.fetch(req("/results/delete?k=wrong", { method: "POST", body: fd }), env)).status, 403);
  assert.equal(env.RSVP.m.size, 1);
  const del = await worker.fetch(req("/results/delete?k=secret-key-123", { method: "POST", body: fd }), env);
  assert.equal(del.status, 303);
  assert.equal(env.RSVP.m.size, 0);

  assert.equal((await worker.fetch(req("/nope"), env)).status, 404);
});
