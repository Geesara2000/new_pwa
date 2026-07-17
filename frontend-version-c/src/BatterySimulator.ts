export type BatteryMode = 'HIGH' | 'LOW';

const SIMULATOR_KEY = 'pwa_simulated_battery_mode';

export const BatterySimulator = {
  setHigh(): void {
    localStorage.setItem(SIMULATOR_KEY, 'HIGH');
    console.log('[Battery Simulator] Mode set to HIGH');
    window.dispatchEvent(new CustomEvent('battery-simulator-changed', { detail: 'HIGH' }));
  },

  setLow(): void {
    localStorage.setItem(SIMULATOR_KEY, 'LOW');
    console.log('[Battery Simulator] Mode set to LOW');
    window.dispatchEvent(new CustomEvent('battery-simulator-changed', { detail: 'LOW' }));
  },

  getMode(): BatteryMode {
    const mode = localStorage.getItem(SIMULATOR_KEY);
    if (mode === 'LOW') {
      return 'LOW';
    }
    // Default to HIGH if not set
    return 'HIGH';
  }
};

// Expose on window for Playwright automation control
(window as any).batterySimulator = BatterySimulator;
