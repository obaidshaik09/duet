import { Capacitor } from '@capacitor/core';

/**
 * API base URL for browser vs Capacitor Android.
 * - Browser (same origin Express / Vite proxy): relative ""
 * - Android emulator: http://10.0.2.2:5000 (host machine loopback)
 * - Override anytime: VITE_API_BASE=http://YOUR_LAN_IP:5000
 */
export function getApiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');

  try {
    if (Capacitor.isNativePlatform()) {
      return 'http://10.0.2.2:5000';
    }
  } catch { /* web */ }

  return '';
}

export function apiUrl(path) {
  const base = getApiBase();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
