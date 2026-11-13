// Pure logic for the RSVP worker: validation and date tallies. No Cloudflare APIs here,
// so it can be unit-tested with plain Node.

export const YEAR = 2026;
export const DAYS_IN_MONTH = 31;
export const HOLIDAYS = { 24: "Christmas Eve", 25: "Christmas Day", 26: "Boxing Day", 31: "New Year's Eve" };
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const EVENTS = [
  { key: "dinner", label: "Christmas Dinner" },
  { key: "santa", label: "Office Secret Santa" },
];

// 0 = Monday ... 6 = Sunday, for a day of December YEAR.
export function weekdayIndex(day) {
  const js = new Date(Date.UTC(YEAR, 11, day)).getUTCDay(); // 0 = Sunday
  return (js + 6) % 7;
}

function normDays(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > DAYS_IN_MONTH) return null;
  const out = new Set();
  for (const d of list) {
    if (!Number.isInteger(d) || d < 1 || d > DAYS_IN_MONTH) return null;
    out.add(d);
  }
  return [...out].sort((a, b) => a - b);
}

// One event's answer: { attending: true, available: [...], unavailable: [...] }.
function validateEvent(ev, label) {
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return { error: `Missing answer for the ${label}.` };
  if (ev.attending !== true) return { error: `The only accepted answer for the ${label} is yes.` };
  const available = normDays(ev.available);
  const unavailable = normDays(ev.unavailable);
  if (available === null || unavailable === null) return { error: `Those ${label} dates aren't valid.` };
  if (available.some((d) => unavailable.includes(d))) return { error: `A ${label} day can't be both free and busy.` };
  if (available.length === 0) return { error: `Mark at least one day you can make the ${label}.` };
  return { value: { available, unavailable } };
}

export function validateRsvp(body) {
  const fail = (error) => ({ ok: false, error });
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request.");

  const id = body.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return fail("Invalid request.");

  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return fail("Please tell us your name.");
  if (name.length > 60) return fail("That name is too long (60 characters max).");

  const value = { id, name, v: 2 };
  for (const { key, label } of EVENTS) {
    const r = validateEvent(body[key], label);
    if (r.error) return fail(r.error);
    value[key] = r.value;
  }

  let note = body.note == null ? "" : body.note;
  if (typeof note !== "string") return fail("Invalid request.");
  note = note.trim();
  if (note.length > 300) return fail("That note is too long (300 characters max).");
  value.note = note;

  return { ok: true, value };
}

// Answers saved before the two-event form have top-level available/unavailable lists:
// they count for both events and are flagged as legacy.
export function normalizeRecord(r) {
  if (r && r.dinner && r.santa) return { ...r, legacy: false };
  const days = { available: (r && r.available) || [], unavailable: (r && r.unavailable) || [] };
  return { ...r, dinner: days, santa: days, legacy: true };
}

// Per-day counts for one event plus a ranking: most people available, then fewest unavailable, then earliest.
export function tallyDays(records, eventKey) {
  const days = [];
  for (let day = 1; day <= DAYS_IN_MONTH; day++) days.push({ day, yes: [], no: [] });
  for (const raw of records) {
    const r = normalizeRecord(raw);
    const ev = r[eventKey] || {};
    for (const d of ev.available || []) if (days[d - 1]) days[d - 1].yes.push(r.name);
    for (const d of ev.unavailable || []) if (days[d - 1]) days[d - 1].no.push(r.name);
  }
  const ranking = days
    .filter((d) => d.yes.length > 0)
    .slice()
    .sort((a, b) => b.yes.length - a.yes.length || a.no.length - b.no.length || a.day - b.day);
  return { days, ranking };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function dayLabel(day) {
  return `${WEEKDAYS[weekdayIndex(day)]} ${day} Dec`;
}
