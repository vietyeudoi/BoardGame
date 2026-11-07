/**
 * PlayerAreaConfig.ts — Centralized configuration for player area layout.
 * Defines visual constants and layout positions for 2–8 players on the tabletop.
 * M1.4.3: Consecutive-vertex polygon alignment & enlarged table positions.
 * No magic numbers — all values defined as named constants per PROJECT_RULES.md.
 */

import { TABLE_CONFIG } from './TableConfig';
import { PlayerCount, TABLE_SHAPE_CONFIGS, getPolygonVertices } from './TableShapeConfig';
import { computeTableZones } from './TableZonesConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerAreaPosition {
  x: number;
  z: number;
  rotationY: number;
  suggestedLabel: string;
}

export interface PlayerAreaLayoutConfig {
  playerCount: PlayerCount;
  positions: PlayerAreaPosition[];
}

// ─── Visual Config ────────────────────────────────────────────────────────────

export const PLAYER_AREA_VISUAL_CONFIG = {
  BORDER_COLOR: TABLE_CONFIG.PLAYER_AREA_BORDER_COLOR,
  HOVER_COLOR: TABLE_CONFIG.PLAYER_AREA_HOVER_COLOR,
  SELECT_COLOR: TABLE_CONFIG.PLAYER_AREA_SELECT_COLOR,
  BORDER_OPACITY: TABLE_CONFIG.PLAYER_AREA_BORDER_OPACITY,
  AREA_WIDTH: TABLE_CONFIG.PLAYER_AREA_WIDTH,
  AREA_DEPTH: TABLE_CONFIG.PLAYER_AREA_DEPTH,
  SURFACE_Y: TABLE_CONFIG.PLAYER_AREA_SURFACE_Y,
  /** Inner slot indicator line color (dimmer than border) */
  SLOT_COLOR: 0x0088aa,
  SLOT_OPACITY: 0.3,
  /** Avatar placeholder color */
  AVATAR_COLOR: 0x334466,
  LABEL_Y: 0.1,
  AVATAR_RADIUS: 0.25,
  AVATAR_SEGMENTS: 12,
  /** Safety distance from rail to player area border */
  RAIL_CLEARANCE: 0.35,
  /** Distance from edge midpoint towards center */
  POLYGON_EDGE_INSET: 1.45,
} as const;

// ─── Ellipse Layout Calculator (Static bounds fallback for test compatibility) ──

const ELLIPSE_SEMI_X = 5.5;
const ELLIPSE_SEMI_Z = 3.0;
const FELT_X_MARGIN = 6.0;
const FELT_Z_MARGIN = 3.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildEllipsePositions(n: number): PlayerAreaPosition[] {
  const positions: PlayerAreaPosition[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const rawX = Math.cos(angle) * ELLIPSE_SEMI_X;
    const rawZ = Math.sin(angle) * ELLIPSE_SEMI_Z;
    const x = clamp(rawX, -FELT_X_MARGIN, FELT_X_MARGIN);
    const z = clamp(rawZ, -FELT_Z_MARGIN, FELT_Z_MARGIN);
    const rotationY = Math.atan2(-Math.sin(angle), Math.cos(angle));
    positions.push({ x, z, rotationY, suggestedLabel: `Người chơi ${i + 1}` });
  }
  return positions;
}

// ─── Manual Rectangular Layouts (2, 3, 4 players) ───────────────────────────

const LAYOUT_2: PlayerAreaPosition[] = [
  { x: 0,    z:  3.65, rotationY: 0,       suggestedLabel: 'Người chơi 1' },
  { x: 0,    z: -3.65, rotationY: Math.PI, suggestedLabel: 'Người chơi 2' },
];

const LAYOUT_3: PlayerAreaPosition[] = [
  { x:  0.0, z:  4.15, rotationY: 0,       suggestedLabel: 'Người chơi 1' },
  { x: -4.5, z: -4.15, rotationY: Math.PI, suggestedLabel: 'Người chơi 2' },
  { x:  4.5, z: -4.15, rotationY: Math.PI, suggestedLabel: 'Người chơi 3' },
];

const LAYOUT_4: PlayerAreaPosition[] = [
  { x:  0.0, z:  4.65, rotationY: 0,             suggestedLabel: 'Người chơi 1' },
  { x:  0.0, z: -4.65, rotationY: Math.PI,       suggestedLabel: 'Người chơi 2' },
  { x:  7.15, z:  0.0, rotationY: -Math.PI / 2,  suggestedLabel: 'Người chơi 3' },
  { x: -7.15, z:  0.0, rotationY:  Math.PI / 2,  suggestedLabel: 'Người chơi 4' },
];

export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

// ─── Dynamic Polygon Layout Generator (M1.4.3 Consecutive-Vertex Math) ──────

/**
 * Calculates player area positions along the perimeter of an N-sided regular polygon table.
 * Each area is strictly parallel to its corresponding edge (P1 -> P2),
 * positioned along the inward normal towards table center.
 */
export function buildPolygonPositions(
  playerCount: number,
  circumradius: number
): PlayerAreaPosition[] {
  const positions: PlayerAreaPosition[] = [];
  const N = playerCount;
  const vertices = getPolygonVertices(N, circumradius);
  const inset = PLAYER_AREA_VISUAL_CONFIG.POLYGON_EDGE_INSET;

  for (let i = 0; i < N; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % N]!;
    const edgeDx = p2.x - p1.x;
    const edgeDz = p2.z - p1.z;
    const edgeLen = Math.hypot(edgeDx, edgeDz);

    const tangentX = edgeDx / edgeLen;
    const tangentZ = edgeDz / edgeLen;
    // Inward normal (90 deg CCW left turn in Three.js XZ coordinates)
    const inwardNormX = tangentZ;
    const inwardNormZ = -tangentX;

    const midX = (p1.x + p2.x) / 2;
    const midZ = (p1.z + p2.z) / 2;

    const x = midX + inset * inwardNormX;
    const z = midZ + inset * inwardNormZ;

    // Rotation angle around Y axis aligning local X with edge vector P2 - P1
    const rotationY = normalizeAngle(Math.atan2(-edgeDz, edgeDx));

    positions.push({
      x,
      z,
      rotationY,
      suggestedLabel: `Người chơi ${i + 1}`,
    });
  }

  return positions;
}

/**
 * Returns player area positions adapted for table shape and radius.
 */
export function getLayoutForShape(
  playerCount: PlayerCount,
  circumradius?: number
): PlayerAreaPosition[] {
  if (playerCount <= 4) {
    if (circumradius !== undefined) {
      const layout = computeTableZones(playerCount, circumradius);
      return layout.playerAreas.map((pa) => ({
        x: pa.x,
        z: pa.z,
        rotationY: pa.rotationY,
        suggestedLabel: pa.label,
      }));
    }
    return LAYOUT_CONFIGS[playerCount].positions;
  }
  const r = circumradius ?? TABLE_SHAPE_CONFIGS[playerCount].circumradius;
  return buildPolygonPositions(playerCount, r);
}

// ─── Layout Map (2–8 Players) ─────────────────────────────────────────────────

export const LAYOUT_CONFIGS: Record<PlayerCount, PlayerAreaLayoutConfig> = {
  2: { playerCount: 2, positions: LAYOUT_2 },
  3: { playerCount: 3, positions: LAYOUT_3 },
  4: { playerCount: 4, positions: LAYOUT_4 },
  5: { playerCount: 5, positions: buildEllipsePositions(5) },
  6: { playerCount: 6, positions: buildEllipsePositions(6) },
  7: { playerCount: 7, positions: buildEllipsePositions(7) },
  8: { playerCount: 8, positions: buildEllipsePositions(8) },
};
