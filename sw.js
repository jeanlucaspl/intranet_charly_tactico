// Service Worker — Charly Táctico PWA
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  let d = { title: 'Charly Táctico', body: 'Tienes una nueva notificación', url: '/' };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      vibrate: [200, 100, 200],
      data: d.url
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('intranet-charly-tactico') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(e.notification.data || '/');
    })
  );
});
