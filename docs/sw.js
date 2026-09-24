// Service Worker for PWA
//
// CACHE_VERSION pidetään synkassa index.html:n build-numeron kanssa:
// .github/workflows/bump-build.yml päivittää molemmat samalla ajolla. Kun sw.js:n
// tavut muuttuvat joka julkaisussa, selain huomaa uuden workerin, asentaa sen ja
// activate-vaihe siivoaa vanhan välimuistin pois. Ilman tätä offline-käyttäjä
// jäisi ikuisesti ensimmäiseen asennettuun versioon.
const CACHE_VERSION = '0.011v';
const CACHE_NAME = `porssisahko-${CACHE_VERSION}`;

// Sovelluskuori: kaikki mitä sivun piirtämiseen tarvitaan ilman verkkoa.
// Hintadata ei kuulu tänne - se haetaan aina verkosta.
const PRECACHE_URLS = [
  './index.html',
  './styles.css',
  './manifest.json',
  './main.js',
  './js/config.js',
  './js/consent.js',
  './js/pricing.js',
  './js/translations.js',
  './js/ui.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

// Network-first: verkon toimiessa käyttäjä saa aina tuoreimman version, ja
// onnistunut vastaus päivittää välimuistin seuraavaa offline-käyttöä varten.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ohita muut kuin GET-pyynnöt sekä vieraat originit (hinta-API, Tailwind CDN).
  // Vanhentunut hinta välimuistista olisi pahempi kuin ei hintaa lainkaan.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // cache: 'no-cache' ohittaa selaimen HTTP-välimuistin (GitHub Pages: max-age=600) ja
  // tarkistaa palvelimelta, onko tiedosto muuttunut. Ilman tätä julkaisun jälkeen voisi
  // hetken saada uuden index.html:n ja vanhan main.js:n, jolloin sivu näyttää rikkinäiseltä.
  // Muuttumaton tiedosto kuitataan kevyellä 304-vastauksella, joten hinta on pieni.
  // Navigointipyyntöön ei voi antaa asetuksia (TypeError), joten se haetaan sellaisenaan.
  const networkRequest = request.mode === 'navigate' ? request : new Request(request, { cache: 'no-cache' });

  event.respondWith(
    fetch(networkRequest)
      .then((response) => {
        if (response.ok) {
          // Bodyn voi lukea vain kerran, joten välimuistiin menee kopio.
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Offline-navigointi osoitteeseen jota ei ole välimuistissa
        // -> tarjoa sovelluskuori tyhjän virhesivun sijaan.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }

        return Response.error();
      })
  );
});
