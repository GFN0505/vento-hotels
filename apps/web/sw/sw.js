// Vento's service worker (decision 0009): keeps the app itself on the device so it opens without a
// connection. It never caches API calls (/api, /rpc): the data people last saw is kept by the app
// in IndexedDB, and anything that changes data goes to the server or, later, the offline outbox.
// Built by sw/service-worker.ts, which fills in the version and the files to keep.
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const CACHE = `vento-shell-${VERSION}`

self.addEventListener('install', (event) => {
  // A new version waits until the person chooses to reload, so it never swaps mid-task.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', ...PRECACHE])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('vento-shell-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'vento:update') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (/^\/(api|rpc|health)(\/|$)/.test(url.pathname)) return

  // Pages: the network first, so a deploy shows at once; the kept app when there's no connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/', { ignoreVary: true }).then((page) => page ?? Response.error()),
      ),
    )
    return
  }

  // Built files have their content in their name, so a kept copy is always right. Files not kept
  // at install (rarer fonts, for example) are kept the first time they're used.
  event.respondWith(
    // ignoreVary: module scripts are requested with an Origin header the install-time copies
    // didn't have; a response that varies on it would otherwise never match. Built files carry
    // their content in their name, so any stored copy is the right one.
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith('/assets/')) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
