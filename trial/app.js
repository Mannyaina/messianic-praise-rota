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
const DEMO = !!C.DEMO;
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
  const minL = find(/minister/i), headL = find(/head/i, /team/i), coordL = find(/co-?ordinat/i);

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
      minister: minL ? firstIn(minL.r, c0, c1) : '', coord: coordL ? firstIn(coordL.r, c0, c1) : '', head: headL ? firstIn(headL.r, c0, c1) : '',
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
  slots.forEach((s) => { add(s.minister, 'Minister in charge'); add(s.headDisplay, 'Department head'); add(s.coord, 'MP Media Coordinator'); });

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
    if (isMe(s.coord)) out.push({ slot: s, team: 'MP Media Coordinator', role: 'Leader', from: s.start, to: s.end });
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
  if (ntfyReady) leaderAlert(fresh);
  return true;
}
let ntfyReady = false;

/* ---------- in-app alerts for leaders (sound + vibration + banner while the app is open) ---------- */
const alertsOn = () => !!state.leader && store.get('mp_alerts', true);
let actx = null;
document.addEventListener('click', () => { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {} }, { capture: true });
function chime(kind) {
  try {
    if (!actx) return;
    const notes = kind === 'warn' ? [740, 554] : kind === 'info' ? [659, 880] : [880, 1175];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.16;
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.start(t0); o.stop(t0 + 0.4);
    });
  } catch {}
}
function showAlert(title, body, kind) {
  const box = $('#alerts'); if (!box) return;
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'alert a-' + (kind || 'ok');
  el.innerHTML = `<span class="a-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${kind === 'warn' ? 'M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' : kind === 'info' ? 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' : 'M5 12l5 5L20 7'}"/></svg></span>
    <span class="a-tx"><b>${esc(title)}</b><span>${esc(body)}</span></span>`;
  el.onclick = () => { el.remove(); location.hash = '#now'; };
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 400); }, kind === 'warn' ? 12000 : 7000);
  chime(kind);
  if (navigator.vibrate) try { navigator.vibrate(kind === 'warn' ? [120, 60, 120, 60, 120] : [80, 40, 80]); } catch {}
}
/* lock-screen notifications (OneSignal) — leaders only */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let osReady = null;
function loadOneSignal() {
  if (osReady) return osReady;
  osReady = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const dir = location.pathname.replace(/[^/]*$/, '');            // e.g. /messianic-praise-rota/
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({ appId: C.ONESIGNAL_APP_ID, serviceWorkerPath: dir.slice(1) + 'sw.js', serviceWorkerParam: { scope: dir },
          notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true });
        resolve(OneSignal);
      } catch (e) { reject(e); }
    });
    const sc = document.createElement('script');
    sc.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; sc.defer = true;
    sc.onerror = () => reject(new Error('Could not load the notification service'));
    document.head.appendChild(sc);
  });
  return osReady;
}
const pushOn = () => store.get('mp_push', false);
const remindOn = () => store.get('mp_remind', false);
function needHomeScreen() {
  return openSheet(`<h2>Add the app first</h2><p>On iPhone, notifications only work from the app on your home screen.</p>
      <ol class="steps"><li>Open this page in <b>Safari</b> and tap <b>Share</b> <svg class="ios-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/></svg></li>
      <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open the app from your home screen and tap the button again.</li></ol>
      <div class="row-btns"><button class="btn primary" data-close type="button">Got it</button></div>`);
}
async function subscribe(tags, silent) {
  if (!('Notification' in window)) { if (!silent) toast('This phone can\u2019t show notifications from web apps — try updating it', true); return false; }
  // ask straight away, inside the tap — iPhone ignores permission requests made after a delay
  let ask = Promise.resolve(Notification.permission);
  if (Notification.permission === 'default') { try { ask = Promise.resolve(Notification.requestPermission()); } catch { ask = Promise.resolve('default'); } }
  if (!silent) toast('Asking your phone for permission…');
  const [perm, OS] = await Promise.all([ask.catch(() => 'default'), loadOneSignal()]);
  if (perm !== 'granted' && Notification.permission !== 'granted') {
    if (!silent) toast(perm === 'denied' ? 'Notifications are blocked — turn them on for this app in Settings' : 'Notifications not allowed yet — tap the button to try again', true);
    return false;
  }
  await OS.User.PushSubscription.optIn();
  await OS.User.addTags(tags);
  return true;
}
let remBusy = false;
async function enableReminders(silent) {
  silent = silent === true;
  if (!C.ONESIGNAL_APP_ID || !state.me || remBusy) return;
  if (isIOS && !isStandalone()) return silent ? undefined : needHomeScreen();
  remBusy = true;
  try {
    if (!(await subscribe({ person: key(state.me) }, silent))) return;
    const was = remindOn();
    store.set('mp_remind', true); render();
    if (!silent || !was) showAlert('Shift reminders are on', `We\u2019ll remind ${state.me} 30 minutes before each shift`, 'ok');
  } catch (e) { console.warn(e); if (!silent) toast('Couldn\u2019t turn on reminders: ' + (e.message || e), true); }
  finally { remBusy = false; }
}
async function disableReminders() {
  try { const OS = await loadOneSignal(); await OS.User.removeTag('person'); if (!pushOn()) await OS.User.PushSubscription.optOut(); } catch {}
  store.set('mp_remind', false); render(); toast('Shift reminders off');
}
async function enablePush() {
  if (!C.ONESIGNAL_APP_ID) return;
  if (isIOS && !isStandalone()) return needHomeScreen();
  try {
    if (!(await subscribe({ leader: '1', name: (state.leader && state.leader.name) || '' }))) return;
    store.set('mp_push', true); renderLeaderBar();
    showAlert('Lock-screen alerts are on', 'You\u2019ll get sign-in alerts even when your phone is locked', 'ok');
  } catch (e) { console.warn(e); toast('Couldn\u2019t turn on alerts: ' + (e.message || e), true); }
}
async function disablePush() {
  try { const OS = await loadOneSignal(); await OS.User.removeTag('leader'); if (!remindOn()) await OS.User.PushSubscription.optOut(); } catch {}
  store.set('mp_push', false); renderLeaderBar(); toast('Lock-screen alerts off');
}

function leaderAlert(recs) {
  if (!alertsOn() || document.hidden) return;
  const others = recs.filter((r) => key(r.by) !== key(state.leader.name) && key(r.name) !== key(state.leader.name));
  if (!others.length) return;
  if (others.length > 3) {
    const ins = others.filter((r) => r.status === 'in');
    return showAlert(`${others.length} check-in updates`, ins.map((r) => r.name).join(', ') || 'Open Live now to see who', 'ok');
  }
  for (const r of others) {
    const marked = key(r.by) !== key(r.name);
    if (r.status === 'in') showAlert(marked ? `${r.name} marked present` : `${r.name} signed in`, `${r.slot} · ${r.role || r.team}${marked ? ' · by ' + r.by : ''}`, 'ok');
    else showAlert(marked ? `${r.name} marked not here` : `${r.name} signed out`, `${r.slot} · ${r.team}`, 'info');
  }
}
function shiftAlerts() {
  if (!alertsOn() || document.hidden || !state.model || !SIGNIN_ON()) return;
  const t = now();
  for (const s of state.model.slots) {
    const ppl = slotPeople(s); if (!ppl.length) continue;
    const mins = (t - s.start) / 60000;
    const seen = (k) => { try { if (sessionStorage.getItem(k)) return true; sessionStorage.setItem(k, '1'); } catch {} return false; };
    if (mins >= -15 && mins < 0 && !seen('al_pre_' + s.label)) {
      const n = ppl.filter((p) => checkStatus(p, s, t).st === 'in').length;
      showAlert(`${s.label} starts at ${hm(s.start)}`, `${n} of ${ppl.length} signed in so far`, 'info');
    }
    if (mins >= 10 && mins < 30 && !seen('al_miss_' + s.label)) {
      const miss = ppl.filter((p) => checkStatus(p, s, t).st !== 'in');
      if (miss.length) showAlert(`${s.label} · ${miss.length} not signed in`, miss.slice(0, 8).map((p) => p.name).join(', ') + (miss.length > 8 ? ` and ${miss.length - 8} more` : ''), 'warn');
      else showAlert(`${s.label} · everyone is in`, `All ${ppl.length} signed in`, 'ok');
    }
  }
}
let ntfyKick = null;
function pollNtfy() {
  if (!NTFY()) return Promise.resolve();
  return fetch(`https://ntfy.sh/${encodeURIComponent(C.NTFY_LOG)}/json?poll=1&since=all`, { cache: 'no-store' }).then((r) => r.text()).then((t) => {
    if (addNtfy(t.split('\n').filter(Boolean).map((l) => { try { const m = JSON.parse(l); return m.event === 'message' ? ntfyRec(m) : null; } catch { return null; } }))) render();
    ntfyReady = true;
  }).catch(() => {});
}
function startNtfy() {
  if (!NTFY() || es) return;
  const base = `https://ntfy.sh/${encodeURIComponent(C.NTFY_LOG)}`;
  pollNtfy(); // everything already signed in, then listen live
  setInterval(() => { if (document.visibilityState === 'visible') pollNtfy(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollNtfy(); });
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
  if (C.ALERTS_URL) fetch(C.ALERTS_URL, { method: 'POST', body: '{}', mode: 'no-cors' }).catch(() => {});
  fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic: C.NTFY_TOPIC, title, message: `${rec.slot} · ${rec.team}${rec.role ? ' · ' + rec.role : ''} · ${hm(now())}`, tags: [tags], priority: prio }) }).catch(() => {});
}
/* ---------- app check-in: lets leaders see who has the app, whether it's on their home screen and notifications are on ---------- */
function deviceId() { let d = store.get('mp_dev', ''); if (!d) { d = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); store.set('mp_dev', d); } return d; }
function phoneKind() { const u = navigator.userAgent; return isIOS ? (/ipad/i.test(u) || navigator.maxTouchPoints > 1 && !/iphone/i.test(u) ? 'iPad' : 'iPhone') : /android/i.test(u) ? 'Android' : 'Computer'; }
function notifState() { return !('Notification' in window) ? 'Not supported' : Notification.permission === 'granted' ? (remindOn() || pushOn() ? 'On' : 'Allowed') : Notification.permission === 'denied' ? 'Blocked' : 'Off'; }
function pingSeen(force) {
  if (DEMO || !C.NTFY_SEEN || !navigator.onLine) return;
  const rec = { dev: deviceId(), name: (state.leader && state.leader.name) || state.me || '', viewing: state.me || '', home: isStandalone() ? 'Yes' : 'No', notif: notifState(), phone: phoneKind(), leader: state.leader ? 'Yes' : 'No', v: MY_V };
  const sig = JSON.stringify(rec), last = store.get('mp_ping', { at: 0, sig: '' });
  if (!force && last.sig === sig && Date.now() - last.at < 20 * 60000) return; // at most every 20 min unless something changed
  store.set('mp_ping', { at: Date.now(), sig });
  fetch(`https://ntfy.sh/${encodeURIComponent(C.NTFY_SEEN)}`, { method: 'POST', body: sig }).catch(() => {});
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
async function doSign(action, a, btn) {
  if (btn) { if (btn.disabled) return; btn.disabled = true; }
  try {
    const j = await api({ action, name: state.me, slot: a.slot.label, team: a.team, role: a.role });
    if (j.signins) state.signins = j.signins;
    render();
    toast(action === 'signin' ? `Signed in — ${a.slot.headDisplay || 'your head'} has been told` : 'Signed out — thank you for serving!');
  } catch (x) { if (btn) btn.disabled = false; toast('Couldn\u2019t sign in — check your signal and try again', true); }
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
    ${state.editing ? `<div class="b-hint">Leader: tap a name to mark them present or not here.${C.ONESIGNAL_APP_ID && pushOn() ? ' · Lock-screen alerts on · <button type="button" class="linkish" id="pushOffLink">turn off</button>' : ''}</div>` : ''}
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
      } catch (x) {
        if (/pin/i.test(x.message)) { state.leader = null; store.del('mp_leader'); state.editing = false; closeSheet(); render(); return toast('PIN no longer valid — tap the padlock and sign in again', true); }
        sh.querySelector('#me2').textContent = 'Couldn\u2019t save: ' + x.message;
      }
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

function signBlock(a, t, extra) {
  if (!SIGNIN_ON() || !a || !a.slot) return '';
  const opens = new Date(+a.from - 30 * 60000);
  const r = sigOf(state.me, a.slot.label);
  const i = (window.__signList = extra ? window.__signList || [] : []).push(a) - 1;
  if (r) return `<div class="signed card"><span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>Signed in${extra ? ' for ' + esc(a.slot.label) : ''}${sigTime(r) ? ' at ' + sigTime(r) : ''}${r.by && key(r.by) !== key(state.me) ? ' by ' + esc(r.by) : ''}</span>
    <button type="button" class="btn small" data-sign="signout:${i}">Sign out</button></div>`;
  if (t < opens) return extra ? '' : `<div class="sign-later">Sign-in opens at ${hm(opens)}, 30 minutes before your shift.</div>`;
  if (t >= a.to) return '';
  return `<button type="button" class="sign-btn" data-sign="signin:${i}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>${extra ? 'Sign in for ' + esc(a.slot.label) : 'I\u2019m here — sign in'}</button>
    ${extra ? '' : '<div class="sign-later">Your department head is told straight away.</div>'}`;
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

/* Set-Up / Set-Down: one name per person per team instead of repeating it for every role */
function setNames(tm, s) {
  if (state.editing || !/set/i.test(s.label)) return null;
  const out = [], seen = new Set();
  for (const ro of tm.roles) for (const n of namesFor(ro.cells[s.id])) { const k = key(n.name); if (!seen.has(k)) { seen.add(k); out.push({ name: n.name, role: ro.role }); } }
  return out;
}
const setChips = (list) => list.length ? list.map((n) => chip(n.name, n.role, null, '', false)).join('') : chip('', 'Main', null, '', false);
function teamChips(tm, s, t, noRole) {
  const one = setNames(tm, s);
  return one ? setChips(one) : tm.roles.map((ro) => cellChips(tm, ro, s, t, noRole)).join('');
}
function teamLines(tm, s) {
  const one = setNames(tm, s);
  if (one) return `<div class="tl-line"><span class="role-tag lead">On duty</span><span class="chipset">${setChips(one)}</span></div>`;
  return tm.roles.map((ro) => `<div class="tl-line"><span class="role-tag ${roleKind(ro.role)}">${esc(ro.role)}</span><span class="chipset">${cellChips(tm, ro, s, null, true)}</span></div>`).join('');
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
      const mates = next.teamObj ? next.teamObj.roles.filter((r) => !next.roles.includes(r.role)).flatMap((r) => namesFor(r.cells[s.id]).filter((n) => !isMe(n.name)).map((n) => n.name)).filter((n, i, all) => all.indexOf(n) === i) : [];
      hero = `<section class="hero ${live ? 'live' : ''}">
          <div class="kicker">${live ? 'You’re on now' : 'Your next shift'}</div>
          <div class="hero-top"><div class="h-display">${esc(s.label)}</div>
            <div class="hero-when">${live ? 'Ends in ' + dur(next.to - t) : 'Starts in ' + dur(next.from - t)}</div></div>
          <div class="hero-time">${range(next.from, next.to)}</div>
          <div class="chips"><span class="pill dark">${esc(next.role === 'Leader' ? next.team : /set/i.test(s.label) ? 'On duty' : next.role)}</span></div>
        </section>
        ${signBlock(next, t)}${mine.filter((a) => a !== next && a.slot.label !== next.slot.label && t >= a.from - 30 * 60000 && t < a.to && !mine.some((b) => b !== a && b.slot.label === a.slot.label && mine.indexOf(b) < mine.indexOf(a))).map((a) => signBlock(a, t, true)).join('')}
        <div class="card people">
          ${next.teamObj && leadCell ? `<div class="row"><span>${esc(next.team)} · ${esc(leadCell ? leadCell.role : 'Lead')}</span><span>${esc(leadCell && next.roles.includes(leadCell.role) ? 'You' : leadNames || 'TBC')}</span></div>` : ''}
          ${mates.length ? `<div class="row"><span>With you</span><span>${esc(mates.slice(0, 4).join(', ') + (mates.length > 4 ? ` and ${mates.length - 4} more` : ''))}</span></div>` : ''}
          <div class="row"><span>Department head</span><span>${esc(s.headDisplay || 'TBC')}</span></div>${s.coord ? `<div class="row"><span>MP Media Coordinator</span><span>${esc(s.coord)}</span></div>` : ''}
          <div class="row"><span>Minister in charge</span><span>${esc(s.minister || 'TBC')}</span></div>
        </div>`;
    } else {
      hero = `<div class="card empty" style="margin-top:14px"><strong>All done — thank you!</strong>Every one of your shifts is finished. God bless you for serving.</div>`;
    }
    const list = mine.map((a) => {
      const st = t >= a.to ? 'done' : t >= a.from ? 'now' : a === next ? 'next' : 'later';
      const word = { done: 'Done', now: 'On now', next: 'Next', later: 'Later' }[st];
      return `<div class="shift-item is-${st}"><div class="slot st-${st}">${esc(a.slot.label)}</div>
        <div class="mid"><b>${range(a.from, a.to)}</b><small>${esc(a.team)}${/set/i.test(a.slot.label) ? '' : ' · ' + esc(a.role)}</small></div>
        <span class="state st-${st}">${word}</span></div>`;
    }).join('');
    const remind = C.ONESIGNAL_APP_ID ? (remindOn()
      ? `<div class="remind card on"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>Shift reminders on</span></div>`
      : `<button type="button" class="remind-btn" id="remOn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg><span><b>Turn on shift reminders</b><small>Required for the media team · a notification 30 minutes before each shift</small></span></button>`) : '';
    return who + hero + remind + `<div class="section-title"><span class="kicker">All my shifts</span><span class="kicker">${mine.length}</span></div><div class="shift-list">${list}</div>`;
  },

  now() {
    const m = state.model, t = now();
    const act = activeSlots(t);
    const first = m.slots.reduce((a, b) => (b.start < a.start ? b : a), m.slots[0]);
    const lastEnd = Math.max(...m.slots.map((s) => +s.end));
    const legend = `<div class="legend"><span><i style="background:var(--gold)"></i>Lead</span><span><i style="background:#fff"></i>Main</span><span><i style="border:1.5px solid #5A6A9E"></i>Backup</span>${state.me ? '<span><i style="box-shadow:0 0 0 2px var(--live)"></i>You</span>' : ''}</div>`;
    const roster = (s, live) => `<div class="team-rows">${m.teams.map((tm) => `<div class="team-row"><div class="tn">${esc(tm.name)}</div><div class="names">${
      teamChips(tm, s, live ? t : null)}</div></div>`).join('')}</div>`;

    if (t < first.start) {
      const ms = first.start - t, d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60;
      return `<div class="kicker">Countdown to ${esc(first.label)}</div>
        <div class="slot-title"><div class="h-display">${first.start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div><div class="t">${hm(first.start)}</div></div>
        <div class="countdown"><div><b>${d}</b><span>days</span></div><div><b>${h}</b><span>hrs</span></div><div><b>${mi}</b><span>mins</span></div></div>
        <div class="card next-card"><b>${esc(C.VENUE)}</b> · Minister in charge: ${esc(first.minister || 'TBC')} · Heads: ${esc(first.headDisplay || 'TBC')}${first.coord ? ' · MP Media Coordinator: ' + esc(first.coord) : ''}</div>
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
        <div class="duo"><div class="card"><small>Department head</small><b>${esc(s.headDisplay || 'TBC')}</b></div><div class="card"><small>Minister in charge</small><b>${esc(s.minister || 'TBC')}</b></div>${s.coord ? `<div class="card" style="grid-column:1/-1"><small>MP Media Coordinator</small><b>${esc(s.coord)}</b></div>` : ''}</div>
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
          ${teamLines(team, s)}
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
        <div class="hd">Head: ${hTxt}</div><div class="hd">Minister: ${mTxt}</div>${s.coord ? `<div class="hd">MP Media Coordinator: ${esc(s.coord)}</div>` : ''}</th>`;
    }).join('');
    const body = m.teams.map((tm) => `<tr><td class="team" scope="row">${esc(tm.name)}</td>${m.slots.map((s) => `<td class="${slotState(s, t) === 'now' ? 'now' : ''}"><div class="stack">${
      teamChips(tm, s, null)}</div></td>`).join('')}</tr>`).join('');
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
        teamLines(tm, sel)}</div>`).join('');
      body2 = `<div class="chips-scroll rslots" role="group" aria-label="Choose shift">${tabs}</div>
        <div class="rt-head card ${st === 'now' ? 'now' : ''}">
          <div><div class="rt-slot">${esc(sel.label)}</div><div class="rt-time">${range(sel.start, sel.end)}${st === 'now' ? ' · <b style="color:var(--live)">ON NOW</b>' : st === 'done' ? ' · finished' : ''}</div></div>
          <div class="rt-meta"><div>Head: ${state.editing ? `<button type="button" class="linkish" data-edit='${hRef}'>${esc(sel.head || 'Set head')}</button>` : `<b>${esc(sel.headDisplay || 'TBC')}</b>`}</div>
          <div>Minister: ${state.editing ? `<button type="button" class="linkish" data-edit='${mRef}'>${esc(sel.minister || 'Set minister')}</button>` : `<b>${esc(sel.minister || 'TBC')}</b>`}</div>${sel.coord ? `<div>MP Media Coordinator: <b>${esc(sel.coord)}</b></div>` : ''}</div>
        </div>
        <div class="rt-list">${teams}</div>`;
    }
    return `<div class="kicker">${esc(C.VENUE)} · Fri 27 Nov</div>
      <div class="h-display" style="color:var(--gold);margin-top:4px">Full media rota</div>
      <div class="rota-actions">
        <button class="btn small" type="button" id="findMe"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>${state.me ? 'Highlighting ' + esc(state.me) : 'Find my name'}</button>
 ${state.editing ? `<a class="btn small ghost" href="${sheetUrl}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>Open Google Sheet</a>` : ''}
      </div>
      <div class="legend"><span><i style="background:var(--gold)"></i>Lead</span><span><i style="background:#fff"></i>Main</span><span><i style="border:1.5px solid #5A6A9E"></i>Backup</span><span><i style="background:#1F3170;outline:2px solid var(--gold)"></i>On now</span></div>
      ${wide ? `<div class="rota-wrap"><table class="rota"><thead><tr><th class="team" scope="col">Team</th>${head}</tr></thead><tbody>${body}</tbody></table></div>` : body2}`;
  }
};

/* ---------- render ---------- */
let tab = (location.hash || '').slice(1);
let pingT = 0;
function render() {
  clearTimeout(pingT); pingT = setTimeout(() => { try { pingSeen(); } catch {} }, 3000);
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
  if (el.id === 'leaderBtn') return state.editing ? stopEditing() : startEditing();
  if (el.id === 'pushOffLink') return disablePush();
  if (el.id === 'remOn') return enableReminders();
  if (el.dataset.sign) { const [act, n] = el.dataset.sign.split(':'); const a = (window.__signList || [])[+n || 0]; return a ? doSign(act, a, el) : undefined; }
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
      if (b) { state.me = b.dataset.name; store.set('mp_me', state.me);
        if (remindOn()) loadOneSignal().then((OS) => OS.User.addTags({ person: key(state.me) })).catch(() => {});
        else if (C.ONESIGNAL_APP_ID && !(isIOS && !isStandalone()) && 'Notification' in window && Notification.permission !== 'denied') enableReminders(true); closeSheet(); if (tab !== 'rota') location.hash = '#me'; render(); toast('Showing shifts for ' + state.me); }
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
  if (!state.editing || (C.ONESIGNAL_APP_ID && pushOn())) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>
    <div class="grow"><b>Leader mode</b> (${esc(state.leader?.name || '')}). Turn on lock-screen alerts below. Tap the padlock to leave leader mode.</div>
    <button class="btn small" type="button" id="alertTgl" aria-pressed="${alertsOn()}">${alertsOn() ? 'Sound on' : 'Sound off'}</button>
    ${C.ONESIGNAL_APP_ID ? `<button class="btn small ${pushOn() ? '' : 'primary'}" type="button" id="pushTgl">${pushOn() ? 'Lock-screen alerts on' : 'Lock-screen alerts'}</button>` : ''}
`;
  const pt = bar.querySelector('#pushTgl'); if (pt) pt.onclick = () => (pushOn() ? disablePush() : enablePush());
  bar.querySelector('#alertTgl').onclick = () => { const on = !alertsOn(); store.set('mp_alerts', on); renderLeaderBar(); if (on) showAlert('Alerts are on', 'You\u2019ll hear and see each sign-in while the app is open', 'ok'); else toast('Alerts off'); };
}
function stopEditing() { state.editing = false; store.set('mp_editing', false); render(); toast('Leader mode off'); }

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
      <div class="row-btns"><button class="btn" data-close type="button">Close</button></div>`);
  }
  if (state.model && !state.model.editable && !NTFY()) return toast('Reconnecting to the sheet — try again in a moment', true);
  if (state.leader && state.leader.pin) {
    // re-check a remembered PIN (it may have been changed since)
    return api({ action: 'verify', pin: state.leader.pin, editor: state.leader.name }).then(() => {
      state.editing = true; store.set('mp_editing', true); render(); toast(NTFY() ? 'Leader mode on — tap names on the check-in board' : 'Leader editing on — tap a name to change it');
    }, () => { state.leader = null; store.del('mp_leader'); toast('The leader PIN has changed — please enter the new one', true); startEditing(); });
  }
  openSheet(`<h2>Leader mode</h2><p>${DEMO ? '<b>Trial:</b> use any name and PIN <b>2711</b>. Edits stay on this device. ' : ''}Department heads and team leads only. ${NTFY() ? 'You can mark people present on the check-in board.' : 'Your changes go straight into the Google Sheet and everyone sees them.'}</p>
    <form id="lf"><div class="field"><label for="ln">Your name</label><input id="ln" required autocomplete="name" value="${esc(state.me)}"></div>
    <div class="field"><label for="lp">Leader PIN</label><input id="lp" required inputmode="numeric" type="password" autocomplete="off"></div>
    <div class="err" id="le"></div>
    <div class="row-btns"><button class="btn primary" type="submit">${NTFY() ? 'Unlock leader mode' : 'Unlock editing'}</button><button class="btn" data-close type="button">Cancel</button></div></form>`, (sh) => {
    sh.querySelector('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = sh.querySelector('#ln').value.trim(), pin = sh.querySelector('#lp').value.trim();
      const err = sh.querySelector('#le'); err.textContent = 'Checking…';
      try {
        await api({ action: 'verify', pin, editor: name });
        state.leader = { name, pin }; store.set('mp_leader', state.leader); state.editing = true; store.set('mp_editing', true);
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
    el.style.setProperty('--d', `${0.9 + Math.random() * 0.2}s`);
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
    setTimeout(() => sp.remove(), 600);
  };
  // full opening once a day; a quick 0.7s version on every other open
  const today = new Date().toDateString();
  const quick = store.get('mp_splash_day', '') === today;
  store.set('mp_splash_day', today);
  if (quick) sp.classList.add('quick');
  const len = reduce ? 600 : quick ? 700 : 2100;
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
    await Promise.all([load(), pollNtfy(), new Promise((r) => setTimeout(r, 600))]);
    lbl.textContent = state.error ? 'Couldn\u2019t reach the sheet' : 'Up to date';
    setTimeout(() => { ptr.classList.remove('spin'); set(0); setTimeout(() => { ptr.classList.remove('ease'); busy = false; }, 260); }, 550);
    pull = 0;
  };
  window.addEventListener('touchend', endTouch); window.addEventListener('touchcancel', endTouch);
})();

/* ---------- boot ---------- */
(() => {
  const cache = store.get('mp_cache', null);
  if (cache && cache.source !== 'demo' && !DEMO) {
    try { state.model = buildModel(cache.rows, cache.source); state.sig = JSON.stringify(cache.rows) + JSON.stringify(state.signins); state.updated = new Date(cache.at); } catch {}
  }
})();
if (state.leader && state.leader.pin && store.get('mp_editing', false)) {
  state.editing = true;
  api({ action: 'verify', pin: state.leader.pin, editor: state.leader.name }).catch(() => {
    state.leader = null; state.editing = false; store.del('mp_leader'); store.set('mp_editing', false); render();
    toast('The leader PIN has changed — tap the padlock to sign in again', true);
  });
}
if (C.ONESIGNAL_APP_ID && state.me && !remindOn() && 'Notification' in window && Notification.permission === 'granted') setTimeout(() => enableReminders(true), 3500);
if ((pushOn() || remindOn()) && C.ONESIGNAL_APP_ID) setTimeout(() => loadOneSignal().catch(() => {}), 3000);
startNtfy();
runSplash(() => { render(); setSync(); showInstall(); });
load(true);
setInterval(() => { if (document.visibilityState === 'visible') load(true); }, C.REFRESH_SECONDS * 1000);
setInterval(shiftAlerts, 30000); setTimeout(shiftAlerts, 4000);
let lastScroll = 0; window.addEventListener('scroll', () => { lastScroll = Date.now(); }, { passive: true });
setInterval(() => { setSync(); if (document.visibilityState === 'visible' && !$('#sheet').innerHTML && Date.now() - lastScroll > 4000 && (tab === 'now' || tab === 'me' || tab === 'prog')) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(true); });
/* live updates: when the app is reopened, and every minute while it's open, check for a newer version and switch to it
   (only when nobody is mid-tap, scrolling or has a panel open — so it never jumps under someone's finger) */
const MY_V = (([...document.scripts].map((x) => x.src).find((x) => /app\.js\?v=/.test(x)) || '').match(/v=(\d+)/) || [])[1] || '';
let vcBusy = false;
async function checkVersion(force) {
  if (vcBusy || !MY_V || DEMO || !navigator.onLine) return;
  vcBusy = true;
  try {
    const r = await fetch('index.html?vc=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const html = await r.text();
    const v = (html.match(/app\.js\?v=(\d+)/) || [])[1];
    if (!v || v === MY_V) return;
    const idle = !$('#sheet').innerHTML && Date.now() - lastScroll > 5000 && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName));
    if (!force && !idle) return;
    let last = 0; try { last = +sessionStorage.getItem('mp_vc') || 0; } catch {}
    if (Date.now() - last < 30000) return; // never more than one switch every 30s
    try { sessionStorage.setItem('mp_vc', Date.now()); } catch {}
    // save the new page into the phone's copy first, so the reload opens the new version straight away
    try { for (const k of await caches.keys()) { const c = await caches.open(k); if (await c.match('index.html')) await c.put('index.html', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); } } catch {}
    location.reload();
  } catch {} finally { vcBusy = false; }
}
setTimeout(() => checkVersion(true), 2500);
setInterval(() => { if (document.visibilityState === 'visible') checkVersion(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkVersion(false); setTimeout(() => { try { pingSeen(); } catch {} }, 2000); } });
const bootAt = Date.now();
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (ev) => {
  if (!ev.data || ev.data.type !== 'mp-updated') return;
  // a newer version was just saved: swap to it once, only while the opening animation is still up (never mid-use)
  let last = 0; try { last = +sessionStorage.getItem('mp_upd') || 0; } catch {}
  if (Date.now() - bootAt < 6000 && Date.now() - last > 60000 && !$('#sheet').innerHTML) { try { sessionStorage.setItem('mp_upd', Date.now()); } catch {} location.reload(); }
});
if ('serviceWorker' in navigator) {
  // One background helper only. If the notification service has already registered it (with its own settings),
  // reuse that registration instead of replacing it — replacing it each time caused a reload loop.
  // Updates are picked up on the next open (the page itself is always fetched fresh), so no forced reloads.
  let reg = null;
  const check = () => { if (reg) reg.update().catch(() => {}); };
  window.addEventListener('load', async () => {
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      const url = existing && (existing.active || existing.waiting || existing.installing);
      reg = url && /\/sw\.js/.test(url.scriptURL) ? existing : await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      check();
    } catch {}
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60 * 1000);
}
})();
