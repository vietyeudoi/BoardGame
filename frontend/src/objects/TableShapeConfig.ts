/**
 * TableShapeConfig.ts — Tabletop Shape, Size, and Geometry Configuration
 * Defines geometric parameters for 2–8 player tables (Rectangles and Regular Polygons).
 * M1.4.3: Scaled dimensions for 2-5 players, table containment & clamping helpers.
 * Strict TypeScript, no magic numbers, files <= 400 lines.
 */

import { DEFAULT_TABLE_RADIUS, SHARED_CONFIG } from '../../../shared/constants/config';
import { TABLE_CONFIG } from './TableConfig';

export type PlayerCount = 2 | 3 | 4 | 5 | 6 | 7 | 8 | typeof SHARED_CONFIG.MAX_PLAYERS_PER_ROOM;
export type TableShapeType = 'rectangle' | 'polygon';

export interface TableShapeParams {
  playerCount: PlayerCount;
  shapeType: TableShapeType;
  /** Number of sides (4 for rectangle, N for regular N-gon) */
  sideCount: number;
  /** Felt width (X axis, rectangle only) */
  feltWidth: number;
  /** Felt depth (Z axis, rectangle only) */
  feltDepth: number;
  /** Outer circumradius of felt surface (or bounding radius for rectangle) */
  circumradius: number;
  /** Inradius / apothem (distance from center to edge midpoint) */
  inradius: number;
  /** Outer rail width */
  railWidth: number;
  railHeight: number;
  railLip: number;
  apronThickness: number;
  legRadius: number;
  legHeight: number;
  legInset: number;
  /** Recommended camera distance to comfortably frame the table */
  cameraRadius: number;
}

// ─── Shape Parameters Map (M1.4.3 Scaled Dimensions) ──────────────────────────

const SEAT_COUNT = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM;

export const TABLE_SHAPE_CONFIGS: Record<PlayerCount, TableShapeParams> = {
  2: {
    playerCount: 2,
    shapeType: 'rectangle',
    sideCount: 4,
    feltWidth: 24.0,
    feltDepth: 16.0,
    circumradius: Math.hypot(24.0 / 2, 16.0 / 2), // ~14.42
    inradius: 16.0 / 2, // 8.0
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.6,
    cameraRadius: 22.0,
  },
  3: {
    playerCount: 3,
    shapeType: 'rectangle',
    sideCount: 4,
    feltWidth: 26.0,
    feltDepth: 17.5,
    circumradius: Math.hypot(26.0 / 2, 17.5 / 2), // ~15.67
    inradius: 17.5 / 2, // 8.75
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.6,
    cameraRadius: 24.0,
  },
  4: {
    playerCount: 4,
    shapeType: 'rectangle',
    sideCount: 4,
    feltWidth: 28.0,
    feltDepth: 19.0,
    circumradius: Math.hypot(28.0 / 2, 19.0 / 2), // ~16.92
    inradius: 19.0 / 2, // 9.5
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.8,
    cameraRadius: 26.0,
  },
  5: {
    playerCount: 5,
    shapeType: 'polygon',
    sideCount: 5,
    feltWidth: 0,
    feltDepth: 0,
    circumradius: 13.0,
    inradius: 13.0 * Math.cos(Math.PI / 5), // ~10.52
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.4,
    cameraRadius: 27.0,
  },
  6: {
    playerCount: 6,
    shapeType: 'polygon',
    sideCount: 6,
    feltWidth: 0,
    feltDepth: 0,
    circumradius: 13.5,
    inradius: 13.5 * Math.cos(Math.PI / 6), // ~11.69
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.5,
    cameraRadius: 28.0,
  },
  7: {
    playerCount: 7,
    shapeType: 'polygon',
    sideCount: 7,
    feltWidth: 0,
    feltDepth: 0,
    circumradius: 15.0,
    inradius: 15.0 * Math.cos(Math.PI / 7), // ~13.51
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.6,
    cameraRadius: 29.0,
  },
  8: {
    playerCount: 8,
    shapeType: 'polygon',
    sideCount: 8,
    feltWidth: 0,
    feltDepth: 0,
    circumradius: 16.5,
    inradius: 16.5 * Math.cos(Math.PI / 8), // ~15.24
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.8,
    cameraRadius: 32.0,
  },
  [SEAT_COUNT]: {
    playerCount: SEAT_COUNT,
    shapeType: 'polygon',
    sideCount: SEAT_COUNT,
    feltWidth: 0,
    feltDepth: 0,
    circumradius: DEFAULT_TABLE_RADIUS,
    inradius: DEFAULT_TABLE_RADIUS * Math.cos(Math.PI / SEAT_COUNT),
    railWidth: TABLE_CONFIG.RAIL_WIDTH,
    railHeight: TABLE_CONFIG.RAIL_HEIGHT,
    railLip: TABLE_CONFIG.RAIL_LIP,
    apronThickness: TABLE_CONFIG.APRON_THICKNESS,
    legRadius: TABLE_CONFIG.LEG_RADIUS,
    legHeight: TABLE_CONFIG.LEG_HEIGHT,
    legInset: 1.8,
    cameraRadius: 30,
  },
};

// Snapshot cũ có thể mang sức chứa 2–8. Giá trị lạ dùng bàn mặc định.
export function resolveTableSeatCount(count: number): PlayerCount {
  return Object.prototype.hasOwnProperty.call(TABLE_SHAPE_CONFIGS, count) ? count as PlayerCount : SEAT_COUNT;
}

/**
 * Returns configuration params for table shape corresponding to player count.
 */
export function getTableShape(playerCount: PlayerCount): TableShapeParams {
  return TABLE_SHAPE_CONFIGS[playerCount];
}

/**
 * Computes vertices of a regular N-sided polygon in XZ plane with an edge at South.
 * Traverses counter-clockwise: Vertex 0 is at South-West, Vertex 1 is at South-East.
 */
export function getPolygonVertices(
  sideCount: number,
  radius: number
): Array<{ x: number; z: number }> {
  const vertices: Array<{ x: number; z: number }> = [];
  for (let k = 0; k < sideCount; k++) {
    const angle = (2 * Math.PI * k - Math.PI) / sideCount;
    vertices.push({
      x: radius * Math.sin(angle),
      z: radius * Math.cos(angle),
    });
  }
  return vertices;
}

/**
 * Computes vertices of a rectangular table in XZ plane in counter-clockwise order:
 * P0: South-West (-W/2, +D/2)
 * P1: South-East (+W/2, +D/2)
 * P2: North-East (+W/2, -D/2)
 * P3: North-West (-W/2, -D/2)
 */
export function getRectangleVertices(
  width: number,
  depth: number
): Array<{ x: number; z: number }> {
  const halfW = width / 2;
  const halfD = depth / 2;
  return [
    { x: -halfW, z: halfD }, // P0: South-West
    { x: halfW, z: halfD },  // P1: South-East
    { x: halfW, z: -halfD }, // P2: North-East
    { x: -halfW, z: -halfD },// P3: North-West
  ];
}

/**
 * Returns the CCW boundary vertices of the table felt (rectangle or polygon).
 */
export function getTableFeltVertices(params: TableShapeParams): Array<{ x: number; z: number }> {
  if (params.shapeType === 'rectangle') {
    return getRectangleVertices(params.feltWidth, params.feltDepth);
  }
  return getPolygonVertices(params.sideCount, params.circumradius);
}

/**
 * Returns the maximum outer bounding radius of the table including outer wood rails.
 */
export function getTableOuterRadius(params: TableShapeParams): number {
  if (params.shapeType === 'rectangle') {
    const outerHalfW = params.feltWidth / 2 + params.railWidth;
    const outerHalfD = params.feltDepth / 2 + params.railWidth;
    return Math.hypot(outerHalfW, outerHalfD);
  }
  return params.circumradius + params.railWidth / Math.cos(Math.PI / params.sideCount);
}

/**
 * Computes midpoints and outward normal angles of polygon edges in XZ plane.
 */
export function getPolygonEdgeMidpoints(
  sideCount: number,
  radius: number
): Array<{ x: number; z: number; angle: number }> {
  const inradius = radius * Math.cos(Math.PI / sideCount);
  const midpoints: Array<{ x: number; z: number; angle: number }> = [];
  for (let k = 0; k < sideCount; k++) {
    const angle = (2 * Math.PI * k) / sideCount;
    midpoints.push({
      x: inradius * Math.sin(angle),
      z: inradius * Math.cos(angle),
      angle,
    });
  }
  return midpoints;
}

// ─── Table Containment & Clamping Helpers (M1.4.3) ────────────────────────────

const GEOMETRY_EPSILON = 1e-5;

/**
 * Determines whether a 2D point (x, z) is inside the table's felt boundary,
 * taking an optional safety margin into account.
 */
export function isPointInsideTable(
  point: { x: number; z: number },
  params: TableShapeParams,
  margin = 0
): boolean {
  if (params.shapeType === 'rectangle') {
    const maxX = Math.max(0, params.feltWidth / 2 - margin);
    const maxZ = Math.max(0, params.feltDepth / 2 - margin);
    return Math.abs(point.x) <= maxX + GEOMETRY_EPSILON && Math.abs(point.z) <= maxZ + GEOMETRY_EPSILON;
  }

  const N = params.sideCount;
  const inradius = params.inradius - margin;
  if (inradius <= 0) return false;

  for (let k = 0; k < N; k++) {
    const angle = (2 * Math.PI * k) / N;
    const proj = point.x * Math.sin(angle) + point.z * Math.cos(angle);
    if (proj > inradius + GEOMETRY_EPSILON) {
      return false;
    }
  }
  return true;
}

function getClosestPointOnPolygon(
  point: { x: number; z: number },
  vertices: Array<{ x: number; z: number }>
): { x: number; z: number } {
  let closestX = point.x;
  let closestZ = point.z;
  let minDistSq = Infinity;
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % n]!;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.z - p1.z) * dz) / lenSq)) : 0;
    const projX = p1.x + t * dx;
    const projZ = p1.z + t * dz;
    const distSq = (point.x - projX) ** 2 + (point.z - projZ) ** 2;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closestX = projX;
      closestZ = projZ;
    }
  }
  return { x: closestX, z: closestZ };
}

/**
 * Clamps a 2D point (x, z) to stay within the table's playable felt area.
 */
export function clampPointToTable(
  point: { x: number; z: number },
  params: TableShapeParams,
  margin = 0
): { x: number; z: number } {
  if (params.shapeType === 'rectangle') {
    const maxX = Math.max(0, params.feltWidth / 2 - margin);
    const maxZ = Math.max(0, params.feltDepth / 2 - margin);
    return {
      x: Math.max(-maxX, Math.min(maxX, point.x)),
      z: Math.max(-maxZ, Math.min(maxZ, point.z)),
    };
  }

  if (isPointInsideTable(point, params, margin)) {
    return { x: point.x, z: point.z };
  }

  const effectiveR = Math.max(0.1, params.circumradius - margin / Math.cos(Math.PI / params.sideCount));
  const vertices = getPolygonVertices(params.sideCount, effectiveR);
  return getClosestPointOnPolygon(point, vertices);
}

export const getNearestValidPoint = clampPointToTable;
