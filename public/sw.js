// Minimal service worker so the ops console is an installable PWA ("Install app"
// on Android/desktop Chrome). Deliberately does NOT cache responses — it passes
// every request straight to the network, so there's never a stale JS bundle. Its
// only job is to exist with a fetch handler, which satisfies installability.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
   // no-op: let the browser handle the request normally (network).
});
