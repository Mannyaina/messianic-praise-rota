// Messianic Praise! 2026 — Media Rota app settings
window.MP_CONFIG = {
  // The Google Sheet the rota lives in (must be shared "Anyone with the link can view")
  SHEET_ID: '1nLvViwgEWfznM1tx5apCDBuh_HDC0hHsKlaO3BXR3co',
  SHEET_NAME: 'Sheet1',

  // Google Apps Script web-app URL (ends in /exec). When set, the app reads through it
  // and leaders can edit the rota from inside the app. Leave '' for read-only.
  SCRIPT_URL: '',

  // The day Set-Up starts. Times before 12:00 in the sheet are treated as the next morning.
  EVENT_DAY: '2026-11-27',
  EVENT_NAME: 'Messianic Praise! 2026',
  VENUE: 'The Ark Pavilion, Birmingham',

  // How often to re-read the sheet while the app is open
  REFRESH_SECONDS: 30,
  DEMO: true
};
