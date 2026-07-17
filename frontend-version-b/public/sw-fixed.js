// Service Worker for Version B - Fixed Strategy (Stale-While-Revalidate)
// This SW uses the same caching strategy for ALL requests regardless of network/battery conditions

const CACHE_NAME = 'fixed-pwa-v1';

// BroadcastChannel for reliable message delivery to all clients
const cacheChannel = new BroadcastChannel('sw-cache-channel');

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Broadcast cache events back to the page for research logging
function broadcastCacheLog(event, url, strategy, responseTime = 0, size = 0, error = '') {
  try {
    cacheChannel.postMessage({
      type: 'CACHE_LOG',
      payload: {
        timestamp: Date.now(),
        event, // 'CACHE_HIT', 'CACHE_MISS', 'CACHE_WRITE', 'CACHE_DELETE', 'CACHE_UPDATE', 'CACHE_ERROR'
        url,
        resourceType: getResourceType(url),
        strategy,
        version: 'B',
        responseTime,
        size,
        error
      }
    });
  } catch (err) {
    console.error('Failed to post message to BroadcastChannel', err);
  }
}

function getResourceType(urlStr) {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    if (pathname.endsWith('.html') || pathname === '/') return 'document';
    if (pathname.endsWith('.js') || pathname.endsWith('.ts') || pathname.endsWith('.tsx') || pathname.endsWith('.jsx')) return 'script';
    if (pathname.endsWith('.css')) return 'style';
    if (pathname.endsWith('.png') || pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.gif') || pathname.endsWith('.svg') || pathname.endsWith('.webp')) return 'image';
    if (pathname.includes('/api/')) return 'api';
    return 'other';
  } catch {
    return 'other';
  }
}

// Stale-While-Revalidate for all GET requests
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      const url = event.request.url;

      // Start background network fetch (always, even if cache hit)
      const networkFetchPromise = fetch(event.request.clone()).then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const writeStart = performance.now();
          const cloneToCache = networkResponse.clone();
          await cache.put(event.request, cloneToCache);
          const writeTime = performance.now() - writeStart;

          // Estimate size from body headers or clone blob size
          let size = 0;
          const len = networkResponse.headers.get('content-length');
          if (len) {
            size = parseInt(len, 10);
          } else {
            try {
              const blob = await networkResponse.clone().blob();
              size = blob.size;
            } catch {}
          }

          if (cachedResponse) {
            // It's an update (revalidation)
            broadcastCacheLog('CACHE_UPDATE', url, 'Stale-While-Revalidate', writeTime, size);
          } else {
            // First time caching
            broadcastCacheLog('CACHE_WRITE', url, 'Stale-While-Revalidate', writeTime, size);
          }
        }
        return networkResponse;
      }).catch((err) => {
        broadcastCacheLog('CACHE_ERROR', url, 'Stale-While-Revalidate', 0, 0, err.message);
        return null;
      });

      if (cachedResponse) {
        // CACHE HIT: return stale response immediately, revalidate in background
        const readStart = performance.now();
        const readTime = performance.now() - readStart;

        broadcastCacheLog('CACHE_HIT', url, 'Stale-While-Revalidate', readTime);

        // Trigger revalidation in background
        event.waitUntil(networkFetchPromise);
        return cachedResponse;
      }

      // CACHE MISS: must wait for network
      broadcastCacheLog('CACHE_MISS', url, 'Stale-While-Revalidate');

      const networkResponse = await networkFetchPromise;
      if (networkResponse) {
        return networkResponse;
      }

      // Both cache and network failed (offline with no cache)
      return new Response(
        JSON.stringify({ error: 'Offline - no cached content available', offline: true }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' }
        }
      );
    })()
  );
});
