// Custom Service Worker for Version C (Adaptive Smart SW)
const CACHE_NAME = 'adaptive-pwa-cache-v1';

// Pre-cached assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css',
  '/src/types.ts',
  '/src/apiHelper.ts',
  '/src/indexedDbHelper.ts',
  '/src/BatterySimulator.ts'
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

function broadcastLog(type: 'CACHE_LOG' | 'ADAPTIVE_LOG', payload: any) {
  (self as any).clients.matchAll().then((clients: any[]) => {
    clients.forEach((client) => {
      client.postMessage({
        type,
        payload: {
          timestamp: Date.now(),
          ...payload
        }
      });
    });
  });
}

// Intercept requests and decide strategies dynamically
self.addEventListener('fetch', (event: any) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      // 1. Read battery & network states from message data or cache
      const client = await (self as any).clients.get(event.clientId || '');
      let batteryMode = 'HIGH';
      
      // Since Service Worker does not have direct access to localStorage,
      // it falls back to checking headers, query params or a indexedDB record.
      // We will supply battery mode via an added header or localStorage sync message.
      // Alternatively, we query indexedDB or read a header injected by our fetch wrapper.
      // Let's implement an custom header "X-Battery-Mode" in our frontend fetchWrapper!
      const requestBatteryHeader = event.request.headers.get('x-battery-mode');
      if (requestBatteryHeader) {
        batteryMode = requestBatteryHeader;
      }

      // Check browser network information or header connection quality
      const networkQuality = event.request.headers.get('x-network-quality') || 'Fast4G';

      // 2. Select strategy
      let selectedStrategy = 'Network First';
      let reason = 'Default State (Fast4G + Battery HIGH)';

      const isOffline = !navigator.onLine || networkQuality === 'Offline';
      const isSlow3G = networkQuality === 'Slow3G';
      const isBatteryLow = batteryMode === 'LOW';

      if (isBatteryLow) {
        selectedStrategy = 'Cache First';
        reason = 'Battery level is LOW';
      } else if (isSlow3G) {
        selectedStrategy = 'Cache First';
        reason = 'Network connection is Slow3G';
      } else if (isOffline) {
        selectedStrategy = 'Cache First'; // Serve cached content
        reason = 'Connection is Offline';
      } else {
        selectedStrategy = 'Network First';
        reason = 'Optimal state (Fast4G + Battery HIGH)';
      }

      // Broadcast adaptive decision
      broadcastLog('ADAPTIVE_LOG', {
        batteryMode,
        networkMode: networkQuality,
        selectedStrategy,
        reason
      });

      const cache = await caches.open(CACHE_NAME);

      if (selectedStrategy === 'Cache First') {
        const startTime = performance.now();
        const cachedResponse = await cache.match(event.request);

        if (cachedResponse) {
          const readTime = performance.now() - startTime;
          broadcastLog('CACHE_LOG', {
            event: 'hit',
            resourceName: requestUrl.pathname,
            strategyUsed: 'Cache First',
            responseTime: readTime
          });
          return cachedResponse;
        }

        // Cache Miss -> Fetch and Write
        broadcastLog('CACHE_LOG', {
          event: 'miss',
          resourceName: requestUrl.pathname,
          strategyUsed: 'Cache First'
        });

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.status === 200) {
            const writeStart = performance.now();
            await cache.put(event.request, networkResponse.clone());
            broadcastLog('CACHE_LOG', {
              event: 'write',
              resourceName: requestUrl.pathname,
              strategyUsed: 'Cache First',
              responseTime: performance.now() - writeStart
            });
          }
          return networkResponse;
        } catch (err) {
          return new Response(JSON.stringify({ error: 'Cached resource missing offline' }), { status: 503 });
        }
      } else {
        // Network First strategy
        try {
          const startTime = performance.now();
          const networkResponse = await fetch(event.request);
          
          if (networkResponse.status === 200) {
            const writeStart = performance.now();
            await cache.put(event.request, networkResponse.clone());
            
            // Log writing to cache for freshness
            broadcastLog('CACHE_LOG', {
              event: 'write',
              resourceName: requestUrl.pathname,
              strategyUsed: 'Network First',
              responseTime: performance.now() - writeStart
            });
          }
          return networkResponse;
        } catch (err) {
          // Network failed, fall back to cache
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            broadcastLog('CACHE_LOG', {
              event: 'hit',
              resourceName: requestUrl.pathname,
              strategyUsed: 'Network First (Fallback)',
              responseTime: 0
            });
            return cachedResponse;
          }
          return new Response(JSON.stringify({ error: 'Network failure and no cache available' }), { status: 503 });
        }
      }
    })()
  );
});
