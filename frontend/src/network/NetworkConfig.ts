/**
 * NetworkConfig.ts — Dynamic WebSocket configuration
 * Avoids hardcoded localhost URLs across frontend.
 */
import { WS_PORT } from '@shared/constants/config';

interface ViteMeta {
  env?: Record<string, string | undefined>;
}

export function getWebSocketUrl(): string {
  // 1. Environment variable if set (Vite import.meta.env)
  try {
    const metaEnv = (import.meta as unknown as ViteMeta)?.env;
    if (metaEnv && metaEnv['VITE_WS_URL']) {
      return String(metaEnv['VITE_WS_URL']);
    }
  } catch {}

  // 2. Dynamic browser location
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const metaEnv = (import.meta as unknown as ViteMeta)?.env;
    const port = metaEnv && metaEnv['VITE_WS_PORT']
      ? Number(metaEnv['VITE_WS_PORT'])
      : WS_PORT;
    return `${protocol}//${host}:${port}/ws`;
  }

  // 3. Fallback for test / headless
  return `ws://localhost:${WS_PORT}/ws`;
}
