/**
 * config.ts — Shared Configuration Constants
 */

export const SHARED_CONFIG = {
  MAX_PLAYERS_PER_ROOM: 8,
  MIN_PLAYERS_PER_ROOM: 2,
  ROOM_ID_LENGTH: 6,
  OBJECT_LOCK_TIMEOUT_MS: 30_000,
  HEARTBEAT_INTERVAL_MS: 15_000,
  HEARTBEAT_TIMEOUT_MS: 5_000,
} as const;

export const WS_PORT = 4000;
export const HTTP_PORT = 4000;
