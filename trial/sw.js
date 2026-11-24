// Lock-screen alerts for leaders (OneSignal) — must be first
try { importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'); } catch (e) {}
// Offline support: keep the app shell on the phone; rota data always comes fresh from the sheet
const VERSION = 'mp-rota-trialpath-v20';
const SHELL = ['./', 'index.html', 'styles.css?v=20', 'config.js?v=20', 'programme.js?v=20', 'app.js?v=20', 'logo.webp', 'logo-sm.webp', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // never cache the rota itself
  if (/docs\.google\.com|script\.google\.com|googleusercontent\.com|onesignal\.com|ntfy\.sh/.test(url.host)) return;
  // fonts: cache-first
  if (/fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // the page itself: always ask for the latest (so updates show straight away), but never wait more than 1.5s
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const net = fetch(e.request, { cache: 'no-cache' }).then((r) => { if (r && r.ok) c.put('index.html', r.clone()); return r; }).catch(() => null);
      const timeout = new Promise((res) => setTimeout(() => res(null), 1500));
      const first = await Promise.race([net, timeout]);
      if (first) return first;
      const saved = (await c.match('index.html')) || (await c.match('./'));
      return saved || (await net) || Response.error();
    }));
    return;
  }
  // app files carry a version number, so a saved copy is always the right one: answer instantly from the phone
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    const r = await fetch(e.request).catch(() => null);
    if (r && r.ok) c.put(e.request, r.clone());
    return r || Response.error();
  }));
});
