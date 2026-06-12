// Service worker do WeightChartS — torna o app instalável e funcional offline.
//
// Estratégia:
//   • Firebase/Google (Auth, Firestore): SEMPRE rede, nunca cacheado.
//   • CDNs de terceiros (Tailwind, Chart.js, SDK Firebase): cache-first (versões estáveis).
//   • App próprio (HTML/JS/CSS/ícones): network-first com fallback ao cache (offline).
//
// Ao mudar arquivos do app, incremente CACHE_VERSION para limpar o cache antigo.

const CACHE_VERSION = 'v1';
const CACHE = `weightcharts-${CACHE_VERSION}`;

const APP_SHELL = [
    '/',
    '/index.html',
    '/src/css/styles.css',
    '/src/js/app.js',
    '/src/js/database.js',
    '/src/js/chart.js',
    '/src/config/firebase.js',
    '/src/manifest.json',
    '/src/icons/weight-chart-icon.svg',
    '/src/icons/icon-192.png',
    '/src/icons/icon-512.png',
    '/src/icons/apple-touch-icon.png',
];

// Hosts do Firebase/Google que nunca devem ser cacheados (dados e autenticação ao vivo).
const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.googleapis.com',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            // addAll falha tudo se um item falhar; toleramos faltas individuais.
            .then((cache) => Promise.allSettled(APP_SHELL.map((u) => cache.add(u))))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Firebase/Google ao vivo → deixa passar à rede (sem interceptar).
    if (NETWORK_ONLY.some((h) => url.hostname.includes(h))) return;

    // Terceiros (CDNs) → cache-first.
    if (url.origin !== self.location.origin) {
        event.respondWith(cacheFirst(req));
        return;
    }

    // App próprio → network-first (sempre tenta o mais novo; cai no cache se offline).
    event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch {
        return cached || Response.error();
    }
}

async function networkFirst(req) {
    const cache = await caches.open(CACHE);
    try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
    } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
            const shell = await cache.match('/index.html');
            if (shell) return shell;
        }
        return Response.error();
    }
}
