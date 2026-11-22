/**
 * Messianic Praise! 2026 — Media Rota app: Google Sheet bridge
 *
 * Does four things for the app:
 *  1. read   — sends the rota and the sign-ins to the app
 *  2. signin / signout — a team member taps "I'm here"
 *  3. mark   — a leader (PIN) marks someone present / not present
 *  4. write  — a leader (PIN) edits a name on the rota
 * …and every 5 minutes on the night it sends leaders phone alerts through ntfy:
 *  - 15 min before each shift: how many have signed in
 *  - 10 min after each shift starts: who is still missing
 *
 * Setup (once): Deploy › New deployment › Web app · Execute as: Me · Access: Anyone.
 * Then run setup() once from the editor to switch on the 5-minute check.
 */

// ⬇️ Settings
const LEADER_PIN = '2711';                       // PIN leaders use in the app
const NTFY_TOPIC = 'mp2026-media-d025c907';      // leaders subscribe to this in the ntfy app
const EVENT_DAY = '2026-11-27';                  // day Set-Up starts (times before 12:00 = next morning)
const SHEET_ID = '1nLvViwgEWfznM1tx5apCDBuh_HDC0hHsKlaO3BXR3co';
const SHEET_NAME = 'Sheet1';
const SIGNIN_SHEET = 'Sign-ins';
const LOG_SHEET = 'App edit log';
const LATE_AFTER_MIN = 10;

/* ---------------- web app ---------------- */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'read';
  if (action === 'read') {
    return json_({ ok: true, values: rota_().getDataRange().getDisplayValues(), signins: readSignins_(), updated: new Date().toISOString() });
  }
  return json_({ ok: false, error: 'Unknown action' });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  const a = b.action;

  if (a === 'signin' || a === 'signout') {
    const rec = clean_(b);
    if (!rec.name || !rec.slot) return json_({ ok: false, error: 'Missing name or shift' });
    addSignin_(rec, a === 'signin' ? 'in' : 'out', rec.name);
    push_(a === 'signin' ? `${rec.name} signed in · ${rec.role || rec.team}` : `${rec.name} signed out`,
      `${rec.slot} · ${rec.team}${rec.role ? ' · ' + rec.role : ''} · ${hm_(new Date())}`,
      a === 'signin' ? 'white_check_mark' : 'wave', 3);
    return json_({ ok: true, signins: readSignins_() });
  }

  // everything below needs the leader PIN
  if (String(b.pin || '') !== String(LEADER_PIN)) return json_({ ok: false, error: 'Wrong PIN' });
  if (a === 'verify') return json_({ ok: true });

  if (a === 'mark') {
    const rec = clean_(b);
    const editor = String(b.editor || 'Leader').slice(0, 60);
    if (!rec.name || !rec.slot) return json_({ ok: false, error: 'Missing name or shift' });
    addSignin_(rec, b.value === 'out' ? 'out' : 'in', editor);
    push_(b.value === 'out' ? `${rec.name} marked not here` : `${rec.name} marked present`,
      `${rec.slot} · ${rec.team} · by ${editor}`, b.value === 'out' ? 'x' : 'ballot_box_with_check', 2);
    return json_({ ok: true, signins: readSignins_() });
  }

  if (a === 'write') {
    const sh = rota_();
    let row = Number(b.row), col = Number(b.col), span = Math.max(1, Math.min(6, Number(b.span) || 1));
    if (b.slotLabel) {                       // find the cell by its labels, so layout changes can't misplace an edit
      const loc = locate_(b);
      if (!loc) return json_({ ok: false, error: 'Could not find that slot in the sheet' });
      row = loc.row; col = loc.col; span = loc.span;
    }
    if (!(row >= 5 && row <= sh.getMaxRows() && col >= 5 && col + span - 1 <= sh.getMaxColumns())) {
      return json_({ ok: false, error: 'That cell is outside the rota' });
    }
    const value = String(b.value || '').trim().slice(0, 60).replace(/^[=+\-@]+/, '');
    const editor = String(b.editor || 'Unknown').slice(0, 60);
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const rng = sh.getRange(row, col, 1, span);
      const old = rng.getDisplayValues()[0].filter(String).join(' / ');
      if (span > 1 && rng.getMergedRanges().length === 0) {
        const vals = [value]; for (let i = 1; i < span; i++) vals.push('');
        rng.setValues([vals]);
      } else sh.getRange(row, col).setValue(value);
      log_([new Date(), editor, rng.getA1Notation(), old, value]);
    } finally { lock.releaseLock(); }
    return json_({ ok: true });
  }
  return json_({ ok: false, error: 'Unknown action' });
}

/* ---------------- sign-ins ---------------- */
function clean_(b) {
  const s = (x, n) => String(x || '').trim().slice(0, n).replace(/^[=+\-@]+/, '');
  return { name: s(b.name, 60), slot: s(b.slot, 30), team: s(b.team, 60), role: s(b.role, 60) };
}
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
function addSignin_(rec, status, by) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { signinSheet_().appendRow([new Date(), rec.name, rec.slot, rec.team, rec.role, status, by]); }
  finally { lock.releaseLock(); }
}
function readSignins_() {
  const sh = signinSheet_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  const start = Math.max(2, n - 999);
  return sh.getRange(start, 1, n - start + 1, 7).getValues().map((r) => ({
    t: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), name: String(r[1]), slot: String(r[2]),
    team: String(r[3]), role: String(r[4]), status: String(r[5]), by: String(r[6])
  }));
}

/* ---------------- alerts (every 5 minutes) ---------------- */
function setup() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'checkShifts').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkShifts').timeBased().everyMinutes(5).create();
  signinSheet_();
  push_('MP Rota alerts are on', 'You will get sign-in alerts for Messianic Praise! 2026 here.', 'tada', 3);
}

function checkShifts() {
  const now = new Date();
  const props = PropertiesService.getScriptProperties();
  const { slots } = parseRota_();
  const sig = readSignins_();
  for (const s of slots) {
    const people = s.people; if (!people.length) continue;
    const isIn = (p) => latest_(sig, p.name, s.label) === 'in';
    const inCount = people.filter(isIn).length;
    const mins = (now - s.start) / 60000;
    if (mins >= -20 && mins < -10 && !props.getProperty('pre_' + s.label)) {
      props.setProperty('pre_' + s.label, '1');
      push_(`${s.label} starts at ${hm_(s.start)}`, `${inCount} of ${people.length} signed in so far. Head on duty: ${s.head || 'TBC'}.`, 'alarm_clock', 4);
    }
    if (mins >= LATE_AFTER_MIN && mins < LATE_AFTER_MIN + 15 && !props.getProperty('miss_' + s.label)) {
      props.setProperty('miss_' + s.label, '1');
      const missing = people.filter((p) => !isIn(p));
      if (missing.length) {
        push_(`${s.label} · ${missing.length} not signed in`, missing.map((p) => `${p.name} (${p.role || p.team})`).join(', '), 'warning', 5);
      } else {
        push_(`${s.label} · everyone is in`, `All ${people.length} signed in.`, 'white_check_mark', 3);
      }
    }
  }
}
function latest_(sig, name, slot) {
  const k = name.toLowerCase().trim();
  let st = null;
  for (const r of sig) if (r.slot === slot && r.name.toLowerCase().trim() === k) st = r.status;
  return st;
}

/* rota reader (same layout rules as the app) */
function parseRota_() {
  const rows = rota_().getDataRange().getDisplayValues();
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
    for (const s of slots) {
      for (let c = s.c0; c <= s.c1; c++) split(v(r, c)).forEach((name) => {
        if (!s.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) s.people.push({ name, team, role });
      });
    }
  }
  return { slots };
}
function locate_(b) {
  const rows = rota_().getDataRange().getDisplayValues();
  const v = (r, c) => String((rows[r] || [])[c] || '').trim();
  const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, '').replace(/^teamlead$/, 'lead');
  let hdr = null; rows.forEach((row, r) => row.forEach((x, c) => { if (!hdr && /^set[\s-]?up$/i.test(String(x).trim())) hdr = { r, c }; }));
  if (!hdr) return null;
  const width = Math.max.apply(null, rows.map((r) => r.length));
  const cols = []; for (let c = hdr.c; c < width; c++) if (/(set|shift)/i.test(v(hdr.r, c))) cols.push(c);
  const i = cols.findIndex((c) => norm(v(hdr.r, c)) === norm(b.slotLabel)); if (i < 0) return null;
  const c0 = cols[i], c1 = i < cols.length - 1 ? cols[i + 1] - 1 : c0;
  let row = -1;
  if (b.kind === 'meta') {
    const re = /minister/i.test(b.label) ? /minister/i : /head/i;
    for (let r = 0; r < hdr.r + 8 && row < 0; r++) for (let c = 0; c < hdr.c; c++) if (re.test(v(r, c)) && !/team/i.test(v(r, c))) { row = r; break; }
  } else {
    const roleCol = hdr.c - 1, teamCol = roleCol - 1; let team = '';
    for (let r = hdr.r + 1; r < rows.length; r++) {
      if (v(r, teamCol)) team = v(r, teamCol);
      if (norm(team) === norm(b.team) && norm(v(r, roleCol)) === norm(b.role)) { row = r; break; }
    }
  }
  return row < 0 ? null : { row: row + 1, col: c0 + 1, span: c1 - c0 + 1 };
}
function at_(t) {
  const m = String(t).match(/(\d{1,2})[:.](\d{2})/); if (!m) return new Date(0);
  const h = +m[1], mi = +m[2];
  const p = EVENT_DAY.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], h, mi, 0);
  if (h < 12) d.setDate(d.getDate() + 1);
  return d;
}

/* ---------------- helpers ---------------- */
function push_(title, body, tags, priority) {
  try {
    // title/tags in the URL so names with any characters arrive intact
    const q = '?title=' + encodeURIComponent(title) + '&tags=' + encodeURIComponent(tags || '') + '&priority=' + (priority || 3);
    UrlFetchApp.fetch('https://ntfy.sh/' + NTFY_TOPIC + q, {
      method: 'post', payload: body, contentType: 'text/plain; charset=utf-8', muteHttpExceptions: true
    });
  } catch (err) { console.warn(err); }
}
function hm_(d) { return Utilities.formatDate(d, 'Europe/London', 'HH:mm'); }
function rota_() { const ss = SpreadsheetApp.openById(SHEET_ID); return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0]; }
function log_(rowVals) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let lg = ss.getSheetByName(LOG_SHEET);
  if (!lg) { lg = ss.insertSheet(LOG_SHEET); lg.appendRow(['When', 'Leader', 'Cells', 'Was', 'Now']); }
  lg.appendRow(rowVals);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
