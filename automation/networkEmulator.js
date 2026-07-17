/**
 * CDP Network Emulator
 * Uses Chrome DevTools Protocol to throttle network speed
 */

export const NETWORK_PROFILES = {
  Fast4G: {
    offline: false,
    downloadThroughput: 1.6 * 1024 * 1024 / 8, // 1.6 Mbps
    uploadThroughput: 750 * 1024 / 8,           // 750 Kbps
    latency: 150,
  },
  Slow3G: {
    offline: false,
    downloadThroughput: 400 * 1024 / 8, // 400 Kbps
    uploadThroughput: 400 * 1024 / 8,   // 400 Kbps
    latency: 400,
  },
  Offline: {
    offline: true,
    downloadThroughput: 0,
    uploadThroughput: 0,
    latency: 0,
  },
};

/**
 * Apply network throttling via CDP
 * @param {import('playwright').CDPSession} cdp - CDP session
 * @param {string} profile - 'Fast4G', 'Slow3G', or 'Offline'
 */
export async function applyNetworkThrottle(cdp, profile) {
  const config = NETWORK_PROFILES[profile];
  if (!config) throw new Error(`Unknown network profile: ${profile}`);

  await cdp.send('Network.emulateNetworkConditions', {
    offline: config.offline,
    downloadThroughput: config.offline ? -1 : config.downloadThroughput,
    uploadThroughput: config.offline ? -1 : config.uploadThroughput,
    latency: config.latency,
  });

  await cdp.send('Network.enable');
}

/**
 * Remove network throttling (reset to normal)
 */
export async function removeNetworkThrottle(cdp) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
}
