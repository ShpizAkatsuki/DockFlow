// DocFlow service worker - עובד גם בלי רשת.
// קבצי האפליקציה: קודם רשת (כדי לקבל עדכונים), ואם אין רשת - מהמטמון. ספריות חיצוניות: מטמון קודם.
const CACHE = 'docflow-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => fetch(u).then(r => { if (r.ok && !r.redirected) return c.put(u, r); }).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CDN.includes(url.hostname)) return; // Firebase Auth/Firestore עוברים ישר לרשת

  if (sameOrigin) {
    // רשת קודם (עם הבקשה המקורית, בלי שינויים), מטמון כגיבוי
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && !res.redirected && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(async () => {
        return (await caches.match(req, { ignoreSearch: true })) ||
               (req.mode === 'navigate' ? await caches.match('./index.html') : undefined) ||
               Response.error();
      })
    );
    return;
  }

  // ספריות חיצוניות: מטמון קודם
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
