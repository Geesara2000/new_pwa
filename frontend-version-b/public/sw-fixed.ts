// Custom service worker with stale-while-revalidate for version B
const CACHE_NAME = 'fixed-pwa-cache-v1';

// Assets to pre-cache immediately
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css',
  '/src/types.ts',
  '/src/apiHelper.ts',
  '/src/indexedDbHelper.ts'
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      (self as any).skipWaiting();
    })
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      (self as any).clients.claim();
    })
  );
});

// Helper to broadcast cache logs back to frontend clients
function broadcastCacheLog(data: any) {
  (self as any).clients.matchAll().then((clients: any[]) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'CACHE_LOG',
        payload: {
          timestamp: Date.now(),
          ...data
        }
      });
    });
  });
}

// Stale-While-Revalidate Implementation with Metric Logging
self.addEventListener('fetch', (event: any) => {
  const requestUrl = new URL(event.request.url);

  // We only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Intercept and cache
  event.respondWith(
    (async () => {
      const startTime = performance.now();
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request).then(async (networkResponse) => {
        // Cache success responses
        if (networkResponse.status === 200) {
          const writeStart = performance.now();
          await cache.put(event.request, networkResponse.clone());
          const writeTime = performance.now() - writeStart;
          
          broadcastCacheLog({
            event: 'write',
            resourceName: requestUrl.pathname,
            strategyUsed: 'Stale-While-Revalidate',
            responseTime: writeTime
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Silent error since we fall back to cache
        return null;
      });

      if (cachedResponse) {
        const readTime = performance.now() - startTime;
        
        // Broadcast Cache Hit
        broadcastCacheLog({
          event: 'hit',
          resourceName: requestUrl.pathname,
          strategyUsed: 'Stale-While-Revalidate',
          responseTime: readTime
        });

        // Trigger network refresh in background
        event.waitUntil(fetchPromise);
        return cachedResponse;
      }

      // Cache Miss
      broadcastCacheLog({
        event: 'miss',
        resourceName: requestUrl.pathname,
        strategyUsed: 'Stale-While-Revalidate'
      });

      const networkResponse = await fetchPromise;
      if (networkResponse) {
        return networkResponse;
      }

      // Offline fallback
      return new Response(
        JSON.stringify({ error: 'Offline cached response unavailable' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    })()
  );
});
