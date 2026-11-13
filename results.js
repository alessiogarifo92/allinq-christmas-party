import { tallyDays, normalizeRecord, escapeHtml, dayLabel, weekdayIndex, HOLIDAYS, WEEKDAYS, EVENTS } from "./lib.js";

const ICONS = { dinner: "🍽️", santa: "🎁" };

function eventSection({ key, label }, records) {
  const e = escapeHtml;
  const { days, ranking } = tallyDays(records, key);
  const max = Math.max(1, ...days.map((d) => d.yes.length));
  const top = ranking.slice(0, 5);

  const topHtml = top.length
    ? top.map((d, i) => `<li class="top-item${i === 0 ? " first" : ""}"><span class="top-day">${e(dayLabel(d.day))}${HOLIDAYS[d.day] ? ` · ${e(HOLIDAYS[d.day])}` : ""}</span>
        <span class="top-n"><b>${d.yes.length}</b> can make it · ${d.no.length} can't</span>
        <span class="top-names">${e(d.yes.join(", "))}${d.no.length ? `<br><i>Can't make it: ${e(d.no.join(", "))}</i>` : ""}</span></li>`).join("")
    : `<li class="empty">No answers yet. Send the invitation link around.</li>`;

  let cal = WEEKDAYS.map((w) => `<div class="dow">${w}</div>`).join("");
  for (let i = 0; i < weekdayIndex(1); i++) cal += "<div></div>";
  for (const d of days) {
    const alpha = d.yes.length ? 0.18 + 0.82 * (d.yes.length / max) : 0;
    const title = `${dayLabel(d.day)}: can make it: ${d.yes.join(", ") || "nobody"}; can't: ${d.no.join(", ") || "nobody"}`;
    cal += `<div class="cell${alpha > 0.55 ? " dark" : ""}" style="--a:${alpha.toFixed(2)}" title="${e(title)}"><span class="cd">${d.day}</span><span class="cy">${d.yes.length}✓</span>${d.no.length ? `<span class="cn">${d.no.length}✕</span>` : ""}</div>`;
  }

  return `<section class="event" id="${key}">
  <h2 class="event-title">${ICONS[key]} ${e(label)}</h2>
  <div class="stats"><div class="stat"><b>${top[0] ? e(dayLabel(top[0].day)) : "—"}</b>best day so far${top[0] ? ` (${top[0].yes.length} of ${records.length})` : ""}</div></div>
  <div class="card"><h3>Best dates</h3><ol class="top">${topHtml}</ol></div>
  <div class="card"><h3>December 2026: who can make it each day</h3><div class="cal">${cal}</div></div>
</section>`;
}

const chips = (list, cls) => list.map((d) => `<span class="chip ${cls}">${d}</span>`).join("") || "—";

export function renderResults(records, key) {
  const e = escapeHtml;
  const kq = encodeURIComponent(key);
  const norm = records.map(normalizeRecord);
  const legacyCount = norm.filter((r) => r.legacy).length;

  const rows = norm.map((r) => `<tr>
      <td class="nm">${e(r.name)}${r.legacy ? ` <span class="tag" title="Answered before the form had two events: the same days count for both.">old form</span>` : ""}${r.note ? `<div class="note">${e(r.note)}</div>` : ""}</td>
      ${EVENTS.map(({ key: k }) => `<td><div>${chips(r[k].available, "y")}</div><div class="no-row">${r[k].unavailable.length ? chips(r[k].unavailable, "n") : ""}</div></td>`).join("")}
      <td class="when">${e(new Date(r.updatedAt).toLocaleString("en-GB", { timeZone: "Europe/Rome", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td>
      <td><form method="post" action="/results/delete?k=${kq}" onsubmit="return this.dataset.ok==='1'||(this.dataset.ok='1',this.querySelector('button').textContent='Confirm',false)"><input type="hidden" name="id" value="${e(r.id)}"><button class="del" type="submit">Delete</button></form></td>
    </tr>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Allinq Party Results</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Figtree:wght@400;600;700&display=swap">
<style>
:root{--bg:#f3f6f3;--card:#fff;--ink:#1b1a17;--muted:#5f6b63;--line:#dde3de;--leaf:#1f8a4c;--leaf-soft:#dcf3e4;--berry:#d42a3c;--berry-soft:#fde3e6;--gold:#f2c14e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Figtree,system-ui,sans-serif;padding:24px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left))}
.wrap{max-width:900px;margin:0 auto;display:grid;gap:22px}
h1{font:700 clamp(28px,6vw,40px)/1.05 Fredoka,system-ui,sans-serif;margin:0}h3{font:700 18px/1.2 Fredoka,system-ui,sans-serif;margin:0 0 12px}
.event{display:grid;gap:12px}.event-title{font:700 26px/1.1 Fredoka,system-ui,sans-serif;margin:8px 0 0;padding-top:16px;border-top:3px dashed var(--line)}
.jump{display:flex;gap:8px;flex-wrap:wrap}.jump a{font:600 14px Fredoka,system-ui;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 14px;text-decoration:none;color:var(--ink)}
.sub{color:var(--muted);margin:6px 0 0}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px}
.top{list-style:none;margin:0;padding:0;display:grid;gap:10px}.top-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:12px 14px;border-radius:12px;background:var(--bg)}
.top-item.first{background:var(--leaf-soft);outline:2px solid var(--leaf)}.top-day{font-weight:700}.top-n{font-variant-numeric:tabular-nums;color:var(--muted)}.top-n b{color:var(--leaf);font-size:18px}
.top-names{grid-column:1/-1;color:var(--muted);font-size:13.5px}.top-names i{color:var(--berry);font-style:normal}.empty{color:var(--muted)}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.dow{text-align:center;font-size:12px;font-weight:700;text-transform:uppercase;color:var(--muted)}
.cell{position:relative;border-radius:10px;border:1px solid var(--line);padding:6px;min-height:56px;background:color-mix(in srgb,var(--leaf) calc(var(--a)*100%),#fff);display:grid;align-content:space-between;font-variant-numeric:tabular-nums}
.cell.dark{color:#fff}.cd{font-weight:700}.cy{font-size:12px;font-weight:700}.cn{position:absolute;top:5px;right:6px;font-size:11px;font-weight:700;color:var(--berry);background:#fff;border-radius:6px;padding:0 4px}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:680px}th,td{text-align:left;padding:10px 8px;border-top:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-top:0}
.nm{font-weight:700}.note{font-weight:400;color:var(--muted);font-size:13.5px;max-width:28ch}.when{color:var(--muted);white-space:nowrap;font-size:13px}.no-row{margin-top:2px}
.tag{font:600 11px Figtree,system-ui;background:#fff4d6;color:#7a5a00;border-radius:6px;padding:1px 6px;margin-left:4px;cursor:help}
.chip{display:inline-block;min-width:26px;text-align:center;font-size:12.5px;font-weight:700;padding:2px 6px;margin:0 3px 3px 0;border-radius:999px;font-variant-numeric:tabular-nums}.chip.y{background:var(--leaf-soft);color:#17633f}.chip.n{background:var(--berry-soft);color:var(--berry)}
.del{font:600 13px Figtree,system-ui;background:none;border:1px solid var(--line);border-radius:8px;padding:5px 9px;color:var(--berry);cursor:pointer}
.stats{display:flex;gap:10px;flex-wrap:wrap}.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px 16px}.stat b{font:700 24px Fredoka,system-ui;display:block}
a{color:var(--leaf)}
</style></head><body><div class="wrap">
<header><h1>Allinq Christmas · answers</h1><p class="sub">Organiser-only page: don't share this link. New answers can take about a minute to show up; reload the page.</p></header>
<div class="stats"><div class="stat"><b>${records.length}</b>people answered (everyone said yes to both)</div></div>
${legacyCount ? `<p class="sub">${legacyCount} answer${legacyCount > 1 ? "s were" : " was"} sent with the first, single-event form: those days count for both events and are marked <span class="tag">old form</span>.</p>` : ""}
<nav class="jump">${EVENTS.map(({ key: k, label }) => `<a href="#${k}">${ICONS[k]} ${e(label)}</a>`).join("")}<a href="#answers">All answers</a></nav>
${EVENTS.map((ev) => eventSection(ev, records)).join("")}
<section class="event" id="answers"><h2 class="event-title">All answers</h2><div class="card"><div class="tbl"><table><thead><tr><th>Name</th>${EVENTS.map(({ label }) => `<th>${e(label)}<br><span style="text-transform:none;letter-spacing:0">green: can · red: can't</span></th>`).join("")}<th>Updated</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="${EVENTS.length + 3}" class="empty">No answers yet.</td></tr>`}</tbody></table></div></div></section>
<p class="sub"><a href="/">Open the invitation</a> · <a href="/api/results?k=${kq}">Download the data as JSON</a></p>
</div></body></html>`;
}
