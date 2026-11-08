/**
 * NetworkConfig.ts — Dynamic WebSocket configuration
 * Avoids hardcoded localhost URLs across frontend.
 */
import { WS_PORT } from '@shared/constants/config';

export function getWebSocketUrl(): string {
  // Vite thay biến này lúc build frontend.
  const configuredUrl = import.meta.env?.VITE_WS_URL;
  if (configuredUrl) return configuredUrl;

  // 2. Dynamic browser location
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = Number(import.meta.env?.VITE_WS_PORT || WS_PORT);
    return `${protocol}//${host}:${port}/ws`;
  }

  // 3. Fallback for test / headless
  return `ws://localhost:${WS_PORT}/ws`;
}
