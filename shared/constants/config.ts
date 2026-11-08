/**
 * config.ts — Shared Configuration Constants
 */

export const SHARED_CONFIG = {
  MAX_PLAYERS_PER_ROOM: 10,
  MIN_PLAYERS_PER_ROOM: 2,
  ROOM_ID_LENGTH: 6,
  OBJECT_LOCK_TIMEOUT_MS: 30_000,
  HEARTBEAT_INTERVAL_MS: 15_000,
  HEARTBEAT_TIMEOUT_MS: 5_000,
} as const;

export const DEFAULT_TABLE_RADIUS = 14;
export const TABLE_PLAYER_AREA_INSET = 1.45;
export const TABLE_SEAT_PLACEMENT_INSET = 3.75;

// Tâm vùng đặt bài của từng ghế trên bàn mặc định, trong hệ tọa độ bàn.
export function getDefaultSeatPlacement(seat: number, radius = DEFAULT_TABLE_RADIUS) {
  const seats = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM;
  const angle = 2 * Math.PI * seat / seats;
  const distance = radius * Math.cos(Math.PI / seats) - TABLE_PLAYER_AREA_INSET - TABLE_SEAT_PLACEMENT_INSET;
  return { x: distance * Math.sin(angle), z: distance * Math.cos(angle), rotationY: angle };
}
export const DEMO_TABLE_CARD_ID = "demo_card_1";
export const DEMO_TABLE_CARD_X = -3.6;

export const WS_PORT = 4000;
export const HTTP_PORT = 4000;
