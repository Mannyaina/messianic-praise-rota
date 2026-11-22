/* Messianic Praise! 2026 — Media Rota app */
(() => {
'use strict';
const C = window.MP_CONFIG;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

/* ---------- time helpers ---------- */
const params = new URLSearchParams(location.search);
const DEMO = !!(C.DEMO || params.has('demo'));
const fakeNow = params.get('now') ? new Date(params.get('now')) : null;
let simNow = fakeNow && !isNaN(fakeNow) ? fakeNow : DEMO ? new Date(C.EVENT_DAY + 'T23:15:00') : null;
let simStart = Date.now();
const now = () => (simNow ? new Date(simNow.getTime() + (Date.now() - simStart)) : new Date());
const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const range = (a, b) => `${hm(a)} – ${hm(b)}`;
function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 48) return r ? `${h}h ${r}m` : `${h}h`;
  return `${Math.floor(h / 24)} days`;
}
function parseTime(s) {
  s = String(s || '').trim();
  const m = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = +m[1]; const min = +m[2];
  if (m[3]) { const pm = /p/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h * 60 + min;
}
function onEvent(mins) {
  // Event runs from the afternoon of EVENT_DAY into the next morning
  const d = new Date(C.EVENT_DAY + 'T00:00:00');
  if (mins < 12 * 60) d.setDate(d.getDate() + 1);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}
const DEFAULT_TIMES = { 'set-up': ['15:00', '19:00'], 'shift 1': ['19:00', '22:00'], 'shift 2': ['22:00', '01:00'], 'shift 3': ['01:00', '04:00'], 'shift 4': ['04:00', '07:00'], 'set-down': ['06:00', '07:00'] };

/* ---------- names ---------- */
const niceName = (n) => (/[A-Z]{3,}/.test(n) && n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : n);
const splitNames = (s) => String(s || '').split(/\s*(?:\/|,|&|\+|\band\b)\s*/i).map((x) => niceName(x.trim())).filter(Boolean);
// role labels can be anything ("Team Lead", "Cam 1", "Director/ Switcher"); colour them by kind
const roleKind = (label) => (/lead|director|head/i.test(label) ? 'lead' : /back|reserve|standby/i.test(label) ? 'backup' : 'main');
const isStdRole = (label) => /^(team lead|lead|main|backup)$/i.test(String(label).trim());
const roleLabel = (label) => String(label).replace(/\s*\/\s*/g, ' / ').replace(/^team lead$/i, 'Lead');
const key = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const isMe = (s) => !!state.me && splitNames(s).some((n) => key(n) === key(state.me));

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- sheet → model ---------- */
function buildModel(rows, source) {
  const v = (r, c) => String((rows[r] || [])[c] ?? '').trim();
  const R = rows.length;
  const find = (re, not) => { for (let r = 0; r < R; r++) for (let c = 0; c < (rows[r] || []).length; c++) { const x = v(r, c); if (re.test(x) && !(not && not.test(x))) return { r, c }; } return null; };
  const hdr = find(/^set[\s-]?up$/i);
  if (!hdr) throw new Error('Could not find the "Set-Up" heading in the sheet');
  const startL = find(/^start$/i), endL = find(/^end$/i);
  const minL = find(/minister/i), headL = find(/head/i, /team/i);

  const hr = hdr.r;
  const width = Math.max(...rows.map((r) => r.length));
  const slotCols = [];
  for (let c = hdr.c; c < width; c++) if (/(set|shift)/i.test(v(hr, c))) slotCols.push(c);
  let lastCol = slotCols[slotCols.length - 1];
  if (startL) for (let c = lastCol; c < width; c++) if (v(startL.r, c)) lastCol = c;

  const slots = slotCols.map((c0, i) => {
    const c1 = i < slotCols.length - 1 ? slotCols[i + 1] - 1 : lastCol;
    const label = v(hr, c0);
    const def = DEFAULT_TIMES[key(label).replace(/\s+/g, ' ').replace('setup', 'set-up').replace('set down', 'set-down').replace('set up', 'set-up')] || null;
    const s0 = parseTime(startL && v(startL.r, c0)) ?? parseTime(def && def[0]);
    const e1 = parseTime(endL && v(endL.r, c1)) ?? parseTime(def && def[1]);
    const cols = [];
    for (let c = c0; c <= c1; c++) {
      let cs = parseTime(startL && v(startL.r, c)), ce = parseTime(endL && v(endL.r, c));
      if (cs == null) cs = (s0 ?? 0) + (c - c0) * 60;
      if (ce == null) ce = c === c1 ? e1 : cs + 60;
      cols.push({ c, start: onEvent(cs), end: onEvent(ce) });
    }
    return {
      id: 's' + i, i, label, c0, span: c1 - c0 + 1, cols,
      start: onEvent(s0 ?? 0), end: onEvent(e1 ?? 0),
      minister: minL ? firstIn(minL.r, c0, c1) : '', head: headL ? firstIn(headL.r, c0, c1) : '',
      ministerRow: minL ? minL.r : -1, headRow: headL ? headL.r : -1
    };
  });
  function firstIn(r, c0, c1) { for (let c = c0; c <= c1; c++) if (v(r, c)) return v(r, c); return ''; }

  // "Both" in the department-head row = every named head
  const heads = [...new Set(slots.flatMap((s) => (/^both$/i.test(s.head) ? [] : splitNames(s.head))))];
  slots.forEach((s) => { s.headDisplay = /^both$/i.test(s.head) ? heads.join(' & ') : s.head; });

  // teams
  const roleCol = hdr.c - 1, teamCol = roleCol - 1;
  const teams = []; let cur = null;
  for (let r = hr + 1; r < R; r++) {
    const roleTxt = v(r, roleCol);
    const role = roleTxt ? roleLabel(roleTxt) : null;
    const tName = v(r, teamCol).replace(/\s*\/\s*/g, ' / ');
    if (tName && role) { cur = { name: tName, roles: [] }; teams.push(cur); }
    if (!role || !cur) continue;
    const cells = {};
    for (const s of slots) {
      const vals = s.cols.map((col) => v(r, col.c));
      let segs = [];
      if (vals.slice(1).every((x) => !x)) {
        if (vals[0]) segs = [{ name: vals[0], from: s.start, to: s.end }];
      } else {
        s.cols.forEach((col, k) => {
          const n = vals[k]; if (!n) return;
          const last = segs[segs.length - 1];
          if (last && last.name === n && +last.to === +col.start) last.to = col.end;
          else segs.push({ name: n, from: col.start, to: col.end });
        });
      }
      cells[s.id] = { segs, row: r, col: s.c0, span: s.span, full: segs.length === 1 && +segs[0].from === +s.start && +segs[0].to === +s.end };
    }
    cur.roles.push({ role, row: r, cells });
  }

  // everyone named
  const people = new Map();
  const add = (n, why) => splitNames(n).forEach((p) => { if (/^both$/i.test(p)) return; const k = key(p); if (!people.has(k)) people.set(k, { name: p, roles: new Set() }); people.get(k).roles.add(why); });
  teams.forEach((t) => t.roles.forEach((ro) => Object.values(ro.cells).forEach((cell) => cell.segs.forEach((sg) => add(sg.name, t.name)))));
  slots.forEach((s) => { add(s.minister, 'Minister in charge'); add(s.headDisplay, 'Department head'); });

  return { slots, teams, people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), source, editable: !!C.SCRIPT_URL || source === 'demo' };
}

/* ---------- data loading ---------- */
const state = {
  model: null, updated: null, loading: false, error: null, offline: false,
  me: store.get('mp_me', DEMO ? 'Manny' : ''), demoRows: null, signins: [], team: store.get('mp_team', ''),
  leader: store.get('mp_leader', null), editing: false
};

async function fetchRows() {
  if (DEMO) { if (!state.demoRows) state.demoRows = window.MP_DEMO_ROWS.map((r) => r.slice()); return { rows: state.demoRows.map((r) => r.slice()), source: 'demo' }; }
  const url = `https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(C.SHEET_NAME)}&t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
  if (!res.ok) throw new Error('Sheet returned ' + res.status);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('The sheet is not shared publicly');
  const out = { rows: parseCSV(text), source: 'csv' };
  if (C.SCRIPT_URL) out.signins = await fetchSignins().catch(() => null);
  return out;
}
async function fetchSignins() {
  const url = `https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(C.SIGNIN_SHEET || 'Sign-ins')}&t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const rows = parseCSV(await res.text());
  if (!rows.length || !/status/i.test((rows[0] || []).join(','))) return []; // tab not created yet
  return rows.slice(1).filter((r) => r[1]).map((r) => ({ t: r[0], name: r[1], slot: r[2], team: r[3], role: r[4], status: r[5], by: r[6] }));
}

let loadP = null;
function load(quiet) { if (!loadP) loadP = doLoad(quiet).finally(() => { loadP = null; }); return loadP; }
async function doLoad(quiet) {
  state.loading = true; setSync();
  try {
    const { rows, source, signins } = await fetchRows();
    if (signins) state.signins = signins;
    const sig = JSON.stringify(rows) + JSON.stringify(state.signins);
    if (sig === state.sig && state.model) { state.updated = new Date(); state.error = null; state.offline = false; state.unchanged = true; return; }
    state.sig = sig; state.unchanged = false;
    state.model = buildModel(rows, source);
    state.updated = new Date(); state.error = null; state.offline = false;
    if (source !== 'demo') store.set('mp_cache', { rows, source, at: state.updated.toISOString() });
  } catch (e) {
    console.warn(e);
    state.error = e.message || String(e);
    if (!state.model) {
      const cache = store.get('mp_cache', null);
      if (cache && cache.source !== 'demo') { try { state.model = buildModel(cache.rows, cache.source); state.updated = new Date(cache.at); state.offline = true; } catch {} }
    } else state.offline = true;
    if (!quiet && state.model) toast('Couldn’t reach the sheet — showing the last saved copy', true);
  } finally {
    state.loading = false; setSync();
    if (!state.unchanged || !$('#view').innerHTML.trim() || /Loading the rota|Can\u2019t load/.test($('#view').textContent)) render();
    state.unchanged = false;
  }
}

function setSync() {
  const dot = $('#syncDot'), txt = $('#syncText');
  if (!dot) return;
  dot.className = 'sync-dot ' + (state.loading ? 'busy' : state.offline || state.error ? 'warn' : state.model ? 'ok' : '');
  if (state.loading && !state.model) txt.textContent = 'Loading rota…';
  else if (state.offline) txt.textContent = 'Offline · saved ' + agoText(state.updated);
  else if (state.error && !state.model) txt.textContent = 'Can’t load rota · tap to retry';
  else if (DEMO) txt.textContent = 'Trial · sample names';
  else if (state.updated) txt.textContent = 'Live from sheet · ' + agoText(state.updated);
}
function agoText(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  return hm(d);
}

/* ---------- derived ---------- */
function slotState(s, t = now()) { return t >= s.end ? 'done' : t >= s.start ? 'now' : 'later'; }
function activeSlots(t = now()) { return state.model.slots.filter((s) => t >= s.start && t < s.end); }
function namesFor(cell, t) {
  if (!cell || !cell.segs.length) return [];
  if (t) { const live = cell.segs.filter((sg) => t >= sg.from && t < sg.to); if (live.length) return live.flatMap((sg) => splitNames(sg.name).map((name) => ({ name }))); }
  return cell.segs.flatMap((sg) => splitNames(sg.name).map((name) => ({ name, note: cell.full ? '' : range(sg.from, sg.to) })));
}
function myAssignments() {
  const m = state.model, out = [];
  if (!m || !state.me) return out;
  for (const t of m.teams) for (const ro of t.roles) for (const s of m.slots) {
    for (const sg of ro.cells[s.id].segs) if (isMe(sg.name)) out.push({ slot: s, team: t.name, role: ro.role, from: sg.from, to: sg.to, teamObj: t });
  }
  for (const s of m.slots) {
    if (isMe(s.minister)) out.push({ slot: s, team: 'Minister in charge', role: 'Leader', from: s.start, to: s.end });
    if (isMe(s.headDisplay)) out.push({ slot: s, team: 'Department head', role: 'Leader', from: s.start, to: s.end });
  }
  // one entry per shift + team, even when someone covers several roles (e.g. Cam 1–6 at Set-Up)
  const merged = [];
  for (const a of out) {
    const same = merged.find((x) => x.slot === a.slot && x.team === a.team && +x.from === +a.from && +x.to === +a.to);
    if (same) { if (!same.roles.includes(a.role)) same.roles.push(a.role); same.role = same.roles.join(', '); }
    else merged.push({ ...a, roles: [a.role] });
  }
  return merged.sort((a, b) => a.from - b.from || a.slot.i - b.slot.i);
}

/* ---------- shift sign-in ---------- */
const NTFY = () => !C.SCRIPT_URL && !DEMO && !!C.NTFY_LOG;
const SIGNIN_ON = () => !!C.SCRIPT_URL || DEMO || NTFY();

/* sign-ins shared through ntfy (live stream; works before the Google script is connected) */
let es = null;
function ntfyRec(m) {
  try { const d = JSON.parse(m.message); if (!d.name || !d.slot) return null; return { t: hm(new Date(m.time * 1000)), ts: m.time, name: d.name, slot: d.slot, team: d.team || '', role: d.role || '', status: d.status === 'out' ? 'out' : 'in', by: d.by || d.name, id: m.id }; } catch { return null; }
}
function addNtfy(recs) {
  const ids = new Set(state.signins.map((r) => r.id));
  const fresh = recs.filter((r) => r && !ids.has(r.id));
  if (!fresh.length) return false;
  state.signins = state.signins.concat(fresh).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return true;
}
let ntfyKick = null;
function startNtfy() {
  if (!NTFY() || es) return;
  const base = `https://ntfy.sh/${encodeURIComponent(C.NTFY_LOG)}`;
  // first load everything cached, then listen live
  fetch(`${base}/json?poll=1&since=all`, { cache: 'no-store' }).then((r) => r.text()).then((t) => {
    if (addNtfy(t.split('\n').filter(Boolean).map((l) => { try { const m = JSON.parse(l); return m.event === 'message' ? ntfyRec(m) : null; } catch { return null; } }))) render();
  }).catch(() => {});
  try {
    es = new EventSource(`${base}/sse?since=1m`);
    es.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.event === 'message' && addNtfy([ntfyRec(m)])) { clearTimeout(ntfyKick); ntfyKick = setTimeout(render, 300); } } catch {} };
  } catch {}
}
async function ntfyPost(rec, title, tags, prio) {
  const body = JSON.stringify(rec);
  const r1 = await fetch(`https://ntfy.sh/${encodeURIComponent(C.NTFY_LOG)}`, { method: 'POST', body });
  if (!r1.ok) throw new Error('Could not save sign-in (' + r1.status + ')');
  const m = await r1.json(); addNtfy([ntfyRec(m)]);
  fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic: C.NTFY_TOPIC, title, message: `${rec.slot} · ${rec.team}${rec.role ? ' · ' + rec.role : ''} · ${hm(now())}`, tags: [tags], priority: prio }) }).catch(() => {});
}
async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function sigOf(name, slotLabel) {
  const k = key(name); let last = null;
  for (const r of state.signins) if (r.slot === slotLabel && key(r.name) === k) last = r;
  return last && last.status === 'in' ? last : null;
}
const sigTime = (r) => { const m = String(r.t || '').match(/(\d{1,2}):(\d{2})/); return m ? pad(m[1]) + ':' + m[2] : ''; };
function slotPeople(s) {
  const out = [], seen = new Set();
  for (const tm of state.model.teams) for (const ro of tm.roles) for (const sg of ro.cells[s.id].segs) for (const n of splitNames(sg.name)) {
    const k = key(n); if (seen.has(k)) continue; seen.add(k); out.push({ name: n, team: tm.name, role: ro.role });
  }
  return out;
}
function checkStatus(p, s, t = now()) {
  const r = sigOf(p.name, s.label);
  if (r) return { st: 'in', r };
  return { st: t >= new Date(+s.start + 10 * 60000) ? 'late' : 'wait' };
}
async function doSign(action, a) {
  const btn = document.querySelector('[data-sign]'); if (btn) btn.disabled = true;
  try {
    const j = await api({ action, name: state.me, slot: a.slot.label, team: a.team, role: a.role });
    if (j.signins) state.signins = j.signins;
    render();
    toast(action === 'signin' ? `Signed in — ${a.slot.headDisplay || 'your head'} has been told` : 'Signed out — thank you for serving!');
  } catch (x) { if (btn) btn.disabled = false; toast('Couldn\u2019t reach the sheet — try again', true); }
}
function boardHTML(s, t = now()) {
  const people = slotPeople(s); if (!people.length) return '';
  const rows = people.map((p) => ({ p, c: checkStatus(p, s, t) }));
  const nIn = rows.filter((x) => x.c.st === 'in').length, nLate = rows.filter((x) => x.c.st === 'late').length, nWait = rows.length - nIn - nLate;
  const teams = [...new Set(rows.map((x) => x.p.team))];
  const pill = (x) => {
    const lbl = x.c.st === 'in' ? `${x.p.name} ${sigTime(x.c.r)}` : x.c.st === 'late' ? `${x.p.name} · late` : x.p.name;
    const data = state.editing ? ` data-mark='${esc(JSON.stringify({ name: x.p.name, slot: s.label, team: x.p.team, role: x.p.role, isIn: x.c.st === 'in' }))}'` : ' tabindex="-1"';
    return `<button type="button" class="ck ck-${x.c.st}${isMe(x.p.name) ? ' me' : ''}"${data}>${esc(lbl)}</button>`;
  };
  const missing = rows.filter((x) => x.c.st !== 'in').map((x) => `${x.p.name} (${x.p.role})`);
  return `<section class="board card" aria-label="Check-in for ${esc(s.label)}">
    <div class="b-top"><span class="kicker">Check-in · ${esc(s.label)}</span><span class="kicker">${hm(t)}</span></div>
    <div class="b-count"><b>${nIn}</b><span>of ${rows.length} signed in</span></div>
    <div class="b-bar"><div style="width:${(nIn / rows.length) * 100}%;background:var(--ok)"></div><div style="width:${(nLate / rows.length) * 100}%;background:#F28C28"></div></div>
    <div class="b-key"><span><i style="background:var(--ok)"></i>In</span><span><i style="background:#F28C28"></i>Late (${nLate})</span><span><i class="dash"></i>Not yet (${nWait})</span></div>
    ${teams.map((tn) => `<div class="b-team"><div class="b-tn"><span>${esc(tn)}</span><span>${rows.filter((x) => x.p.team === tn && x.c.st === 'in').length} / ${rows.filter((x) => x.p.team === tn).length}</span></div><div class="b-pills">${rows.filter((x) => x.p.team === tn).map(pill).join('')}</div></div>`).join('')}
    ${missing.length ? `<button type="button" class="btn small" id="copyMissing" data-missing="${esc(`${s.label} — not signed in yet: ${missing.join(', ')}`)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>Copy missing list for WhatsApp</button>` : '<div class="b-all">Everyone is in. Thank you, team!</div>'}
    ${state.editing ? '<div class="b-hint">Leader: tap a name to mark them present or not here.</div>' : ''}
  </section>`;
}
function openMark(m) {
  openSheet(`<h2>${esc(m.name)}</h2><p>${esc(m.slot)} · ${esc(m.team)} · ${esc(m.role)}<br>${m.isIn ? 'Currently signed in.' : 'Not signed in yet.'}</p>
    <div class="err" id="me2"></div>
    <div class="row-btns"><button class="btn primary" type="button" id="mkIn">Mark present</button><button class="btn" type="button" id="mkOut">Not here</button><button class="btn ghost" data-close type="button">Cancel</button></div>`, (sh) => {
    const go = async (value) => {
      sh.querySelector('#me2').textContent = 'Saving…';
      try {
        const j = await api({ action: 'mark', pin: state.leader.pin, editor: state.leader.name, value, name: m.name, slot: m.slot, team: m.team, role: m.role });
        if (j.signins) state.signins = j.signins;
        closeSheet(); render(); toast(value === 'in' ? `${m.name} marked present` : `${m.name} marked not here`);
      } catch (x) { sh.querySelector('#me2').textContent = 'Couldn\u2019t save: ' + x.message; }
    };
    sh.querySelector('#mkIn').onclick = () => go('in'); sh.querySelector('#mkOut').onclick = () => go('out');
  });
}

/* ---------- programme ---------- */
const PROG = (() => {
  const P = window.MP_PROGRAMME; if (!P) return null;
  const flat = [];
  P.sections.forEach((sec, si) => sec.items.forEach(([tm, title, dur, kind]) => flat.push({ si, title, dur, kind, start: onEvent(parseTime(tm)) })));
  flat.forEach((it, i) => { const nx = flat[i + 1]; it.end = nx && nx.start > it.start ? nx.start : new Date(+it.start + Math.max(it.dur, 1) * 60000); });
  return { draft: P.draft, sections: P.sections, items: flat };
})();
function progNow(t = now()) {
  if (!PROG) return {};
  const items = PROG.items.filter((it) => it.title !== 'Close');
  const cur = [...items].reverse().find((it) => t >= it.start && t < it.end);
  const next = items.find((it) => it.start > t && it !== cur);
  return { cur, next, first: items[0], last: PROG.items[PROG.items.length - 1] };
}
function stageCard(t = now(), compact) {
  const { cur, next, first, last } = progNow(t);
  if (!PROG || !first || t < new Date(+first.start - 6 * 36e5) || t >= last.start) return '';
  const pct = cur ? Math.min(100, ((t - cur.start) / (cur.end - cur.start)) * 100) : 0;
  return `<a class="stage card" href="#prog">
    <div class="stage-top"><span class="kicker">${cur ? 'On stage now' : 'Up first'}</span><span class="kicker">${cur ? 'until ' + hm(cur.end) : hm((next || first).start)}</span></div>
    <div class="stage-title">${esc(cur ? cur.title : (next || first).title)}</div>
    ${cur ? `<div class="progress thin"><div style="width:${pct}%"></div></div>` : ''}
    ${cur && next ? `<div class="stage-next">Next: <b>${esc(next.title)}</b> at ${hm(next.start)} · in ${dur(next.start - t)}</div>` : ''}
    ${compact ? '' : ''}</a>`;
}

function signBlock(a, t) {
  if (!SIGNIN_ON() || !a || !a.slot) return '';
  const opens = new Date(+a.from - 30 * 60000);
  const r = sigOf(state.me, a.slot.label);
  window.__signA = a;
  if (r) return `<div class="signed card"><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>Signed in${sigTime(r) ? ' at ' + sigTime(r) : ''}${r.by && key(r.by) !== key(state.me) ? ' by ' + esc(r.by) : ''}</span>
    <button type="button" class="btn small" data-sign="signout">Sign out</button></div>`;
  if (t < opens) return `<div class="sign-later">Sign-in opens at ${hm(opens)}, 30 minutes before your shift.</div>`;
  if (t >= a.to) return '';
  return `<button type="button" class="sign-btn" data-sign="signin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>I\u2019m here — sign in</button>
    <div class="sign-later">Your department head is told straight away.</div>`;
}

/* ---------- chips ---------- */
function chip(name, role, ref, note, showRole) {
  const cls = roleKind(role);
  const me = name && isMe(name) ? ' me' : '';
  const label = (showRole ? `<small class="chip-role">${esc(role)}</small>` : '') + (name ? esc(name) + (note ? ` <small style="opacity:.7;font-weight:500">&nbsp;${esc(note)}</small>` : '') : 'Not set');
  const data = ref ? ` data-edit='${esc(JSON.stringify(ref))}'` : '';
  const aria = `${role}: ${name || 'not set'}`;
  return `<button type="button" class="chip ${name ? cls : 'empty-slot'}${me}"${data} aria-label="${esc(aria)}"${ref && state.editing ? '' : ' tabindex="-1"'}>${label}</button>`;
}
function cellChips(team, ro, s, t, noRole) {
  const show = !noRole && !isStdRole(ro.role);
  const cell = ro.cells[s.id];
  const ref = state.editing ? { kind: 'cell', team: team.name, role: ro.role, slot: s.id, slotLabel: s.label, row: cell.row, col: cell.col, span: cell.span, value: cell.segs.map((x) => x.name).join(' / ') } : null;
  const names = namesFor(cell, t);
  if (!names.length) return chip('', ro.role, ref, '', show);
  return names.map((n) => chip(n.name, ro.role, ref, n.note, show)).join('');
}

/* ---------- views ---------- */
const views = {
  me() {
    const m = state.model;
    const who = `<button class="who" id="pickMe" type="button"><span><small>Viewing rota for</small>${esc(state.me || 'Choose your name')}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
    if (!state.me) {
      return who + `<div class="card empty" style="margin-top:14px"><strong>Who are you?</strong>Pick your name once and the app will always open on your shifts.</div>`;
    }
    const mine = myAssignments();
    if (!mine.length) {
      return who + `<div class="card empty" style="margin-top:14px"><strong>No shifts for ${esc(state.me)} yet</strong>The rota is still being filled in. It updates by itself, so check back soon.</div>`;
    }
    const t = now();
    const cur = mine.find((a) => t >= a.from && t < a.to);
    const next = cur || mine.find((a) => a.from > t);
    let hero = '';
    if (next) {
      const live = next === cur;
      const s = next.slot;
      const leadCell = next.teamObj ? next.teamObj.roles.find((r) => roleKind(r.role) === 'lead') : null;
      const leadNames = leadCell ? namesFor(leadCell.cells[s.id], live ? t : null).map((n) => n.name).join(', ') : '';
      const mates = next.teamObj ? next.teamObj.roles.filter((r) => !next.roles.includes(r.role)).flatMap((r) => namesFor(r.cells[s.id]).filter((n) => !isMe(n.name)).map((n) => `${n.name} (${r.role})`)) : [];
      hero = `<section class="hero ${live ? 'live' : ''}">
          <div class="kicker">${live ? 'You’re on now' : 'Your next shift'}</div>
          <div class="hero-top"><div class="h-display">${esc(s.label)}</div>
            <div class="hero-when">${live ? 'Ends in ' + dur(next.to - t) : 'Starts in ' + dur(next.from - t)}</div></div>
          <div class="hero-time">${range(next.from, next.to)}</div>
          <div class="chips"><span class="pill dark">${esc(next.team)}</span><span class="pill outline">${esc(next.role === 'Leader' ? 'On duty' : next.role)}</span></div>
        </section>
        ${signBlock(next, t)}
        <div class="card people">
          ${next.teamObj && leadCell ? `<div class="row"><span>${esc(next.team)} · ${esc(leadCell ? leadCell.role : 'Lead')}</span><span>${esc(leadCell && next.roles.includes(leadCell.role) ? 'You' : leadNames || 'TBC')}</span></div>` : ''}
          ${mates.length ? `<div class="row"><span>With you</span><span>${esc(mates.join(', '))}</span></div>` : ''}
          <div class="row"><span>Department head</span><span>${esc(s.headDisplay || 'TBC')}</span></div>
          <div class="row"><span>Minister in charge</span><span>${esc(s.minister || 'TBC')}</span></div>
        </div>`;
    } else {
      hero = `<div class="card empty" style="margin-top:14px"><strong>All done — thank you!</strong>Every one of your shifts is finished. God bless you for serving.</div>`;
    }
    const list = mine.map((a) => {
      const st = t >= a.to ? 'done' : t >= a.from ? 'now' : a === next ? 'next' : 'later';
      const word = { done: 'Done', now: 'On now', next: 'Next', later: 'Later' }[st];
      return `<div class="shift-item is-${st}"><div class="slot st-${st}">${esc(a.slot.label)}</div>
        <div class="mid"><b>${range(a.from, a.to)}</b><small>${esc(a.team)} · ${esc(a.role)}</small></div>
        <span class="state st-${st}">${word}</span></div>`;
    }).join('');
    return who + hero + `<div class="section-title"><span class="kicker">All my shifts</span><span class="kicker">${mine.length}</span></div><div class="shift-list">${list}</div>`;
  },

  now() {
    const m = state.model, t = now();
    const act = activeSlots(t);
    const first = m.slots.reduce((a, b) => (b.start < a.start ? b : a), m.slots[0]);
    const lastEnd = Math.max(...m.slots.map((s) => +s.end));
    const legend = `<div class="legend"><span><i style="background:var(--gold)"></i>Lead</span><span><i style="background:#fff"></i>Main</span><span><i style="border:1.5px solid #5A6A9E"></i>Backup</span>${state.me ? '<span><i style="box-shadow:0 0 0 2px var(--live)"></i>You</span>' : ''}</div>`;
    const roster = (s, live) => `<div class="team-rows">${m.teams.map((tm) => `<div class="team-row"><div class="tn">${esc(tm.name)}</div><div class="names">${
      tm.roles.map((ro) => cellChips(tm, ro, s, live ? t : null)).join('')}</div></div>`).join('')}</div>`;

    if (t < first.start) {
      const ms = first.start - t, d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60;
      return `<div class="kicker">Countdown to ${esc(first.label)}</div>
        <div class="slot-title"><div class="h-display">${first.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div><div class="t">${hm(first.start)}</div></div>
        <div class="countdown"><div><b>${d}</b><span>days</span></div><div><b>${h}</b><span>hrs</span></div><div><b>${mi}</b><span>mins</span></div></div>
        <div class="card next-card"><b>${esc(C.VENUE)}</b> · Minister in charge: ${esc(first.minister || 'TBC')} · Heads: ${esc(first.headDisplay || 'TBC')}</div>
        <div class="section-title"><span class="kicker">First up · ${esc(first.label)} ${range(first.start, first.end)}</span></div>${roster(first, false)}${legend}`;
    }
    if (t >= lastEnd) {
      return `<div class="card empty" style="margin-top:8px"><strong>That’s a wrap!</strong>Messianic Praise! 2026 is finished. Thank you, media team — every shift mattered.</div>`;
    }
    if (!act.length) {
      const nx = m.slots.filter((s) => s.start > t).sort((a, b) => a.start - b.start)[0];
      return `<div class="card empty"><strong>Between shifts</strong>${nx ? `${esc(nx.label)} starts at ${hm(nx.start)}.` : ''}</div>`;
    }
    const upcoming = m.slots.filter((x) => x.start > t).sort((a, b) => a.start - b.start)[0];
    const blocks = act.map((s) => {
      const pct = Math.min(100, Math.max(0, ((t - s.start) / (s.end - s.start)) * 100));
      const after = m.slots.filter((x) => +x.start >= +s.end).sort((a, b) => a.start - b.start)[0];
      return `<div class="live-head"><span style="display:flex;align-items:center;gap:8px"><span class="live-dot"></span><span class="kicker" style="color:#fff">Live now · ${hm(t)}</span></span>
          <span class="kicker">${t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
        <div class="slot-title"><div class="h-display">${esc(s.label)}</div><div class="t">${range(s.start, s.end)}</div></div>
        <div class="progress" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
        <div style="margin-top:6px;font-size:13px;color:var(--muted)">${after ? `Handover to ${esc(after.label)} in ${dur(s.end - t)}` : `Ends in ${dur(s.end - t)}`}</div>
        <div class="duo"><div class="card"><small>Department head</small><b>${esc(s.headDisplay || 'TBC')}</b></div><div class="card"><small>Minister in charge</small><b>${esc(s.minister || 'TBC')}</b></div></div>
        ${SIGNIN_ON() ? boardHTML(s, t) : ''}
        <div class="section-title"><span class="kicker">On duty by team</span><span class="kicker">Lead · Main · Backup</span></div>
        ${roster(s, true)}`;
    });
    const soon = SIGNIN_ON() && upcoming && upcoming.start - t <= 30 * 60000 ? `<div style="height:20px"></div>${boardHTML(upcoming, t)}` : '';
    const nextCard = soon + (upcoming ? `<div class="card next-card"><b>Up next:</b> ${esc(upcoming.label)} · ${range(upcoming.start, upcoming.end)} · Dept head ${esc(upcoming.headDisplay || 'TBC')}</div>` : '');
    return stageCard(t) + blocks.join('<div style="height:28px"></div>') + nextCard + legend;
  },

  prog() {
    if (!PROG) return `<div class="card empty"><strong>No programme yet</strong></div>`;
    const t = now(); const { cur } = progNow(t);
    const m = state.model;
    let lastSlot = null;
    const slotAt = (d) => (m ? m.slots.filter((s) => d >= s.start && d < s.end && !/down/i.test(s.label))[0] || m.slots.find((s) => d >= s.start && d < s.end) : null);
    const secs = PROG.sections.map((sec, si) => {
      const rows = PROG.items.filter((it) => it.si === si).map((it) => {
        const st = it === cur ? 'now' : t >= it.end ? 'done' : 'later';
        const sl = si > 0 ? slotAt(it.start) : null;
        let div = '';
        if (sl && sl !== lastSlot) { lastSlot = sl; div = `<div class="p-shift">Media ${esc(sl.label)} · ${range(sl.start, sl.end)} · Head ${esc(sl.headDisplay || 'TBC')}</div>`; }
        return div + `<div class="p-row ${it.kind} p-${st}"${st === 'now' ? ' id="pnow"' : ''}>
          <div class="p-time">${hm(it.start)}</div>
          <div class="p-body"><div class="p-title">${esc(it.title)}</div>${st === 'now' ? `<div class="p-live"><span class="live-dot"></span>On stage now · ends ${hm(it.end)}</div>` : ''}</div>
          <div class="p-dur">${it.dur ? it.dur + 'm' : ''}</div></div>`;
      }).join('');
      return `<div class="section-title"><span class="kicker">${esc(sec.title)}</span><span class="kicker">${esc(sec.note || '')}</span></div><div class="p-list">${rows}</div>`;
    }).join('');
    return `<div class="kicker">Fri 27 Nov · ${esc(C.VENUE)}</div>
      <div class="h-display" style="color:var(--gold);margin:4px 0 4px">Programme</div>
      ${PROG.draft ? '<div style="font-size:13px;color:var(--muted)">Draft running order — times may change.</div>' : ''}
      <div style="height:12px"></div>${stageCard(t)}${secs}`;
  },

  teams() {
    const m = state.model, t = now();
    if (!m.teams.length) return `<div class="card empty"><strong>No teams found</strong>Check the team rows in the sheet.</div>`;
    let team = m.teams.find((x) => x.name === state.team);
    if (!team) {
      const mine = myAssignments().find((a) => a.teamObj);
      team = mine ? mine.teamObj : m.teams[0];
    }
    const chips = m.teams.map((x) => `<button type="button" class="tchip ${x === team ? 'on' : ''}" data-team="${esc(x.name)}" aria-pressed="${x === team}">${esc(x.name)}</button>`).join('');
    const items = m.slots.map((s) => {
      const st = slotState(s, t);
      return `<div class="tl-item"><div class="tl-when"><b style="color:${st === 'now' ? 'var(--gold)' : st === 'done' ? 'var(--muted)' : '#fff'}">${esc(s.label)}</b><small>${range(s.start, s.end)}</small></div>
        <div class="tl-card ${st === 'now' ? 'now' : ''}">
          ${team.roles.map((ro) => `<div class="tl-line"><span class="role-tag ${roleKind(ro.role)}">${esc(ro.role)}</span><span class="chipset">${cellChips(team, ro, s, null, true)}</span></div>`).join('')}
          <div class="tl-foot">Dept head: ${esc(s.headDisplay || 'TBC')}${st === 'now' ? ' · <span style="color:var(--live);font-weight:700">ON NOW</span>' : ''}</div>
        </div></div>`;
    }).join('');
    return `<div class="kicker">Team</div><div class="h-display" style="color:var(--gold);margin:4px 0 12px">${esc(team.name)}</div>
      <div class="chips-scroll" role="group" aria-label="Choose team">${chips}</div><div class="timeline">${items}</div>`;
  },

  rota() {
    const m = state.model, t = now();
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/edit`;
    const head = m.slots.map((s) => {
      const st = slotState(s, t);
      const mRef = state.editing && s.ministerRow >= 0 ? esc(JSON.stringify({ kind: 'meta', label: 'Minister in charge', slot: s.id, slotLabel: s.label, row: s.ministerRow, col: s.c0, span: s.span, value: s.minister })) : '';
      const hRef = state.editing && s.headRow >= 0 ? esc(JSON.stringify({ kind: 'meta', label: 'Department head', slot: s.id, slotLabel: s.label, row: s.headRow, col: s.c0, span: s.span, value: s.head })) : '';
      const mTxt = state.editing ? `<button type="button" data-edit='${mRef}'>${esc(s.minister || 'Set minister')}</button>` : esc(s.minister || 'TBC');
      const hTxt = state.editing ? `<button type="button" data-edit='${hRef}'>${esc(s.head || 'Set head')}</button>` : esc(s.headDisplay || 'TBC');
      return `<th class="${st === 'now' ? 'now' : ''}" scope="col"><div class="sl">${esc(s.label)}</div><div class="tm">${range(s.start, s.end)}</div>
        <div class="hd">Head: ${hTxt}</div><div class="hd">Minister: ${mTxt}</div></th>`;
    }).join('');
    const body = m.teams.map((tm) => `<tr><td class="team" scope="row">${esc(tm.name)}</td>${m.slots.map((s) => `<td class="${slotState(s, t) === 'now' ? 'now' : ''}"><div class="stack">${
      tm.roles.map((ro) => cellChips(tm, ro, s, null)).join('')}</div></td>`).join('')}</tr>`).join('');
    const wide = matchMedia('(min-width: 900px)').matches;
    let body2 = '';
    if (!wide) {
      let sel = m.slots.find((x) => x.id === state.rotaSlot);
      if (!sel) sel = m.slots.find((x) => slotState(x, t) === 'now' && !/down/i.test(x.label)) || m.slots.find((x) => x.start > t) || m.slots[0];
      const st = slotState(sel, t);
      const mRef = state.editing && sel.ministerRow >= 0 ? esc(JSON.stringify({ kind: 'meta', label: 'Minister in charge', slot: sel.id, slotLabel: sel.label, row: sel.ministerRow, col: sel.c0, span: sel.span, value: sel.minister })) : '';
      const hRef = state.editing && sel.headRow >= 0 ? esc(JSON.stringify({ kind: 'meta', label: 'Department head', slot: sel.id, slotLabel: sel.label, row: sel.headRow, col: sel.c0, span: sel.span, value: sel.head })) : '';
      const tabs = m.slots.map((x) => `<button type="button" class="tchip ${x === sel ? 'on' : ''}" data-rslot="${x.id}" aria-pressed="${x === sel}">${esc(x.label)}${slotState(x, t) === 'now' ? ' <span class="live-dot sm"></span>' : ''}</button>`).join('');
      const teams = m.teams.map((tm) => `<div class="rt-card"><div class="rt-name">${esc(tm.name)}</div>${
        tm.roles.map((ro) => `<div class="tl-line"><span class="role-tag ${roleKind(ro.role)}">${esc(ro.role)}</span><span class="chipset">${cellChips(tm, ro, sel, null, true)}</span></div>`).join('')}</div>`).join('');
      body2 = `<div class="chips-scroll rslots" role="group" aria-label="Choose shift">${tabs}</div>
        <div class="rt-head card ${st === 'now' ? 'now' : ''}">
          <div><div class="rt-slot">${esc(sel.label)}</div><div class="rt-time">${range(sel.start, sel.end)}${st === 'now' ? ' · <b style="color:var(--live)">ON NOW</b>' : st === 'done' ? ' · finished' : ''}</div></div>
          <div class="rt-meta"><div>Head: ${state.editing ? `<button type="button" class="linkish" data-edit='${hRef}'>${esc(sel.head || 'Set head')}</button>` : `<b>${esc(sel.headDisplay || 'TBC')}</b>`}</div>
          <div>Minister: ${state.editing ? `<button type="button" class="linkish" data-edit='${mRef}'>${esc(sel.minister || 'Set minister')}</button>` : `<b>${esc(sel.minister || 'TBC')}</b>`}</div></div>
        </div>
        <div class="rt-list">${teams}</div>`;
    }
    return `<div class="kicker">${esc(C.VENUE)} · Fri 27 Nov</div>
      <div class="h-display" style="color:var(--gold);margin-top:4px">Full media rota</div>
      <div class="rota-actions">
        <button class="btn small" type="button" id="findMe"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>${state.me ? 'Highlighting ' + esc(state.me) : 'Find my name'}</button>
        <button class="btn small" type="button" id="printBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>Print / PDF</button>
        <a class="btn small ghost" href="${sheetUrl}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>Open Google Sheet</a>
      </div>
      <div class="legend"><span><i style="background:var(--gold)"></i>Lead</span><span><i style="background:#fff"></i>Main</span><span><i style="border:1.5px solid #5A6A9E"></i>Backup</span><span><i style="background:#1F3170;outline:2px solid var(--gold)"></i>On now</span></div>
      ${wide ? `<div class="rota-wrap"><table class="rota"><thead><tr><th class="team" scope="col">Team</th>${head}</tr></thead><tbody>${body}</tbody></table></div>` : body2}`;
  }
};

/* ---------- render ---------- */
let tab = (location.hash || '').slice(1);
function render() {
  if (!['me', 'now', 'prog', 'teams', 'rota'].includes(tab)) tab = state.me ? 'me' : 'now';
  document.querySelectorAll('.tabbar a').forEach((a) => { const on = a.dataset.tab === tab; a.classList.toggle('active', on); a.setAttribute('aria-current', on ? 'page' : 'false'); });
  const view = $('#view');
  document.body.classList.toggle('editing', state.editing);
  $('#leaderBtn').classList.toggle('on', state.editing);
  renderLeaderBar(); renderDemoBar();
  if (!state.model) {
    view.innerHTML = state.error
      ? `<div class="card empty"><strong>Can’t load the rota</strong>${esc(state.error)}<br><br><button class="btn primary" id="retry" type="button">Try again</button></div>`
      : `<div class="card empty"><strong>Loading the rota…</strong>Reading the latest from the Google Sheet.</div>`;
    return;
  }
  const y = window.scrollY;
  const rw = $('.rota-wrap'); const rs = rw ? [rw.scrollLeft, rw.scrollTop] : null;
  view.innerHTML = views[tab]();
  window.scrollTo(0, y);
  const rw2 = $('.rota-wrap'); if (rw2 && rs) { rw2.scrollLeft = rs[0]; rw2.scrollTop = rs[1]; }
}
matchMedia('(min-width: 900px)').addEventListener?.('change', () => tab === 'rota' && render());
window.addEventListener('hashchange', () => {
  tab = location.hash.slice(1); render(); window.scrollTo(0, 0);
  if (tab === 'prog') { const el = document.getElementById('pnow'); if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); }
});

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a');
  if (!el) return;
  if (el.id === 'pickMe' || el.id === 'findMe') return pickName();
  if (el.id === 'retry' || el.id === 'syncBtn') return load();
  if (el.id === 'printBtn') return window.print();
  if (el.id === 'leaderBtn') return state.editing ? stopEditing() : startEditing();
  if (el.dataset.sign) return doSign(el.dataset.sign, window.__signA);
  if (el.dataset.mark && state.editing) { try { return openMark(JSON.parse(el.dataset.mark)); } catch {} }
  if (el.id === 'copyMissing') { const txt = el.dataset.missing; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied — paste it in WhatsApp'), () => toast(txt)); return; }
  if (el.dataset.rslot) { state.rotaSlot = el.dataset.rslot; render(); const h = $('.rt-head'); if (h && h.getBoundingClientRect().top < 70) h.scrollIntoView({ block: 'start' }); return; }
  if (el.dataset.team) { state.team = el.dataset.team; store.set('mp_team', state.team); return render(); }
  if (el.dataset.edit && state.editing) { try { return openEditor(JSON.parse(el.dataset.edit)); } catch {} }
});

/* ---------- sheets (bottom modals) ---------- */
function openSheet(html, onMount) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-panel" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  sh.hidden = false;
  sh.onclick = (e) => { if (e.target === sh || e.target.closest('[data-close]')) closeSheet(); };
  document.addEventListener('keydown', escClose);
  onMount && onMount(sh);
  const f = sh.querySelector('input,button:not([data-close])'); f && setTimeout(() => f.focus(), 50);
}
function escClose(e) { if (e.key === 'Escape') closeSheet(); }
function closeSheet() { const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; document.removeEventListener('keydown', escClose); }

function pickName() {
  const people = state.model ? state.model.people : [];
  const list = (q) => people.filter((p) => !q || key(p.name).includes(key(q))).map((p) =>
    `<button type="button" class="${key(p.name) === key(state.me) ? 'on' : ''}" data-name="${esc(p.name)}">${esc(p.name)}<small>${esc([...p.roles].slice(0, 2).join(', '))}</small></button>`).join('')
    || `<div class="empty" style="padding:16px">No match. If you’re not on the rota yet, ask your department head to add you.</div>`;
  openSheet(`<h2>Who are you?</h2><p>Pick your name and the app will highlight your shifts everywhere.</p>
    <div class="field"><label for="q">Search names</label><input id="q" type="search" autocomplete="off" placeholder="Start typing your name"></div>
    <div class="name-list" id="nl">${list('')}</div>
    ${state.me ? '<div class="row-btns"><button class="btn ghost" type="button" id="clearMe">Clear my name</button></div>' : ''}`, (sh) => {
    sh.querySelector('#q').addEventListener('input', (e) => { sh.querySelector('#nl').innerHTML = list(e.target.value); });
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('[data-name]');
      if (b) { state.me = b.dataset.name; store.set('mp_me', state.me); closeSheet(); if (tab !== 'rota') location.hash = '#me'; render(); toast('Showing shifts for ' + state.me); }
      if (e.target.id === 'clearMe') { state.me = ''; store.del('mp_me'); closeSheet(); render(); }
    });
  });
}

/* ---------- trial time machine ---------- */
const DEMO_TIMES = [['A week before', -7 * 24 * 60 + 60 * 15], ['Set-Up 16:30', 16.5 * 60], ['Shift 1 20:10', 20 * 60 + 10], ['Shift 2 23:15', 23 * 60 + 15], ['Shift 3 02:40', 26 * 60 + 40], ['Shift 4 + Set-Down 06:20', 30 * 60 + 20], ['After', 32 * 60]];
function renderDemoBar() {
  const bar = $('#demoBar');
  if (!DEMO || !bar) return;
  bar.hidden = false;
  const cur = now();
  bar.innerHTML = `<div class="demo-head"><b>TRIAL</b> · sample names · pretend time <b>${cur.toLocaleDateString('en-GB', { weekday: 'short' })} ${hm(cur)}</b></div>
    <div class="chips-scroll demo-chips">${DEMO_TIMES.map(([l, m], i) => `<button type="button" class="tchip" data-demo="${i}">${l}</button>`).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-demo]'); if (!b) return;
  const d = new Date(C.EVENT_DAY + 'T00:00:00'); d.setMinutes(DEMO_TIMES[+b.dataset.demo][1]);
  simNow = d; simStart = Date.now(); render(); toast('Pretend time: ' + DEMO_TIMES[+b.dataset.demo][0]);
});

/* ---------- leader editing ---------- */
function renderLeaderBar() {
  const bar = $('#leaderBar');
  if (!state.editing) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>
    <div class="grow"><b>Leader editing on</b> (${esc(state.leader?.name || '')}). ${NTFY() ? 'On Live now, tap a name on the check-in board to mark them present.' : 'Tap any name in Teams or Full rota to change it.'}</div>
    <button class="btn small" type="button" id="leaderBtnOff">Done</button>`;
  bar.querySelector('#leaderBtnOff').onclick = stopEditing;
}
function stopEditing() { state.editing = false; render(); toast('Leader editing off'); }

async function api(body) {
  if (NTFY()) {
    const okPin = async () => (await sha('mp-' + (body.pin || ''))) === C.LEADER_PIN_HASH;
    if (body.action === 'signin' || body.action === 'signout') {
      const out = body.action === 'signout';
      await ntfyPost({ name: body.name, slot: body.slot, team: body.team, role: body.role, status: out ? 'out' : 'in', by: body.name },
        out ? `${body.name} signed out` : `${body.name} signed in · ${body.role || body.team}`, out ? 'wave' : 'white_check_mark', 3);
      return { ok: true, signins: state.signins };
    }
    if (!(await okPin())) throw new Error('Wrong PIN');
    if (body.action === 'verify') return { ok: true };
    if (body.action === 'mark') {
      const out = body.value === 'out';
      await ntfyPost({ name: body.name, slot: body.slot, team: body.team, role: body.role, status: out ? 'out' : 'in', by: body.editor },
        out ? `${body.name} marked not here` : `${body.name} marked present`, out ? 'x' : 'ballot_box_with_check', 2);
      return { ok: true, signins: state.signins };
    }
    throw new Error('Editing names in the app isn\u2019t switched on yet — use the Google Sheet');
  }
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 350));
    if (body.action === 'signin' || body.action === 'signout' || body.action === 'mark') {
      if (body.action === 'mark' && body.pin !== '2711') throw new Error('Wrong PIN');
      const status = body.action === 'signout' || body.value === 'out' ? 'out' : 'in';
      state.signins = state.signins.concat([{ t: hm(now()), name: body.name, slot: body.slot, team: body.team, role: body.role, status, by: body.editor || body.name }]);
      return { ok: true, signins: state.signins };
    }
    if (body.pin !== '2711') throw new Error('Wrong PIN');
    if (body.action === 'write') {
      const row = state.demoRows[body.row - 1];
      row[body.col - 1] = body.value;
      for (let i = 1; i < body.span; i++) row[body.col - 1 + i] = '';
    }
    return { ok: true };
  }
  const res = await fetch(C.SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) }); // text/plain = no CORS preflight
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}

function startEditing() {
  if (!C.SCRIPT_URL && !DEMO && !NTFY()) {
    return openSheet(`<h2>Leader editing</h2><p>In-app editing isn’t switched on yet. Until it is, leaders can edit the Google Sheet directly. The app picks up changes within ${C.REFRESH_SECONDS} seconds.</p>
      <div class="row-btns"><a class="btn primary" href="https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/edit" target="_blank" rel="noopener">Open Google Sheet</a><button class="btn" data-close type="button">Close</button></div>`);
  }
  if (state.model && !state.model.editable && !NTFY()) return toast('Reconnecting to the sheet — try again in a moment', true);
  if (state.leader && state.leader.pin) { state.editing = true; render(); return toast('Leader editing on — tap a name to change it'); }
  openSheet(`<h2>Leader sign-in</h2><p>${DEMO ? '<b>Trial:</b> use any name and PIN <b>2711</b>. Edits stay on this device. ' : ''}Department heads and team leads only. ${NTFY() ? 'You can mark people present on the check-in board.' : 'Your changes go straight into the Google Sheet and everyone sees them.'}</p>
    <form id="lf"><div class="field"><label for="ln">Your name</label><input id="ln" required autocomplete="name" value="${esc(state.me)}"></div>
    <div class="field"><label for="lp">Leader PIN</label><input id="lp" required inputmode="numeric" type="password" autocomplete="off"></div>
    <div class="err" id="le"></div>
    <div class="row-btns"><button class="btn primary" type="submit">Unlock editing</button><button class="btn" data-close type="button">Cancel</button></div></form>`, (sh) => {
    sh.querySelector('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = sh.querySelector('#ln').value.trim(), pin = sh.querySelector('#lp').value.trim();
      const err = sh.querySelector('#le'); err.textContent = 'Checking…';
      try {
        await api({ action: 'verify', pin, editor: name });
        state.leader = { name, pin }; store.set('mp_leader', state.leader); state.editing = true;
        closeSheet(); render(); toast('Welcome ' + name + ' — tap any name to edit');
      } catch (x) { err.textContent = x.message === 'Wrong PIN' ? 'That PIN isn’t right.' : 'Couldn’t check the PIN: ' + x.message; }
    });
  });
}

function openEditor(ref) {
  if (NTFY()) {
    return openSheet(`<h2>Edit in the sheet</h2><p>Changing names inside the app comes once the Google script is connected. For now, edit the Google Sheet and everyone sees it within ${C.REFRESH_SECONDS} seconds.</p>
      <div class="row-btns"><a class="btn primary" href="https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/edit" target="_blank" rel="noopener">Open Google Sheet</a><button class="btn" data-close type="button">Close</button></div>`);
  }
  const m = state.model, s = m.slots.find((x) => x.id === ref.slot);
  const title = ref.kind === 'meta' ? ref.label : `${ref.team} · ${ref.role}`;
  const opts = m.people.map((p) => `<option value="${esc(p.name)}"></option>`).join('');
  openSheet(`<h2>${esc(title)}</h2><p>${esc(s.label)} · ${range(s.start, s.end)}${ref.kind === 'meta' && ref.label === 'Department head' ? '. Type <b>Both</b> for Ife &amp; Dr Joe.' : ''}</p>
    <form id="ef"><div class="field"><label for="ev">Name</label><input id="ev" list="pl" autocomplete="off" maxlength="60" value="${esc(ref.value || '')}" placeholder="Type a name"></div>
    <datalist id="pl">${opts}</datalist>
    <div class="err" id="ee"></div>
    <div class="row-btns"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="clr">Clear</button><button class="btn ghost" data-close type="button">Cancel</button></div></form>`, (sh) => {
    const save = async (value) => {
      const err = sh.querySelector('#ee'); err.textContent = 'Saving to sheet…';
      sh.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try {
        await api({ action: 'write', pin: state.leader.pin, editor: state.leader.name, row: ref.row + 1, col: ref.col + 1, span: ref.span, value,
          slotLabel: ref.slotLabel, kind: ref.kind, label: ref.label, team: ref.team, role: ref.sheetRole || ref.role });
        closeSheet(); toast(value ? `Saved — ${value}` : 'Cleared'); await load(true);
      } catch (x) {
        sh.querySelectorAll('button').forEach((b) => (b.disabled = false));
        if (/pin/i.test(x.message)) { state.leader = null; store.del('mp_leader'); state.editing = false; closeSheet(); render(); return toast('PIN no longer valid — sign in again', true); }
        err.textContent = 'Couldn’t save: ' + x.message;
      }
    };
    sh.querySelector('#ef').addEventListener('submit', (e) => { e.preventDefault(); save(sh.querySelector('#ev').value.trim()); });
    sh.querySelector('#clr').addEventListener('click', () => save(''));
  });
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, bad) {
  const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => (el.className = 'toast'), 2800);
}

/* ---------- install to home screen ---------- */
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstall(); });
function showInstall() {
  if (standalone || store.get('mp_install_dismissed', false)) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios && !deferredPrompt) return;
  const bar = $('#installBar'); bar.hidden = false;
  bar.innerHTML = `<img src="icons/favicon.png" width="34" height="34" alt="" style="border-radius:8px">
    <div class="grow"><b>Add to your home screen</b><br>Open the rota like an app, even with poor signal.</div>
    <button class="btn small primary" type="button" id="instBtn">${ios ? 'How' : 'Install'}</button>
    <button class="icon-btn" style="width:36px;height:36px" type="button" id="instX" aria-label="Dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  bar.querySelector('#instX').onclick = () => { bar.hidden = true; store.set('mp_install_dismissed', true); };
  bar.querySelector('#instBtn').onclick = async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; bar.hidden = true; return; }
    openSheet(`<h2>Add to Home Screen</h2>
      <ol class="steps"><li>Open this page in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button <svg class="ios-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/></svg> at the bottom of the screen.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
      <p>The Messianic Praise icon will appear on your home screen.</p>
      <div class="row-btns"><button class="btn primary" data-close type="button">Got it</button></div>`);
  };
}

/* ---------- splash ---------- */
function runSplash(done) {
  const sp = $('#splash');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // sparks fly out from the tambourine's jingles
  const box = $('#spSparks');
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const el = document.createElement('i');
    el.style.setProperty('--d', `${1.35 + Math.random() * 0.25}s`);
    el.style.width = el.style.height = `${4 + Math.random() * 6}px`;
    el.style.setProperty('--x0', `${Math.cos(a) * 120}px`); el.style.setProperty('--y0', `${Math.sin(a) * 100}px`);
    el.style.setProperty('--x1', `${Math.cos(a) * (170 + Math.random() * 110)}px`); el.style.setProperty('--y1', `${Math.sin(a) * (150 + Math.random() * 100)}px`);
    box.appendChild(el);
  }
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    sp.classList.add('out');
    $('#app').hidden = false; done();
    setTimeout(() => sp.remove(), 800);
  };
  let quick = false;
  try { quick = !!sessionStorage.getItem('mp_seen'); sessionStorage.setItem('mp_seen', '1'); } catch {}
  const len = reduce ? 1100 : quick ? 2700 : 3500;
  const timer = setTimeout(finish, len);
  sp.addEventListener('click', () => { clearTimeout(timer); finish(); });
}

/* ---------- pull down to refresh ---------- */
(() => {
  const ptr = $('#ptr'), lbl = $('#ptrText'); if (!ptr) return;
  const TRIGGER = 72; let y0 = null, pull = 0, busy = false;
  const set = (h) => { ptr.style.height = h + 'px'; ptr.style.opacity = Math.min(1, h / 40); ptr.querySelector('img').style.transform = `rotate(${h * 4}deg)`; };
  window.addEventListener('touchstart', (e) => {
    if (busy || window.scrollY > 0 || !$('#sheet').hidden || e.touches.length > 1 || e.target.closest('.rota-wrap,.chips-scroll,#splash')) { y0 = null; return; }
    y0 = e.touches[0].clientY; pull = 0;
    window.addEventListener('touchmove', onMove, { passive: false });
  }, { passive: true });
  function onMove(e) {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { if (pull) set(0); pull = 0; return; }
    e.preventDefault();
    pull = Math.min(130, dy * 0.55); set(pull);
    lbl.textContent = pull > TRIGGER ? 'Release to refresh' : 'Pull to refresh';
  }
  const endTouch = async () => {
    window.removeEventListener('touchmove', onMove, { passive: false });
    if (y0 == null) return; y0 = null;
    if (pull <= TRIGGER) { ptr.classList.add('ease'); set(0); setTimeout(() => ptr.classList.remove('ease'), 250); pull = 0; return; }
    busy = true; ptr.classList.add('ease', 'spin'); set(64); lbl.textContent = 'Checking the sheet…';
    if (navigator.vibrate) try { navigator.vibrate(10); } catch {}
    await Promise.all([load(), new Promise((r) => setTimeout(r, 600))]);
    lbl.textContent = state.error ? 'Couldn\u2019t reach the sheet' : 'Up to date';
    setTimeout(() => { ptr.classList.remove('spin'); set(0); setTimeout(() => { ptr.classList.remove('ease'); busy = false; }, 260); }, 550);
    pull = 0;
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
})();

/* ---------- boot ---------- */
startNtfy();
runSplash(() => { render(); setSync(); showInstall(); });
load(true);
setInterval(() => { if (document.visibilityState === 'visible') load(true); }, C.REFRESH_SECONDS * 1000);
let lastScroll = 0; window.addEventListener('scroll', () => { lastScroll = Date.now(); }, { passive: true });
setInterval(() => { setSync(); if (document.visibilityState === 'visible' && !$('#sheet').innerHTML && Date.now() - lastScroll > 4000 && (tab === 'now' || tab === 'me' || tab === 'prog')) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(true); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
