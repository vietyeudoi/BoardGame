/**
 * TableZonesConfig.ts — Centralized Table Zones Configuration
 * Manages spatial layouts for Deck Zone, Discard Zone, Player Areas, and Card Placement Zones.
 * M1.4.3: Scaled dimensions, consecutive-vertex polygon math, strict non-overlap.
 * Strict TypeScript, no magic numbers, files <= 400 lines.
 */

import { getDefaultSeatPlacement, SHARED_CONFIG, TABLE_PLAYER_AREA_INSET } from '../../../shared/constants/config';
import { DISCARD_ZONE_DEPTH, DISCARD_ZONE_WIDTH, getDiscardZoneCenter } from '@shared/constants/tablePiles';
import { TABLE_CONFIG } from './TableConfig';
import { PlayerCount, TABLE_SHAPE_CONFIGS, getPolygonVertices } from './TableShapeConfig';

export interface ZoneRect {
  id: string;
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
  label: string;
}

export interface TableZonesLayout {
  playerCount: PlayerCount;
  deckZone: ZoneRect;
  discardZone: ZoneRect;
  playerAreas: ZoneRect[];
  cardPlacementZones: ZoneRect[];
}

export const ZONE_VISUAL_CONFIG = {
  DECK_WIDTH: DISCARD_ZONE_WIDTH,
  DECK_DEPTH: DISCARD_ZONE_DEPTH,
  PLACEMENT_WIDTH: 4.6,
  PLACEMENT_DEPTH: 2.4,
  DECK_COLOR: 0x00ccff,
  DISCARD_COLOR: 0xff6644,
  PLACEMENT_COLOR: 0x44ddaa,
  PLACEMENT_OPACITY: 0.45,
  SEAT_PLACEMENT_DEPTH: 1.85,
  SEAT_PLACEMENT_BORDER_OPACITY: 0.20,
  SEAT_PLACEMENT_FILL_OPACITY: 0.035,
  SURFACE_Y: TABLE_CONFIG.SURFACE_Y + 0.005,
} as const;

function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Computes all zones (Deck, Discard, Player Areas, and Card Placement Zones)
 * adapted dynamically to the table shape and player count.
 */
export function computeTableZones(
  playerCount: PlayerCount,
  customCircumradius?: number
): TableZonesLayout {
  const shape = TABLE_SHAPE_CONFIGS[playerCount];
  const R = customCircumradius ?? shape.circumradius;

  // 1. Deck and Discard zones
  const deckX = playerCount === SHARED_CONFIG.MAX_PLAYERS_PER_ROOM ? 0 : playerCount === 2 ? -4.5 : -2.5;

  const deckZone: ZoneRect = {
    id: 'zone_deck',
    x: deckX,
    z: 0,
    rotationY: 0,
    width: ZONE_VISUAL_CONFIG.DECK_WIDTH,
    depth: ZONE_VISUAL_CONFIG.DECK_DEPTH,
    label: 'CHỒNG BÀI RÚT',
  };

  const discardZone: ZoneRect = {
    id: 'zone_discard',
    ...getDiscardZoneCenter(playerCount),
    rotationY: 0,
    width: ZONE_VISUAL_CONFIG.DECK_WIDTH,
    depth: ZONE_VISUAL_CONFIG.DECK_DEPTH,
    label: 'CHỒNG BÀI BỎ',
  };

  const playerAreas: ZoneRect[] = [];
  const cardPlacementZones: ZoneRect[] = [];

  // 2. Regular Polygon Layout (5–8 players) — Consecutive-Vertex Math (M1.4.3)
  if (playerCount >= 5) {
    const N = playerCount;
    const vertices = getPolygonVertices(N, R);
    const playerInset = TABLE_PLAYER_AREA_INSET;
    const placementInset = playerInset + 2.6;

    for (let i = 0; i < N; i++) {
      const p1 = vertices[i]!;
      const p2 = vertices[(i + 1) % N]!;
      const edgeDx = p2.x - p1.x;
      const edgeDz = p2.z - p1.z;
      const edgeLen = Math.hypot(edgeDx, edgeDz);

      const tangentX = edgeDx / edgeLen;
      const tangentZ = edgeDz / edgeLen;
      const inwardNormX = tangentZ;
      const inwardNormZ = -tangentX;

      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;

      const rotY = normalizeAngle(Math.atan2(-edgeDz, edgeDx));

      // Player Area
      playerAreas.push({
        id: `player_area_${i + 1}`,
        x: midX + playerInset * inwardNormX,
        z: midZ + playerInset * inwardNormZ,
        rotationY: rotY,
        width: 4.8,
        depth: 2.2,
        label: `Người chơi ${i + 1}`,
      });

      // Vùng nhận bài dùng cùng tọa độ với máy chủ trên bàn mặc định.
      const placement = N === SHARED_CONFIG.MAX_PLAYERS_PER_ROOM ? getDefaultSeatPlacement(i, R) : {
        x: midX + placementInset * inwardNormX,
        z: midZ + placementInset * inwardNormZ,
        rotationY: rotY,
      };
      cardPlacementZones.push({
        id: `card_placement_${i + 1}`,
        ...placement,
        rotationY: normalizeAngle(placement.rotationY),
        width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH,
        depth: playerCount === SHARED_CONFIG.MAX_PLAYERS_PER_ROOM
          ? ZONE_VISUAL_CONFIG.SEAT_PLACEMENT_DEPTH
          : ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH,
        label: `Vùng Đặt Bài P${i + 1}`,
      });
    }

    return {
      playerCount,
      deckZone,
      discardZone,
      playerAreas,
      cardPlacementZones,
    };
  }

  // 3. Rectangular Layouts (2, 3, 4 players) — M1.4.3 Scaled
  if (playerCount === 2) {
    playerAreas.push(
      { id: 'player_area_1', x: 0, z: 6.2, rotationY: 0, width: 4.8, depth: 2.2, label: 'Người chơi 1' },
      { id: 'player_area_2', x: 0, z: -6.2, rotationY: Math.PI, width: 4.8, depth: 2.2, label: 'Người chơi 2' }
    );
    cardPlacementZones.push(
      { id: 'card_placement_1', x: 0, z: 3.6, rotationY: 0, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P1' },
      { id: 'card_placement_2', x: 0, z: -3.6, rotationY: Math.PI, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P2' }
    );
  } else if (playerCount === 3) {
    playerAreas.push(
      { id: 'player_area_1', x: 0, z: 6.8, rotationY: 0, width: 4.8, depth: 2.2, label: 'Người chơi 1' },
      { id: 'player_area_2', x: -6.8, z: -6.8, rotationY: Math.PI, width: 4.8, depth: 2.2, label: 'Người chơi 2' },
      { id: 'player_area_3', x: 6.8, z: -6.8, rotationY: Math.PI, width: 4.8, depth: 2.2, label: 'Người chơi 3' }
    );
    cardPlacementZones.push(
      { id: 'card_placement_1', x: 0, z: 4.0, rotationY: 0, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P1' },
      { id: 'card_placement_2', x: -6.0, z: -4.0, rotationY: Math.PI, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P2' },
      { id: 'card_placement_3', x: 6.0, z: -4.0, rotationY: Math.PI, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P3' }
    );
  } else {
    // 4 players
    playerAreas.push(
      { id: 'player_area_1', x: 0, z: 7.5, rotationY: 0, width: 4.8, depth: 2.2, label: 'Người chơi 1' },
      { id: 'player_area_2', x: 0, z: -7.5, rotationY: Math.PI, width: 4.8, depth: 2.2, label: 'Người chơi 2' },
      { id: 'player_area_3', x: 11.5, z: 0, rotationY: -Math.PI / 2, width: 4.8, depth: 2.2, label: 'Người chơi 3' },
      { id: 'player_area_4', x: -11.5, z: 0, rotationY: Math.PI / 2, width: 4.8, depth: 2.2, label: 'Người chơi 4' }
    );
    cardPlacementZones.push(
      { id: 'card_placement_1', x: 0, z: 4.4, rotationY: 0, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P1' },
      { id: 'card_placement_2', x: 0, z: -4.4, rotationY: Math.PI, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P2' },
      { id: 'card_placement_3', x: 8.5, z: 0, rotationY: -Math.PI / 2, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P3' },
      { id: 'card_placement_4', x: -8.5, z: 0, rotationY: Math.PI / 2, width: ZONE_VISUAL_CONFIG.PLACEMENT_WIDTH, depth: ZONE_VISUAL_CONFIG.PLACEMENT_DEPTH, label: 'Vùng Đặt Bài P4' }
    );
  }

  return {
    playerCount,
    deckZone,
    discardZone,
    playerAreas,
    cardPlacementZones,
  };
}
