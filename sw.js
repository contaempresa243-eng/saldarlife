// Muda este número sempre que atualizares algum ficheiro da app
const CACHE = 'saldar-life-v16';

const FICHEIROS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FICHEIROS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(guardado => {
      const rede = fetch(req)
        .then(r => {
          if (r && r.ok) {
            const copia = r.clone();
            caches.open(CACHE).then(c => c.put(req, copia));
          }
          return r;
        })
        .catch(() => guardado || caches.match('index.html'));
      return guardado || rede;
    })
  );
});
