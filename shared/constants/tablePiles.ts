import { SHARED_CONFIG } from './config.js';

// Bề dày một lá và khe nhỏ để hai mặt không trùng nhau.
export const PILE_LAYER_HEIGHT = 0.047;
export const DISCARD_ZONE_WIDTH = 2.6;
export const DISCARD_ZONE_DEPTH = 3.6;

export function getDiscardZoneCenter(seats: number): { x: number; z: number } {
  return { x: seats === SHARED_CONFIG.MAX_PLAYERS_PER_ROOM ? 3.6 : seats === 2 ? 4.5 : 2.5, z: 0 };
}

export function isInDiscardZone(position: { x: number; z: number }, seats: number): boolean {
  const center = getDiscardZoneCenter(seats);
  return Math.abs(position.x - center.x) <= DISCARD_ZONE_WIDTH / 2
    && Math.abs(position.z - center.z) <= DISCARD_ZONE_DEPTH / 2;
}
