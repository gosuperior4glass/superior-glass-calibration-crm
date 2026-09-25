// Superior Glass CRM — Phase 1 PWA service worker.
//
// Scope, deliberately: application-shell caching only, so the CRM installs
// properly and its icon/shell can appear even on a flaky connection.
//
// This service worker NEVER caches, intercepts, or interferes with:
//   - any request to the Apps Script backend (script.google.com) — this
//     covers every authenticated read (JSONP), every write (POST), polling,
//     Jotform webhook traffic, and attachment uploads
//   - any POST request of any kind, to any origin
//   - any request that isn't explicitly one of the few static shell files
//     listed below
// Everything not explicitly matched below is left completely untouched and
// goes straight to the network exactly as if this file did not exist.
//
// Bump CACHE_NAME (e.g. 'sgc-shell-v2') whenever the shell asset list below
// changes, to force old caches to be cleared on the next visit.
var CACHE_NAME = 'sgc-shell-v1';

// Only the files that make up the installable app shell — never index.html
// itself (see the fetch handler: index.html is always network-first, so a
// new GitHub deployment is picked up immediately whenever the device is
// online, and this cache is only a fallback for the rare case of opening
// the installed app with no connection at all).
var SHELL_ASSETS = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) { return name.indexOf('sgc-shell-') === 0 && name !== CACHE_NAME; })
             .map(function (name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Only ever act on same-origin GET requests. Any POST, any cross-origin
  // request (this is what keeps every Apps Script call — reads, writes,
  // Jotform, attachment uploads — completely untouched), and any GET this
  // file doesn't explicitly recognize below, is left alone entirely.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  var url = new URL(request.url);
  var path = url.pathname;

  // The page itself: network-first. A fresh GitHub deployment is always
  // preferred; the cache is only ever used if the network request itself
  // fails (genuinely offline), so the installed app shell can still open
  // rather than showing a bare connection-error page.
  var isPageRequest = request.mode === 'navigate' || path.endsWith('/index.html') || path === '/' || path.endsWith('/superior-glass-calibration-crm/');
  if (isPageRequest) {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match(request);
      })
    );
    return;
  }

  // Shell assets (manifest/icons): cache-first, since a stale icon or
  // manifest is harmless and these almost never change.
  var isShellAsset = SHELL_ASSETS.some(function (asset) { return path.endsWith(asset.replace('./', '')); });
  if (isShellAsset) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        return cached || fetch(request).then(function (response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
          return response;
        });
      })
    );
    return;
  }

  // Anything else same-origin and GET that isn't recognized above (there
  // shouldn't be much, since the CRM is a single-page file): don't
  // intercept, just let it go to the network normally.
});
