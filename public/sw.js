// Service worker ONLY for Yo Futuro's push notifications.
// No fetch handler, no precache, no cache of any kind: the app and the login always go to the
// network, so an old version is never served. It updates itself on each deploy
// (skipWaiting + clients.claim).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The notice from the server: { title, body, url, tag }.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Yo Futuro', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'mensaje-del-dia', // a new one replaces the previous instead of piling up
      data: { url: data.url || '/dashboard' },
    })
  );
});

// Tapping it opens Inicio (or brings the open window to the front).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then((f) => (f && 'navigate' in f ? f.navigate(url) : f));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
