/* ATLAS — service worker (stale-while-revalidate)
   Ne contient pas l'appli : il ne fait que la mettre en cache.
   Tu n'as JAMAIS besoin de modifier ce fichier.
   Dépose-le une fois sur GitHub à côté de index.html, puis continue
   à n'uploader que index.html à chaque modification. */

const CACHE = 'atlas-app';
const FLAG  = './__atlas_update';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./', './index.html']).catch(() => {}))
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

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // CDN (Tesseract) : réseau direct
  // Vérification manuelle de version : on ne sert JAMAIS le cache
  if (url.searchParams.has('_atlas')) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    // clone AVANT de renvoyer la réponse : sinon son corps est déjà consommé
    const prev = cached ? cached.clone() : null;

    // Va chercher la dernière version en arrière-plan
    const network = fetch(req).then(async res => {
      if (res && res.ok) {
        const fresh = res.clone();
        await cache.put(req, res.clone());
        // Prévient la page si le contenu a changé
        if (prev) {
          const [a, b] = await Promise.all([prev.text(), fresh.text()]);
          if (a !== b) {
            // marqueur persistant : la page le lira même si elle n'écoutait pas encore
            await cache.put(FLAG, new Response('1'));
            const cs = await self.clients.matchAll({ type: 'window' });
            cs.forEach(c => c.postMessage({ type: 'ATLAS_UPDATE' }));
          }
        }
      }
      return res;
    }).catch(() => null);

    // Sert le cache immédiatement (démarrage instantané, marche hors ligne)
    if (cached) { e.waitUntil(network); return cached; }

    const res = await network;
    if (res) return res;

    // Hors ligne et rien en cache : on tente la page d'accueil
    return (await cache.match('./index.html')) ||
           new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
