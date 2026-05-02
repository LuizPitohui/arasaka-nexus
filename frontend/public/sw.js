/**
 * Service Worker — Arasaka Nexus PWA.
 *
 * Estrategias de cache (separadas por tipo de recurso):
 *
 *   /_next/static/*        → cache-first, immutable (1 ano).
 *                            Hash no nome garante atualizacao automatica.
 *
 *   /icon-*, /apple-touch-* → cache-first, refresh em background.
 *
 *   /api/cdn/chapter/*     → cache-first (paginas de capitulo sao
 *   /api/cdn/mihon/*         imutaveis por chapter_id+page_index).
 *   /api/cdn/preview/*       Cap 200 entradas pra nao explodir storage.
 *   /media/*
 *
 *   /api/* (resto)          → network-first, fallback ao cache (lista,
 *                             detalhe, favoritos — dados que mudam).
 *
 *   Documentos HTML        → network-first com fallback offline simples.
 *
 * Versionamento: bump CACHE_VERSION quando mudar a logica do SW pra
 * forcar limpeza de caches antigos.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `nexus-static-${CACHE_VERSION}`;
const PAGES_CACHE = `nexus-pages-${CACHE_VERSION}`;
const API_CACHE = `nexus-api-${CACHE_VERSION}`;
const HTML_CACHE = `nexus-html-${CACHE_VERSION}`;

const PAGES_CACHE_LIMIT = 200; // bytes de capitulo cachados localmente
const API_CACHE_LIMIT = 100;

// Recursos pre-cacheados na instalacao (caminho minimo offline)
const PRECACHE = ['/', '/offline', '/icon-192.png', '/icon-512.png'];

// ---------------------------------------------------------------------
// Install: pre-cache do shell + icones
// ---------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // Ignora falhas de pre-cache (ex: /offline ainda nao existir):
        // SW instala, e o restante e cacheado on-demand.
        Promise.allSettled(PRECACHE.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------
// Activate: limpa caches antigos
// ---------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  const allow = new Set([STATIC_CACHE, PAGES_CACHE, API_CACHE, HTML_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('nexus-') && !allow.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // FIFO simples: remove os mais antigos
  const toDelete = keys.length - maxEntries;
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request, cacheName, { trimTo } = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh em background (stale-while-revalidate) so pra GET com 200
    if (request.method === 'GET') {
      fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
        })
        .catch(() => {});
    }
    return cached;
  }
  const res = await fetch(request);
  if (res && res.ok && request.method === 'GET') {
    cache.put(request, res.clone());
    if (trimTo) trimCache(cacheName, trimTo);
  }
  return res;
}

async function networkFirst(request, cacheName, { trimTo } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok && request.method === 'GET') {
      cache.put(request, res.clone());
      if (trimTo) trimCache(cacheName, trimTo);
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function htmlNetworkFirst(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Ultimo fallback: pagina offline pre-cacheada
    const offline = await caches.match('/offline');
    if (offline) return offline;
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// ---------------------------------------------------------------------
// Fetch: roteamento por padrao de URL
// ---------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // So GET — POST/PUT/DELETE nao deve ser interceptado
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin: passa direto (CDN da CF, Turnstile, etc)
  if (url.origin !== self.location.origin) return;

  // Auth: nunca cachear (cookies + dados sensiveis)
  if (
    url.pathname.startsWith('/api/token') ||
    url.pathname.startsWith('/api/auth')
  ) {
    return; // browser default
  }

  // Digital Asset Links: precisa ser sempre fresh — Chrome do TWA
  // valida online no primeiro launch. Se servir cached/stale, o
  // wrapper Android pode mostrar URL bar achando que nao confia mais
  // no dominio.
  if (url.pathname.startsWith('/.well-known/')) {
    return; // browser default
  }

  // Next.js static (hashed)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Icones e SVGs do app
  if (
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/arasaka-mark.svg' ||
    url.pathname === '/nexus-lockup.svg'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Bytes imutaveis: paginas de capitulo + capas + media local
  if (
    url.pathname.startsWith('/api/cdn/chapter/') ||
    url.pathname.startsWith('/api/cdn/mihon/') ||
    url.pathname.startsWith('/api/cdn/preview/') ||
    url.pathname.startsWith('/media/')
  ) {
    event.respondWith(
      cacheFirst(request, PAGES_CACHE, { trimTo: PAGES_CACHE_LIMIT }),
    );
    return;
  }

  // API JSON (lista, detalhe, favoritos): network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      networkFirst(request, API_CACHE, { trimTo: API_CACHE_LIMIT }),
    );
    return;
  }

  // HTML / navegacao
  if (
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(htmlNetworkFirst(request));
    return;
  }

  // Resto: deixa o browser decidir
});

// ---------------------------------------------------------------------
// Mensagens do client (force update, clear cache, etc)
// ---------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});
