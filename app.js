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
const splitNames = (s) => String(s || '').split(/\s*(?:\/|,|&|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
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
    const role = /lead/i.test(roleTxt) ? 'Lead' : /main/i.test(roleTxt) ? 'Main' : /back/i.test(roleTxt) ? 'Backup' : null;
    const tName = v(r, teamCol);
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

  return { slots, teams, people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), source, editable: source === 'script' || source === 'demo' };
}

/* ---------- data loading ---------- */
const state = {
  model: null, updated: null, loading: false, error: null, offline: false,
  me: store.get('mp_me', DEMO ? 'Manny' : ''), demoRows: null, team: store.get('mp_team', ''),
  leader: store.get('mp_leader', null), editing: false
};

async function fetchRows() {
  if (DEMO) { if (!state.demoRows) state.demoRows = window.MP_DEMO_ROWS.map((r) => r.slice()); return { rows: state.demoRows.map((r) => r.slice()), source: 'demo' }; }
  if (C.SCRIPT_URL) {
    const res = await fetch(C.SCRIPT_URL + (C.SCRIPT_URL.includes('?') ? '&' : '?') + 'action=read&t=' + Date.now());
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Read failed');
    return { rows: j.values, source: 'script' };
  }
  const url = `https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(C.SHEET_NAME)}&t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Sheet returned ' + res.status);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('The sheet is not shared publicly');
  return { rows: parseCSV(text), source: 'csv' };
}

async function load(quiet) {
  if (state.loading) return;
  state.loading = true; setSync();
  try {
    const { rows, source } = await fetchRows();
    state.model = buildModel(rows, source);
    state.updated = new Date(); state.error = null; state.offline = false;
    store.set('mp_cache', { rows, source, at: state.updated.toISOString() });
  } catch (e) {
    console.warn(e);
    state.error = e.message || String(e);
    if (!state.model) {
      const cache = store.get('mp_cache', null);
      if (cache) { try { state.model = buildModel(cache.rows, cache.source); state.updated = new Date(cache.at); state.offline = true; } catch {} }
    } else state.offline = true;
    if (!quiet && state.model) toast('Couldn’t reach the sheet — showing the last saved copy', true);
  } finally {
    state.loading = false; setSync(); render();
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
  return out.sort((a, b) => a.from - b.from || a.slot.i - b.slot.i);
}

/* ---------- chips ---------- */
function chip(name, role, ref, note) {
  const cls = role.toLowerCase();
  const me = name && isMe(name) ? ' me' : '';
  const label = name ? esc(name) + (note ? ` <small style="opacity:.7;font-weight:500">&nbsp;${esc(note)}</small>` : '') : 'Not set';
  const data = ref ? ` data-edit='${esc(JSON.stringify(ref))}'` : '';
  const aria = `${role}: ${name || 'not set'}`;
  return `<button type="button" class="chip ${name ? cls : 'empty-slot'}${me}"${data} aria-label="${esc(aria)}"${ref && state.editing ? '' : ' tabindex="-1"'}>${label}</button>`;
}
function cellChips(team, ro, s, t) {
  const cell = ro.cells[s.id];
  const ref = state.editing ? { kind: 'cell', team: team.name, role: ro.role, slot: s.id, row: cell.row, col: cell.col, span: cell.span, value: cell.segs.map((x) => x.name).join(' / ') } : null;
  const names = namesFor(cell, t);
  if (!names.length) return chip('', ro.role, ref);
  return names.map((n) => chip(n.name, ro.role, ref, n.note)).join('');
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
      const leadCell = next.teamObj ? next.teamObj.roles.find((r) => r.role === 'Lead') : null;
      const leadNames = leadCell ? namesFor(leadCell.cells[s.id], live ? t : null).map((n) => n.name).join(', ') : '';
      const mates = next.teamObj ? next.teamObj.roles.filter((r) => r.role !== next.role).flatMap((r) => namesFor(r.cells[s.id]).map((n) => `${n.name} (${r.role})`)).filter((x) => !isMe(x.replace(/\s*\(.*\)$/, ''))) : [];
      hero = `<section class="hero ${live ? 'live' : ''}">
          <div class="kicker">${live ? 'You’re on now' : 'Your next shift'}</div>
          <div class="hero-top"><div class="h-display">${esc(s.label)}</div>
            <div class="hero-when">${live ? 'Ends in ' + dur(next.to - t) : 'Starts in ' + dur(next.from - t)}</div></div>
          <div class="hero-time">${range(next.from, next.to)}</div>
          <div class="chips"><span class="pill dark">${esc(next.team)}</span><span class="pill outline">${esc(next.role === 'Leader' ? 'On duty' : next.role)}</span></div>
        </section>
        <div class="card people">
          ${next.teamObj ? `<div class="row"><span>${esc(next.team)} team lead</span><span>${esc(next.role === 'Lead' ? 'You' : leadNames || 'TBC')}</span></div>` : ''}
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
        <div class="section-title"><span class="kicker">On duty by team</span><span class="kicker">Lead · Main · Backup</span></div>
        ${roster(s, true)}`;
    });
    const nextCard = upcoming ? `<div class="card next-card"><b>Up next:</b> ${esc(upcoming.label)} · ${range(upcoming.start, upcoming.end)} · Dept head ${esc(upcoming.headDisplay || 'TBC')}</div>` : '';
    return blocks.join('<div style="height:28px"></div>') + nextCard + legend;
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
          ${team.roles.map((ro) => `<div class="tl-line"><span class="role-tag ${ro.role.toLowerCase()}">${ro.role}</span><span class="chipset">${cellChips(team, ro, s, null)}</span></div>`).join('')}
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
      const mRef = state.editing && s.ministerRow >= 0 ? esc(JSON.stringify({ kind: 'meta', label: 'Minister in charge', slot: s.id, row: s.ministerRow, col: s.c0, span: s.span, value: s.minister })) : '';
      const hRef = state.editing && s.headRow >= 0 ? esc(JSON.stringify({ kind: 'meta', label: 'Department head', slot: s.id, row: s.headRow, col: s.c0, span: s.span, value: s.head })) : '';
      const mTxt = state.editing ? `<button type="button" data-edit='${mRef}'>${esc(s.minister || 'Set minister')}</button>` : esc(s.minister || 'TBC');
      const hTxt = state.editing ? `<button type="button" data-edit='${hRef}'>${esc(s.head || 'Set head')}</button>` : esc(s.headDisplay || 'TBC');
      return `<th class="${st === 'now' ? 'now' : ''}" scope="col"><div class="sl">${esc(s.label)}</div><div class="tm">${range(s.start, s.end)}</div>
        <div class="hd">Head: ${hTxt}</div><div class="hd">Minister: ${mTxt}</div></th>`;
    }).join('');
    const body = m.teams.map((tm) => `<tr><td class="team" scope="row">${esc(tm.name)}</td>${m.slots.map((s) => `<td class="${slotState(s, t) === 'now' ? 'now' : ''}"><div class="stack">${
      tm.roles.map((ro) => cellChips(tm, ro, s, null)).join('')}</div></td>`).join('')}</tr>`).join('');
    return `<div class="kicker">${esc(C.VENUE)} · Fri 27 Nov</div>
      <div class="h-display" style="color:var(--gold);margin-top:4px">Full media rota</div>
      <div class="rota-actions">
        <button class="btn small" type="button" id="findMe"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>${state.me ? 'Highlighting ' + esc(state.me) : 'Find my name'}</button>
        <button class="btn small" type="button" id="printBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>Print / PDF</button>
        <a class="btn small ghost" href="${sheetUrl}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>Open Google Sheet</a>
      </div>
      <div class="legend"><span><i style="background:var(--gold)"></i>Lead</span><span><i style="background:#fff"></i>Main</span><span><i style="border:1.5px solid #5A6A9E"></i>Backup</span><span><i style="background:#1F3170;outline:2px solid var(--gold)"></i>On now</span></div>
      <div class="rota-wrap"><table class="rota"><thead><tr><th class="team" scope="col">Team</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
};

/* ---------- render ---------- */
let tab = (location.hash || '').slice(1);
function render() {
  if (!['me', 'now', 'teams', 'rota'].includes(tab)) tab = state.me ? 'me' : 'now';
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
window.addEventListener('hashchange', () => { tab = location.hash.slice(1); render(); window.scrollTo(0, 0); });

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a');
  if (!el) return;
  if (el.id === 'pickMe' || el.id === 'findMe') return pickName();
  if (el.id === 'retry' || el.id === 'syncBtn') return load();
  if (el.id === 'printBtn') return window.print();
  if (el.id === 'leaderBtn') return state.editing ? stopEditing() : startEditing();
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
    <div class="grow"><b>Leader editing on</b> (${esc(state.leader?.name || '')}). Tap any name in Teams or Full rota to change it.</div>
    <button class="btn small" type="button" id="leaderBtnOff">Done</button>`;
  bar.querySelector('#leaderBtnOff').onclick = stopEditing;
}
function stopEditing() { state.editing = false; render(); toast('Leader editing off'); }

async function api(body) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 350));
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
  if (!C.SCRIPT_URL && !DEMO) {
    return openSheet(`<h2>Leader editing</h2><p>In-app editing isn’t switched on yet. Until it is, leaders can edit the Google Sheet directly. The app picks up changes within ${C.REFRESH_SECONDS} seconds.</p>
      <div class="row-btns"><a class="btn primary" href="https://docs.google.com/spreadsheets/d/${C.SHEET_ID}/edit" target="_blank" rel="noopener">Open Google Sheet</a><button class="btn" data-close type="button">Close</button></div>`);
  }
  if (state.model && !state.model.editable) return toast('Reconnecting to the sheet — try again in a moment', true);
  if (state.leader && state.leader.pin) { state.editing = true; render(); return toast('Leader editing on — tap a name to change it'); }
  openSheet(`<h2>Leader sign-in</h2><p>${DEMO ? '<b>Trial:</b> use any name and PIN <b>2711</b>. Edits stay on this device. ' : ''}Department heads and team leads only. Your changes go straight into the Google Sheet and everyone sees them.</p>
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
        await api({ action: 'write', pin: state.leader.pin, editor: state.leader.name, row: ref.row + 1, col: ref.col + 1, span: ref.span, value });
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

/* ---------- boot ---------- */
runSplash(() => { render(); setSync(); showInstall(); });
load(true);
setInterval(() => { if (document.visibilityState === 'visible') load(true); }, C.REFRESH_SECONDS * 1000);
setInterval(() => { setSync(); if (document.visibilityState === 'visible' && !$('#sheet').innerHTML && (tab === 'now' || tab === 'me')) render(); }, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(true); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
