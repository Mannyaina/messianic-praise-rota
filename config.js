// Messianic Praise! 2026 — Media Rota app settings
window.MP_CONFIG = {
  // The Google Sheet the rota lives in (must be shared "Anyone with the link can view")
  SHEET_ID: '1nLvViwgEWfznM1tx5apCDBuh_HDC0hHsKlaO3BXR3co',
  SHEET_NAME: 'Sheet1',

  // Google Apps Script web-app URL (ends in /exec). When set, the app reads through it
  // and leaders can edit the rota from inside the app. Leave '' for read-only.
  SCRIPT_URL: '',
  SIGNIN_SHEET: 'Sign-ins',

  // Shift sign-in shared through ntfy (used until SCRIPT_URL is set)
  NTFY_LOG: 'mp2026-media-d025c907-log',   // the app's sign-in log (nobody needs to subscribe)
  NTFY_TOPIC: 'mp2026-media-d025c907',     // leaders subscribe to this in the ntfy app for alerts
  // Lock-screen alerts for leaders (OneSignal) and the Google script that sends them
  ONESIGNAL_APP_ID: '11214d5e-bfa6-44a1-b203-0aaf98270575',
  ALERTS_URL: 'https://script.google.com/macros/s/AKfycbxH-alGr0Fug0OoWTmjPjh55LNBUimlk4MWeYS0Z7LVkHyah5vKirLrPXRxv5e_nJiDqQ/exec',
  LEADER_PIN_HASH: 'cba37c38221fad38b4f730ec350a99874c4da580c6b71b284d21e72257d81154',

  // The day Set-Up starts. Times before 12:00 in the sheet are treated as the next morning.
  EVENT_DAY: '2026-11-27',
  EVENT_NAME: 'Messianic Praise! 2026',
  VENUE: 'The Ark Pavilion, Birmingham',

  // How often to re-read the sheet while the app is open
  REFRESH_SECONDS: 10
};
