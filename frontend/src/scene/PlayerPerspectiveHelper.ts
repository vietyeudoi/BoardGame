/**
 * PlayerPerspectiveHelper.ts — Calculates seat-based camera orientation
 * M1.5.2: Player Perspective & Camera Orientation
 * Determines the azimuthal angle (theta) and camera placement for each player seat
 * on 2–8 player tables (both rectangular and regular polygon layouts).
 */
import { resolveTableSeatCount, type PlayerCount } from '../objects/TableShapeConfig';
import { computeTableZones } from '../objects/TableZonesConfig';

export interface PlayerPerspective {
  playerIndex: number;
  playerCount: PlayerCount;
  seatPosition: { x: number; z: number };
  theta: number; // In radians, compatible with CameraController spherical coordinates
  suggestedLabel: string;
}

/**
 * Computes the recommended camera angle (theta) and seat coordinates for a given player.
 * Uses exact table zone positions so the camera always looks directly over the player's
 * hand zone toward the center of the table (0, 0, 0).
 */
export function computePlayerPerspective(
  playerIndex: number,
  playerCount: PlayerCount,
  circumradius?: number
): PlayerPerspective {
  const safeCount = resolveTableSeatCount(playerCount);
  const zonesLayout = computeTableZones(safeCount, circumradius);
  const areas = zonesLayout.playerAreas;

  const validIndex = Math.max(0, Math.min(areas.length - 1, playerIndex));
  const area = areas[validIndex]!;

  // In CameraController:
  // camera.position.x = radius * sin(phi) * sin(theta)
  // camera.position.z = radius * sin(phi) * cos(theta)
  // Placing the camera along the ray from table center (0, 0) through (area.x, area.z):
  // tan(theta) = x / z  ==>  theta = atan2(x, z).
  const theta = Math.atan2(area.x, area.z);

  return {
    playerIndex: validIndex,
    playerCount: safeCount,
    seatPosition: { x: area.x, z: area.z },
    theta,
    suggestedLabel: area.label,
  };
}

