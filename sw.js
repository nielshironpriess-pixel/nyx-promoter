// Gør appen installerbar på hjemmeskærmen og viser notifikationer. Henter altid friske filer, så du aldrig ser en gammel version.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
// Tal på app-ikonet: tælles op ved hver notifikation, appen sætter det rigtige tal når den åbnes.
async function bumpBadge() {
  try {
    const c = await caches.open('bordbog-badge'), r = await c.match('/badge'), n = (r ? Number(await r.text()) || 0 : 0) + 1;
    await c.put('/badge', new Response(String(n)));
    if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n);
  } catch {}
}
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Bordbog', body: e.data && e.data.text() }; }
  e.waitUntil(Promise.all([bumpBadge(), self.registration.showNotification(d.title || 'Bordbog', { body: d.body || '', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', data: { url: d.url || '/' } })]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => 'focus' in x); if (c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
