/**
 * Experiment Runner - Single Run Executor
 * Runs one complete experiment scenario for a given version, network, and battery config
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { applyNetworkThrottle, removeNetworkThrottle } from './networkEmulator.js';
import { setBatteryHigh, setBatteryLow, setNetworkMode } from './batteryController.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'research.config.json'), 'utf-8'));
const DATA_DIR = join(ROOT, 'research-data');

/**
 * Run one experiment
 * @param {Object} options
 * @param {string} options.version - 'A', 'B', or 'C'
 * @param {string} options.network - 'Fast4G', 'Slow3G', or 'Offline'
 * @param {string} options.battery - 'HIGH' or 'LOW' (only for version C)
 * @param {number} options.runNumber - run iteration number
 */
export async function runExperiment({ version, network, battery, runNumber }) {
  const experimentId = uuidv4();
  const versionUrl = CONFIG.frontends[version];
  const startTime = Date.now();

  const meta = {
    experimentId,
    version,
    runNumber,
    network,
    battery: version === 'C' ? battery : 'N/A',
    browser: 'Chromium',
    os: process.platform,
    timestamp: new Date().toISOString(),
    status: 'running',
    duration: 0,
  };

  // Setup directories
  const screenshotDir = join(DATA_DIR, 'screenshots', experimentId);
  const logDir = join(DATA_DIR, 'logs');
  const lighthouseDir = join(DATA_DIR, 'lighthouse');
  mkdirSync(screenshotDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  mkdirSync(lighthouseDir, { recursive: true });

  const consoleLogs = [];
  const jsErrors = [];
  const metrics = {
    api: [],
    cache: [],
    adaptive: [],
    offline: { queueCreated: false, queueLength: 0, syncSuccess: 0, syncFailure: 0 },
    performance: null,
    network: { totalRequests: 0, failedRequests: 0, transferredBytes: 0 },
  };

  let browser, context, page, cdp;

  try {
    console.log(`\n[Run] Version=${version} Network=${network} Battery=${battery || 'N/A'} Run#${runNumber} ID=${experimentId}`);

    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    page = await context.newPage();

    // Capture console logs
    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text(), timestamp: Date.now() });
    });

    // Capture JS errors
    page.on('pageerror', (err) => {
      jsErrors.push({ message: err.message, stack: err.stack, timestamp: Date.now() });
    });

    // Track network requests via page events
    page.on('request', () => metrics.network.totalRequests++);
    page.on('response', (response) => {
      const contentLength = response.headers()['content-length'];
      if (contentLength) metrics.network.transferredBytes += parseInt(contentLength, 10);
    });
    page.on('requestfailed', () => metrics.network.failedRequests++);

    // Open CDP session for network throttling
    cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');

    // Apply network throttling
    await applyNetworkThrottle(cdp, network === 'Offline' ? 'Fast4G' : network);

    // Navigate to the frontend
    const loadStart = performance.now();
    await page.goto(versionUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
      console.log(`  [Warn] networkidle timeout, continuing...`);
    });
    const loadTime = performance.now() - loadStart;
    metrics.network.loadTime = loadTime;

    // Screenshot: initial page load
    await page.screenshot({ path: join(screenshotDir, '01-home.png') });

    // Set battery mode (for version C)
    if (version === 'C') {
      if (battery === 'LOW') {
        await setBatteryLow(page);
      } else {
        await setBatteryHigh(page);
      }
      await setNetworkMode(page, network);
    }

    // Apply offline throttling AFTER page load (if needed)
    if (network === 'Offline') {
      await applyNetworkThrottle(cdp, 'Offline');
    }

    // --- User Journey Simulation ---

    // 1. Navigate to Products page
    const productsNav = page.locator('nav button', { hasText: 'Products' }).first();
    if (await productsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await productsNav.click();
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: join(screenshotDir, '02-products.png') });

    // 2. Add first available product to cart
    const addToCartBtn = page.locator('button', { hasText: 'Add To Cart' }).first();
    if (await addToCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addToCartBtn.click();
      await page.waitForTimeout(500);
    }

    // 3. Navigate to Cart
    const cartNav = page.locator('nav button', { hasText: 'Cart' }).first();
    if (await cartNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cartNav.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: join(screenshotDir, '03-cart.png') });

    // 4. Go to Checkout
    const checkoutNav = page.locator('nav button', { hasText: 'Checkout' }).first();
    if (await checkoutNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await checkoutNav.click();
      await page.waitForTimeout(500);
    }

    // 5. Fill checkout form
    const nameInput = page.locator('input[placeholder="Enter name"]').first();
    const emailInput = page.locator('input[placeholder="Enter email"]').first();

    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill('Research Automation Bot');
    }
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill('automation@research.test');
    }

    // 6. Submit order
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: join(screenshotDir, '04-checkout.png') });

    // 7. If offline - check for offline queue confirmation
    if (network === 'Offline') {
      const successMsg = await page.locator('text=/offline|stored|queue/i').isVisible({ timeout: 3000 }).catch(() => false);
      metrics.offline.queueCreated = successMsg;

      // Bring network back online
      await removeNetworkThrottle(cdp);
      await page.waitForTimeout(3000);

      // Screenshot after going back online
      await page.screenshot({ path: join(screenshotDir, '05-back-online.png') });

      // Check if sync happened
      const syncMsg = await page.locator('text=/sync|success|completed/i').isVisible({ timeout: 5000 }).catch(() => false);
      if (syncMsg) metrics.offline.syncSuccess = 1;

      // Collect offline queue state from page
      const queueState = await page.evaluate(() => {
        return {
          queueLength: window.offlineQueueLength || 0,
        };
      }).catch(() => ({ queueLength: 0 }));
      metrics.offline.queueLength = queueState.queueLength;
    }

    // 8. Collect metrics from page window
    const pageMetrics = await page.evaluate(() => {
      return {
        apiMetrics: window.apiMetrics || [],
        consoleLogs: window.consoleLogs || [],
        jsErrors: window.jsErrors || [],
        cacheLogs: window.collectedCacheLogs || [],
        adaptiveLogs: window.collectedAdaptiveLogs || [],
      };
    }).catch(() => ({
      apiMetrics: [],
      consoleLogs: [],
      jsErrors: [],
      cacheLogs: [],
      adaptiveLogs: [],
    }));

    metrics.api = pageMetrics.apiMetrics;
    metrics.cache = pageMetrics.cacheLogs;
    metrics.adaptive = pageMetrics.adaptiveLogs;
    consoleLogs.push(...(pageMetrics.consoleLogs || []));
    jsErrors.push(...(pageMetrics.jsErrors || []));

    // Calculate cache hit/miss ratio
    const cacheHits = metrics.cache.filter(l => l.event === 'hit').length;
    const cacheMisses = metrics.cache.filter(l => l.event === 'miss').length;
    const totalCacheOps = cacheHits + cacheMisses;
    metrics.cacheHitRatio = totalCacheOps > 0 ? (cacheHits / totalCacheOps) : 0;
    metrics.cacheMissRatio = totalCacheOps > 0 ? (cacheMisses / totalCacheOps) : 0;

    // 9. Collect Playwright performance timing
    const performanceTiming = await page.evaluate(() => {
      if (window.performance) {
        const nav = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const fcp = paints.find(p => p.name === 'first-contentful-paint');
        return {
          domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
          loadComplete: nav ? nav.loadEventEnd - nav.startTime : 0,
          fcp: fcp ? fcp.startTime : 0,
          ttfb: nav ? nav.responseStart - nav.startTime : 0,
        };
      }
      return {};
    }).catch(() => ({}));

    metrics.performance = performanceTiming;

    const endTime = Date.now();
    meta.duration = endTime - startTime;
    meta.status = 'completed';

  } catch (err) {
    meta.status = 'failed';
    meta.error = err.message;
    meta.duration = Date.now() - startTime;
    console.error(`[ERROR] Experiment ${experimentId} failed:`, err.message);
  } finally {
    // Always cleanup
    try { await page?.screenshot({ path: join(screenshotDir, '99-final.png') }); } catch {}
    try { await browser?.close(); } catch {}
  }

  // Save logs
  writeFileSync(join(logDir, `${experimentId}-console.json`), JSON.stringify(consoleLogs, null, 2));
  writeFileSync(join(logDir, `${experimentId}-errors.json`), JSON.stringify(jsErrors, null, 2));

  // Save raw result
  const result = {
    meta,
    metrics,
  };

  const rawDir = join(DATA_DIR, 'raw');
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(join(rawDir, `${experimentId}.json`), JSON.stringify(result, null, 2));

  console.log(`[Done] Version=${version} Network=${network} Battery=${battery || 'N/A'} Run#${runNumber} Status=${meta.status} Duration=${meta.duration}ms`);

  return result;
}
