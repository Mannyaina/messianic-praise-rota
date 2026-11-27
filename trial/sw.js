// Lock-screen alerts for leaders (OneSignal) — must be first
try { importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'); } catch (e) {}
// Offline support: keep the app shell on the phone; rota data always comes fresh from the sheet
const VERSION = 'mp-rota-trialpath-v27';
const SHELL = ['./', 'index.html', 'styles.css?v=27', 'config.js?v=27', 'programme.js?v=27', 'app.js?v=27', 'logo.webp', 'logo-sm.webp', 'manifest.webmanifest',
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
  if (url.searchParams.has('vc')) return; // version check: always straight from the internet
  // the page itself: open instantly from the phone (no white screen), then check for a newer version in the background
  if (e.request.mode === 'navigate') {
    const id = e.resultingClientId || e.clientId;
    const work = caches.open(VERSION).then(async (c) => {
      const saved = (await c.match('index.html')) || (await c.match('./'));
      const old = saved ? await saved.clone().text() : null;
      const net = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async (r) => {
        if (!r || !r.ok) return r;
        const fresh = await r.clone().text();
        await c.put('index.html', r.clone());
        if (old !== null && old !== fresh) setTimeout(async () => {
          const cl = id && (await self.clients.get(id));
          (cl ? [cl] : await self.clients.matchAll({ type: 'window' })).forEach((x) => x.postMessage({ type: 'mp-updated' }));
        }, 400);
        return r;
      }).catch(() => null);
      return { saved, net };
    });
    e.respondWith(work.then(async ({ saved, net }) => saved || (await net) || Response.error()));
    e.waitUntil(work.then(({ net }) => net));
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
