// Docmee InboxOS service worker (Gap #31 — PWA foundation).
//   - App shell is precached on install (cache-first thereafter).
//   - API calls (`/clinics`, `/conversations`, …, or anything cross-origin to the
//     API) are network-first so the panel always shows fresh data, falling back to
//     cache only when offline.
//   - Everything else (static assets) is cache-first.

const CACHE = 'docmee-inbox-v1'
const APP_SHELL = ['/', '/inbox', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function isApiRequest(request) {
  const url = new URL(request.url)
  // Cross-origin requests are the API; same-origin /auth|/clinics|/conversations too.
  if (url.origin !== self.location.origin) return true
  return /^\/(auth|clinics|conversations|patients|user|notifications|usage)\b/.test(url.pathname)
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (request.method === 'GET' && response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (request.method === 'GET' && response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  event.respondWith(isApiRequest(request) ? networkFirst(request) : cacheFirst(request))
})
