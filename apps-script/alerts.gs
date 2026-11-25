/**
 * Messianic Praise! 2026 — Media Rota alerts (Google Apps Script)
 *
 * What it does
 *  • When someone signs in / is marked present in the app, it sends a lock-screen
 *    notification to every leader who turned on alerts (via OneSignal).
 *  • Every minute on the night it also sends:
 *      – "Shift X starts at hh:mm · n of m signed in"  (15 min before each shift)
 *      – "Shift X · n not signed in: names"            (10 min after each shift starts)
 *  • It copies every sign-in into a "Sign-ins" tab in the rota sheet, as a record.
 *  • It keeps an "App users" tab: who has opened the app, on which phone, whether it's saved
 *    to their home screen and whether notifications are on.
 *
 * One-time setup
 *  1. Project Settings (gear) › Script properties › Add:  ONESIGNAL_KEY = <your OneSignal REST API key>
 *  2. Deploy › New deployment › Web app · Execute as: Me · Who has access: Anyone
 *  3. Run setup() once (choose it in the toolbar, press Run, allow access)
 */

const ONESIGNAL_APP_ID = '11214d5e-bfa6-44a1-b203-0aaf98270575';
const APP_URL = 'https://mannyaina.github.io/messianic-praise-rota/#now';
const SIGNIN_LOG = 'mp2026-media-d025c907-log';   // where the app shares sign-ins
const SHEET_ID = '1nLvViwgEWfznM1tx5apCDBuh_HDC0hHsKlaO3BXR3co';
const SHEET_NAME = 'Sheet1';
const SIGNIN_SHEET = 'Sign-ins';
const SEEN_LOG = 'mp2026-media-d025c907-seen';    // phones check in here each time the app is opened
const USERS_SHEET = 'App users';
const EVENT_DAY = '2026-11-27';                     // day Set-Up starts; times before 12:00 = next morning
const LATE_AFTER_MIN = 10;

/* ---------- web app: the app pings this right after a sign-in ---------- */
function doPost(e) {
  try { processNew_(); } catch (err) { console.warn(err); }
  return json_({ ok: true });
}
function doGet() { return json_({ ok: true, service: 'MP Rota alerts' }); }

/* ---------- every minute ---------- */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  signinSheet_();
  send_('MP Rota alerts are switched on', 'Leaders who turn on alerts in the app will get sign-in notifications.');
}
function tick() {
  try { processSeen_(); } catch (err) { console.warn(err); }
  const start = at_('15:00'), end = at_('07:00');
  const now = new Date();
  if (now < new Date(+start - 60 * 60000) || now > new Date(+end + 60 * 60000)) return; // only around the event
  processNew_();
  shiftChecks_(now);
}

/* new sign-ins → notify leaders once each, and record them in the sheet */
function processNew_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const done = JSON.parse(props.getProperty('done') || '[]');
    const recs = readLog_().filter((r) => done.indexOf(r.id) < 0);
    if (!recs.length) return;
    const sh = signinSheet_();
    recs.forEach((r) => sh.appendRow([new Date(r.time * 1000), r.name, r.slot, r.team, r.role, r.status, r.by]));
    const fresh = recs.filter((r) => Date.now() / 1000 - r.time < 15 * 60);   // don't alert very old ones
    if (fresh.length > 3) {
      send_(`${fresh.length} check-in updates`, fresh.map((r) => r.name + (r.status === 'in' ? ' (in)' : ' (out)')).join(', '));
    } else {
      fresh.forEach((r) => {
        const marked = r.by && r.by.toLowerCase() !== r.name.toLowerCase();
        const title = r.status === 'in' ? (marked ? `${r.name} marked present` : `${r.name} signed in`) : (marked ? `${r.name} marked not here` : `${r.name} signed out`);
        send_(title, `${r.slot} · ${r.role || r.team}${marked ? ' · by ' + r.by : ''}`);
      });
    }
    props.setProperty('done', JSON.stringify(done.concat(recs.map((r) => r.id)).slice(-800)));
  } finally { lock.releaseLock(); }
}

function shiftChecks_(now) {
  const props = PropertiesService.getScriptProperties();
  const { slots } = parseRota_();
  const log = readLog_();
  const isIn = (name, slot) => {
    let st = null; const k = name.toLowerCase();
    log.forEach((r) => { if (r.slot === slot && r.name.toLowerCase() === k) st = r.status; });
    return st === 'in';
  };
  slots.forEach((s) => {
    if (!s.people.length) return;
    const mins = (now - s.start) / 60000;
    if (mins >= -15 && mins < -5 && !props.getProperty('pre_' + s.label)) {
      props.setProperty('pre_' + s.label, '1');
      const n = s.people.filter((p) => isIn(p.name, s.label)).length;
      send_(`${s.label} starts at ${hm_(s.start)}`, `${n} of ${s.people.length} signed in so far · Head: ${s.head || 'TBC'}`);
    }
    // personal reminders for volunteers who turned them on (tag person = their name)
    if (mins >= -30 && mins < -20 && !props.getProperty('rem_' + s.label)) {
      props.setProperty('rem_' + s.label, '1');
      s.people.forEach((p) => sendTo_(p.name, `Your shift starts at ${hm_(s.start)}`, `${s.label} · ${p.team} · ${p.role}. Tap to sign in when you arrive.`));
    }
    if (mins >= 5 && mins < 15 && !props.getProperty('nudge_' + s.label)) {
      props.setProperty('nudge_' + s.label, '1');
      s.people.filter((p) => !isIn(p.name, s.label)).forEach((p) => sendTo_(p.name, `Don't forget to sign in`, `${s.label} started at ${hm_(s.start)} · ${p.role}. Tap to sign in.`));
    }
    if (mins >= LATE_AFTER_MIN && mins < LATE_AFTER_MIN + 20 && !props.getProperty('miss_' + s.label)) {
      props.setProperty('miss_' + s.label, '1');
      const miss = s.people.filter((p) => !isIn(p.name, s.label));
      if (miss.length) send_(`${s.label} · ${miss.length} not signed in`, miss.map((p) => `${p.name} (${p.role})`).join(', '));
      else send_(`${s.label} · everyone is in`, `All ${s.people.length} signed in. Thank you!`);
    }
  });
}

/* ---------- sign-ins shared by the app (ntfy log, kept 12h) ---------- */
function readLog_() {
  const res = UrlFetchApp.fetch('https://ntfy.sh/' + SIGNIN_LOG + '/json?poll=1&since=all', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  return res.getContentText().split('\n').filter(String).map((l) => {
    try {
      const m = JSON.parse(l); if (m.event !== 'message') return null;
      const d = JSON.parse(m.message); if (!d.name || !d.slot) return null;
      return { id: m.id, time: m.time, name: String(d.name), slot: String(d.slot), team: String(d.team || ''), role: String(d.role || ''), status: d.status === 'out' ? 'out' : 'in', by: String(d.by || d.name) };
    } catch (err) { return null; }
  }).filter(Boolean);
}

/* ---------- OneSignal: push to leaders (tag leader = 1) ---------- */
function send_(title, body) {
  const key = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_KEY');
  if (!key) { console.warn('ONESIGNAL_KEY not set'); return; }
  const res = UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Key ' + key },
    payload: JSON.stringify({
      app_id: ONESIGNAL_APP_ID, target_channel: 'push',
      filters: [{ field: 'tag', key: 'leader', relation: '=', value: '1' }],
      headings: { en: title }, contents: { en: body || ' ' }, url: APP_URL
    })
  });
  if (res.getResponseCode() >= 300) console.warn(res.getContentText());
}

/* push to one volunteer (tag person = their name, lower case) */
function sendTo_(name, title, body) {
  const key = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_KEY');
  if (!key) return;
  const person = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Key ' + key },
    payload: JSON.stringify({
      app_id: ONESIGNAL_APP_ID, target_channel: 'push',
      filters: [{ field: 'tag', key: 'person', relation: '=', value: person }],
      headings: { en: title }, contents: { en: body }, url: APP_URL.replace('#now', '#me')
    })
  });
}

/* ---------- rota reader (same rules as the app) ---------- */
function parseRota_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const rows = (ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0]).getDataRange().getDisplayValues();
  const v = (r, c) => String((rows[r] || [])[c] || '').trim();
  let hdr = null, startR = -1, endR = -1, headR = -1;
  rows.forEach((row, r) => row.forEach((x, c) => {
    const t = String(x).trim();
    if (!hdr && /^set[\s-]?up$/i.test(t)) hdr = { r, c };
    if (startR < 0 && /^start$/i.test(t)) startR = r;
    if (endR < 0 && /^end$/i.test(t)) endR = r;
    if (headR < 0 && /head/i.test(t) && !/team/i.test(t)) headR = r;
  }));
  if (!hdr) return { slots: [] };
  const width = Math.max.apply(null, rows.map((r) => r.length));
  const cols = []; for (let c = hdr.c; c < width; c++) if (/(set|shift)/i.test(v(hdr.r, c))) cols.push(c);
  const split = (s) => String(s || '').split(/\s*(?:\/|,|&|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean)
    .map((n) => (/[A-Z]{3,}/.test(n) && n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : n));
  const slots = cols.map((c0, i) => {
    const c1 = i < cols.length - 1 ? cols[i + 1] - 1 : c0;
    return { label: v(hdr.r, c0), c0, c1, start: at_(v(startR, c0)), end: at_(v(endR, c1)), head: headR >= 0 ? v(headR, c0) : '', people: [] };
  });
  const heads = []; slots.forEach((s) => { if (!/^both$/i.test(s.head)) split(s.head).forEach((h) => { if (heads.indexOf(h) < 0) heads.push(h); }); });
  slots.forEach((s) => { if (/^both$/i.test(s.head)) s.head = heads.join(' & '); });
  const roleCol = hdr.c - 1, teamCol = roleCol - 1; let team = '';
  for (let r = hdr.r + 1; r < rows.length; r++) {
    const role = v(r, roleCol); if (v(r, teamCol)) team = v(r, teamCol);
    if (!role || !team) continue;
    slots.forEach((s) => {
      for (let c = s.c0; c <= s.c1; c++) split(v(r, c)).forEach((name) => {
        const ex = s.people.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!ex) s.people.push({ name, team, role });
        else if (ex.team === team && ex.role.split(', ').indexOf(role) < 0) ex.role += ', ' + role;
      });
    });
  }
  return { slots };
}
function at_(t) {
  const m = String(t).match(/(\d{1,2})[:.](\d{2})/); if (!m) return new Date(0);
  const h = +m[1], mi = +m[2], p = EVENT_DAY.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], h, mi, 0);
  if (h < 12) d.setDate(d.getDate() + 1);
  return d;
}

/* ---------- app check-ins → "App users" tab (one row per phone) ---------- */
function processSeen_() {
  const props = PropertiesService.getScriptProperties();
  const since = +(props.getProperty('seenTs') || 0);
  const doneIds = JSON.parse(props.getProperty('seenIds') || '[]');
  const res = UrlFetchApp.fetch('https://ntfy.sh/' + SEEN_LOG + '/json?poll=1&since=' + (since ? since : '12h'), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return;
  const recs = res.getContentText().split('\n').filter(String).map((l) => {
    try { const m = JSON.parse(l); if (m.event !== 'message' || doneIds.indexOf(m.id) >= 0) return null; const d = JSON.parse(m.message); return d.dev ? { id: m.id, time: m.time, d: d } : null; } catch (err) { return null; }
  }).filter(Boolean);
  if (!recs.length) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return;
  try {
    const sh = usersSheet_();
    const data = sh.getDataRange().getValues();
    const rowOf = {}; for (let i = 1; i < data.length; i++) rowOf[data[i][9]] = i + 1;
    recs.sort((a, b) => a.time - b.time).forEach((r) => {
      const d = r.d, when = new Date(r.time * 1000), row = rowOf[d.dev];
      const vals = [d.name || '(no name picked)', d.viewing || '', d.phone || '', d.home || '', d.notif || '', d.leader || '', null, when, null, d.dev];
      if (row) {
        const cur = sh.getRange(row, 1, 1, 10).getValues()[0];
        vals[6] = cur[6]; vals[8] = (+cur[8] || 0) + 1;
        if (!d.name && cur[0]) vals[0] = cur[0];
        sh.getRange(row, 1, 1, 10).setValues([vals]);
      } else {
        vals[6] = when; vals[8] = 1;
        sh.appendRow(vals); rowOf[d.dev] = sh.getLastRow();
      }
    });
    const maxT = recs[recs.length - 1].time;
    props.setProperty('seenTs', String(maxT));
    props.setProperty('seenIds', JSON.stringify(recs.filter((r) => r.time === maxT).map((r) => r.id).concat(since === maxT ? doneIds : []).slice(-50)));
  } finally { lock.releaseLock(); }
}
function usersSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(USERS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(USERS_SHEET);
    sh.appendRow(['Name', 'Viewing rota for', 'Phone', 'On home screen', 'Notifications', 'Leader', 'First opened', 'Last opened', 'Opens', 'Device']);
    sh.setFrozenRows(1); sh.getRange('G:H').setNumberFormat('ddd d mmm hh:mm');
  }
  return sh;
}

/* ---------- helpers ---------- */
function signinSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SIGNIN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SIGNIN_SHEET);
    sh.appendRow(['When', 'Name', 'Shift', 'Team', 'Role', 'Status', 'Recorded by']);
    sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('ddd hh:mm');
  }
  return sh;
}
function hm_(d) { return Utilities.formatDate(d, 'Europe/London', 'HH:mm'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
