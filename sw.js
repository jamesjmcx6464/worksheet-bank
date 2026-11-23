/* Worksheet Bank service worker. Cache name includes the site version.
 *
 * Cloudflare Pages 308-redirects *.html to the extensionless URL. A cached
 * Response with redirected=true cannot be used for a navigation in Chrome
 * ("This site can't be reached"). We never cache or return a redirected
 * Response: we rebuild a clean 200 and store it under both the .html URL
 * and the extensionless URL. index.html is not precached (its 308 to / would
 * fail install).
 */
const CACHE = "ws-bank-r2-1.4";
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
  "pwa.js",
  "profiles.js"
];

async function asCachedResponse(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: 200, statusText: 'OK', headers: res.headers });
}

function bareHref(href) {
  const u = new URL(href, self.registration.scope);
  if (u.pathname.endsWith('.html')) {
    return new URL(u.pathname.replace(/\.html$/, ''), u.origin).href;
  }
  return u.href;
}

function htmlHref(href) {
  const u = new URL(href, self.registration.scope);
  if (!u.pathname.endsWith('.html') && !u.pathname.endsWith('/')) {
    return new URL(u.pathname + '.html', u.origin).href;
  }
  return u.href;
}

function isWorksheetPath(url) {
  const name = url.pathname.split('/').pop();
  return /^\d{2}-/.test(name);
}

function isVersionJson(url) {
  return url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json');
}

function isIndexPath(url) {
  const p = url.pathname;
  return p === '/' || p === '' || /\/index\.html$/.test(p);
}

async function putPage(cache, requestUrl, res) {
  const url = new URL(requestUrl, self.registration.scope);
  await cache.put(url.href, res.clone());
  if (url.pathname.endsWith('.html') && !/\/index\.html$/.test(url.pathname)) {
    await cache.put(bareHref(url.href), res.clone());
  } else if (isWorksheetPath(url) && !url.pathname.endsWith('.html')) {
    await cache.put(htmlHref(url.href), res.clone());
  }
  if (isIndexPath(url)) {
    await cache.put(new URL('./', self.registration.scope).href, res.clone());
  }
}

async function matchPage(cache, request) {
  const url = new URL(request.url);
  const candidates = [request, url.href];
  if (url.pathname.endsWith('.html')) candidates.push(bareHref(url.href));
  else if (isWorksheetPath(url)) candidates.push(htmlHref(url.href));
  if (isIndexPath(url)) candidates.push(new URL('./', self.registration.scope).href);
  const seen = {};
  for (const c of candidates) {
    const key = typeof c === 'string' ? c : (c.url || String(c));
    if (seen[key]) continue;
    seen[key] = true;
    const hit = await cache.match(c, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

function offlineResponse() {
  return new Response('You appear to be offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const base = self.registration.scope;
    for (const p of PRECACHE) {
      const href = new URL(p, base).href;
      const res = await fetch(href);
      if (!res || !res.ok) throw new Error('precache failed: ' + href);
      const stored = await asCachedResponse(res);
      if (p.endsWith('.html') && p !== 'index.html') {
        await cache.put(href, stored.clone());
        await cache.put(new URL(p.replace(/\.html$/, ''), base).href, stored);
      } else {
        await cache.put(href, stored);
      }
    }
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

async function networkFirstNav(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    const stored = await asCachedResponse(res);
    if (stored && stored.ok) await putPage(cache, request.url, stored);
    return stored;
  } catch (err) {
    return (await matchPage(cache, request)) || (await cache.match(new URL('./', self.registration.scope))) || offlineResponse();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true }) || await matchPage(cache, request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    return await asCachedResponse(res);
  } catch (err) {
    if (request.mode === 'navigate') {
      return (await matchPage(cache, request)) || (await cache.match(new URL('./', self.registration.scope))) || offlineResponse();
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
  if (event.request.mode === 'navigate' || isIndexPath(url) || isWorksheetPath(url)) {
    event.respondWith(networkFirstNav(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
