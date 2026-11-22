/* Worksheet Bank service worker. Cache name includes the build version. */
const CACHE = "ws-bank-20261122T131550";
const PRECACHE = [
  "01-welcome-the-salmon.html",
  "02-thank-you-cedar-tree.html",
  "03-canoe-day.html",
  "04-berry-picking-day.html",
  "05-storytelling-circle.html",
  "06-fall-forest-walk.html",
  "07-butterfly-life-cycle.html",
  "08-sunflower-garden.html",
  "09-the-water-cycle.html",
  "10-space-explorer.html",
  "11-magnet-fun.html",
  "12-tide-pool-explorers.html",
  "13-dragon-s-cave.html",
  "14-build-a-robot.html",
  "15-pirate-ship-adventure.html",
  "16-busy-bakery.html",
  "17-farm-day.html",
  "18-dinosaur-day.html",
  "19-my-dream-treehouse.html",
  "20-fire-truck-rescue.html",
  "21-formline-raven.html",
  "22-formline-orca.html",
  "23-formline-eagle.html",
  "24-formline-salmon.html",
  "thumbs/01.jpg",
  "thumbs/02.jpg",
  "thumbs/03.jpg",
  "thumbs/04.jpg",
  "thumbs/05.jpg",
  "thumbs/06.jpg",
  "thumbs/07.jpg",
  "thumbs/08.jpg",
  "thumbs/09.jpg",
  "thumbs/10.jpg",
  "thumbs/11.jpg",
  "thumbs/12.jpg",
  "thumbs/13.jpg",
  "thumbs/14.jpg",
  "thumbs/15.jpg",
  "thumbs/16.jpg",
  "thumbs/17.jpg",
  "thumbs/18.jpg",
  "thumbs/19.jpg",
  "thumbs/20.jpg",
  "thumbs/21.jpg",
  "thumbs/22.jpg",
  "thumbs/23.jpg",
  "thumbs/24.jpg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
  "apple-touch-icon.png",
  "favicon.ico",
  "favicon-32.png",
  "manifest.webmanifest",
  "pwa.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const base = self.registration.scope;
    await cache.addAll(PRECACHE.map((p) => new URL(p, base).href));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isVersionJson(url) {
  return url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json');
}

function isIndexPath(url) {
  const p = url.pathname;
  return p === '/' || p === '' || /\/index\.html$/.test(p);
}

async function networkFirstIndex(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      // Store under '/' so a later offline visit to the start_url works,
      // even if this request was for /index.html (which Cloudflare 308s).
      cache.put(new URL('./', self.registration.scope), res.clone());
    }
    return res;
  } catch (err) {
    return (await cache.match(new URL('./', self.registration.scope)))
      || (await cache.match(request))
      || new Response('You appear to be offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      return (await cache.match(new URL('./', self.registration.scope)))
        || new Response('You appear to be offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isVersionJson(url)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (isIndexPath(url)) {
    event.respondWith(networkFirstIndex(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
