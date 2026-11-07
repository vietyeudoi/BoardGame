/**
 * HandZoneConfig.ts — Configuration for Player Hand Zones (M1.5.0)
 * Centralizes visual constants, dimensions, card arrangement math, and layout positions.
 * Strict TypeScript, no magic numbers, files <= 400 lines per PROJECT_RULES.md.
 */

import { TABLE_CONFIG } from './TableConfig';
import { PlayerCount } from './TableShapeConfig';
import { computeTableZones } from './TableZonesConfig';

export interface HandZonePosition {
  id: string;
  playerIndex: number;
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
  label: string;
}

export const HAND_ZONE_CONFIG = {
  // Dimensions matching player area footprint
  DEFAULT_WIDTH: 5.2,
  DEFAULT_DEPTH: 2.3,

  // Surface Y elevation slightly above felt & placement zone to eliminate Z-fighting
  SURFACE_Y: TABLE_CONFIG.SURFACE_Y + 0.006,

  // Colors & Visual Styling (Cat Boom blue theme)
  BORDER_COLOR: 0x3b82f6,
  BORDER_HOVER_COLOR: 0x60a5fa,
  BORDER_OPACITY: 0.55,
  BORDER_HOVER_OPACITY: 0.9,

  FILL_COLOR: 0x0f172a,
  FILL_OPACITY: 0.16,
  FILL_HOVER_OPACITY: 0.32,

  // ─── M1.7.7.1: Flat Overlapping Hand Row ────────────────────────────────────
  // Every hand card always lies flat on one horizontal plane. Neighbours overlap
  // so the row fits the hand zone, while a strip of each card stays visible.
  // Spacing is derived from card width + card count + available zone width; it
  // is never a single hard-coded distance.
  HAND_MARGIN: 0.15, // Safe horizontal margin inside the hand zone
  NATURAL_GAP: 0.06, // Edge-to-edge gap when there is room for no overlap
  SPACING_RATIO_LIGHT: 0.62, // 4–6 cards: light overlap
  SPACING_RATIO_MEDIUM: 0.48, // 7–10 cards: medium overlap
  SPACING_RATIO_HEAVY: 0.34, // 11+ cards: heavy overlap, still recognisable
  ELEVATION_STEP: 0.002, // Physical step per layer to prevent Z-fighting
  SELECTED_ELEVATION: 0.12, // Visual lift when a card in hand is selected
  SELECTION_LAYER_OFFSET: 100, // Render-order boost for a selected hand card
  BASE_LAYER_INDEX: 20, // RenderOrder base for cards in hand

  // M1.7.7.1: the ONE hover presentation for hand cards — a gentle lift + a tiny
  // scale + a render-order bump. Rotation/pitch/fan are never touched on hover.
  HOVER_LIFT_Y: 0.05,
  HOVER_SCALE: 1.04, // Within the allowed 1.03–1.05 range
  HOVER_LAYER_OFFSET: 30, // Puts the hovered card above its neighbours
  // ────────────────────────────────────────────────────────────────────────────

  // Label Sprite & Badge
  LABEL_Y: 0.08,
  LABEL_FONT_SIZE: 22,
  LABEL_BG_COLOR: 'rgba(15, 23, 42, 0.75)',
  LABEL_TEXT_COLOR: '#93c5fd',
  LABEL_COUNT_COLOR: '#38bdf8',
} as const;

/**
 * Computes hand zone positions for all players, adapted dynamically to table shape and size.
 * Uses exact consecutive-vertex positions matching the player areas.
 */
export function computeHandZoneLayout(
  playerCount: PlayerCount,
  customCircumradius?: number
): HandZonePosition[] {
  const zonesLayout = computeTableZones(playerCount, customCircumradius);
  return zonesLayout.playerAreas.map((pa, i) => ({
    id: `hand_zone_${i + 1}`,
    playerIndex: i,
    x: pa.x,
    z: pa.z,
    rotationY: pa.rotationY,
    width: HAND_ZONE_CONFIG.DEFAULT_WIDTH,
    depth: HAND_ZONE_CONFIG.DEFAULT_DEPTH,
    label: pa.label,
  }));
}

