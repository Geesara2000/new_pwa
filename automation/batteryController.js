/**
 * Battery Simulator Controller
 * Controls the simulated battery mode inside the browser page
 * Automation uses this - users never interact with it directly
 */

/**
 * Set battery mode to HIGH inside the page context
 * @param {import('playwright').Page} page
 */
export async function setBatteryHigh(page) {
  await page.evaluate(() => {
    if (window.batterySimulator) {
      window.batterySimulator.setHigh();
    } else {
      // Fallback: directly set in localStorage for the SW to pick up
      localStorage.setItem('pwa_simulated_battery_mode', 'HIGH');
    }
    // Also set a window variable for the apiHelper header injection
    window.simulatedNetworkMode = window.simulatedNetworkMode || 'Fast4G';
  });
  console.log('[BatterySim] Set to HIGH');
}

/**
 * Set battery mode to LOW inside the page context
 * @param {import('playwright').Page} page
 */
export async function setBatteryLow(page) {
  await page.evaluate(() => {
    if (window.batterySimulator) {
      window.batterySimulator.setLow();
    } else {
      localStorage.setItem('pwa_simulated_battery_mode', 'LOW');
    }
    window.simulatedNetworkMode = window.simulatedNetworkMode || 'Fast4G';
  });
  console.log('[BatterySim] Set to LOW');
}

/**
 * Set simulated network mode in page window (for header injection)
 * @param {import('playwright').Page} page
 * @param {string} mode - 'Fast4G', 'Slow3G', or 'Offline'
 */
export async function setNetworkMode(page, mode) {
  await page.evaluate((networkMode) => {
    window.simulatedNetworkMode = networkMode;
  }, mode);
  console.log(`[BatterySim] Network mode set to: ${mode}`);
}

/**
 * Get current battery mode from page
 * @param {import('playwright').Page} page
 * @returns {Promise<string>}
 */
export async function getBatteryMode(page) {
  return page.evaluate(() => {
    if (window.batterySimulator) {
      return window.batterySimulator.getMode();
    }
    return localStorage.getItem('pwa_simulated_battery_mode') || 'HIGH';
  });
}
