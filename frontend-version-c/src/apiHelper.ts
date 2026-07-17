import { ApiMetric } from './types';

// Track metrics locally
const apiMetrics: ApiMetric[] = [];

export function getApiMetrics(): ApiMetric[] {
  return apiMetrics;
}

export function clearApiMetrics(): void {
  apiMetrics.length = 0;
}

export async function fetchWithMetrics(url: string, options?: RequestInit): Promise<Response> {
  const startTime = performance.now();
  const timestamp = Date.now();
  const method = options?.method || 'GET';

  try {
    // Read battery & network state and inject as custom headers for the Service Worker
    const batteryMode = (window as any).batterySimulator ? (window as any).batterySimulator.getMode() : 'HIGH';
    const networkQuality = (window as any).simulatedNetworkMode || 'Fast4G';

    const headers = new Headers(options?.headers || {});
    headers.set('x-battery-mode', batteryMode);
    headers.set('x-network-quality', networkQuality);

    const response = await fetch(url, {
      ...options,
      headers
    });

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    // Clone response to calculate payload size
    const clone = response.clone();
    let payloadSize = 0;
    try {
      const blob = await clone.blob();
      payloadSize = blob.size;
    } catch {
      payloadSize = 0;
    }

    const metric: ApiMetric = {
      url,
      method,
      responseTime,
      statusCode: response.status,
      payloadSize,
      timestamp,
    };

    apiMetrics.push(metric);

    // Dispatch event so the UI can display metric summary
    window.dispatchEvent(new CustomEvent('api-metric-added', { detail: metric }));

    return response;
  } catch (error) {
    const endTime = performance.now();
    const responseTime = endTime - startTime;

    const metric: ApiMetric = {
      url,
      method,
      responseTime,
      statusCode: 0, // indicates connection failure or network block
      payloadSize: 0,
      timestamp,
    };

    apiMetrics.push(metric);
    window.dispatchEvent(new CustomEvent('api-metric-added', { detail: metric }));
    throw error;
  }
}
