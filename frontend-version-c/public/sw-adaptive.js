// Service Worker for Version C - Adaptive Smart Caching
// Dynamically selects between Cache First and Network First
// based on battery mode and network quality headers injected by the frontend

const CACHE_NAME = 'adaptive-pwa-v1';

// BroadcastChannel for reliable message delivery to all clients
const cacheChannel = new BroadcastChannel('sw-cache-channel');

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
        version: 'C',
        responseTime,
        size,
        error
      }
    });
  } catch (err) {
    console.error('Failed to post message to BroadcastChannel', err);
  }
}

function broadcastAdaptiveLog(batteryMode, networkMode, selectedStrategy, reason, url) {
  try {
    cacheChannel.postMessage({
      type: 'ADAPTIVE_LOG',
      payload: {
        timestamp: Date.now(),
        batteryMode,
        networkMode,
        selectedStrategy,
        reason,
        url
      }
    });
  } catch (err) {
    console.error('Failed to post adaptive log to BroadcastChannel', err);
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

// Determine the optimal caching strategy from request headers
function selectStrategy(request) {
  const batteryMode = request.headers.get('x-battery-mode') || 'HIGH';
  const networkQuality = request.headers.get('x-network-quality') || 'Fast4G';

  if (networkQuality === 'Offline') {
    return {
      strategy: 'Cache First',
      reason: 'Network is Offline - serving cached content',
      batteryMode,
      networkMode: networkQuality,
    };
  }

  if (batteryMode === 'LOW') {
    return {
      strategy: 'Cache First',
      reason: 'Battery level is LOW - minimizing network requests',
      batteryMode,
      networkMode: networkQuality,
    };
  }

  if (networkQuality === 'Slow3G') {
    return {
      strategy: 'Cache First',
      reason: 'Network is Slow3G - prioritizing cached content',
      batteryMode,
      networkMode: networkQuality,
    };
  }

  // Default: Fast4G + Battery HIGH → Network First for freshness
  return {
    strategy: 'Network First',
    reason: 'Optimal conditions (Fast4G + Battery HIGH) - prioritizing fresh data',
    batteryMode,
    networkMode: networkQuality,
  };
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    (async () => {
      const url = event.request.url;
      const cache = await caches.open(CACHE_NAME);

      // Select adaptive strategy from headers
      const { strategy, reason, batteryMode, networkMode } = selectStrategy(event.request);

      // Log adaptive decision
      broadcastAdaptiveLog(batteryMode, networkMode, strategy, reason, url);

      if (strategy === 'Cache First') {
        // --- Cache First Strategy ---
        const cacheStart = performance.now();
        const cachedResponse = await cache.match(event.request);

        if (cachedResponse) {
          const readTime = performance.now() - cacheStart;
          broadcastCacheLog('CACHE_HIT', url, 'Cache First', readTime);
          return cachedResponse;
        }

        // Cache miss - must go to network
        broadcastCacheLog('CACHE_MISS', url, 'Cache First');

        try {
          const networkResponse = await fetch(event.request.clone());
          if (networkResponse.status === 200) {
            const writeStart = performance.now();
            await cache.put(event.request, networkResponse.clone());
            const writeTime = performance.now() - writeStart;

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

            broadcastCacheLog('CACHE_WRITE', url, 'Cache First', writeTime, size);
          }
          return networkResponse;
        } catch (err) {
          broadcastCacheLog('CACHE_ERROR', url, 'Cache First', 0, 0, err.message);
          return new Response(
            JSON.stringify({ error: 'Offline and resource not in cache', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' } }
          );
        }

      } else {
        // --- Network First Strategy ---
        try {
          const netStart = performance.now();
          const networkResponse = await fetch(event.request.clone());
          const netTime = performance.now() - netStart;

          // Process caching in the background
          if (networkResponse.status === 200) {
            const writeStart = performance.now();
            await cache.put(event.request, networkResponse.clone());
            const writeTime = performance.now() - writeStart;

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

            const cachedBefore = await cache.match(event.request);
            if (cachedBefore) {
              broadcastCacheLog('CACHE_UPDATE', url, 'Network First', writeTime, size);
            } else {
              broadcastCacheLog('CACHE_WRITE', url, 'Network First', writeTime, size);
            }
          }

          return networkResponse;
        } catch (err) {
          // Network failed - fall back to cache
          const cachedResponse = await cache.match(event.request);
          if (cachedResponse) {
            broadcastCacheLog('CACHE_HIT', url, 'Network First (Cache Fallback)', 0);
            return cachedResponse;
          }

          broadcastCacheLog('CACHE_MISS', url, 'Network First (Cache Miss)');
          broadcastCacheLog('CACHE_ERROR', url, 'Network First', 0, 0, err.message);

          return new Response(
            JSON.stringify({ error: 'Network failed and no cache available', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' } }
          );
        }
      }
    })()
  );
});
