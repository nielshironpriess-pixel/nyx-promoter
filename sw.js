// Gør appen installerbar på hjemmeskærmen. Henter altid friske filer, så du aldrig ser en gammel version.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
