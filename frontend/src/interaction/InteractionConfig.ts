/**
 * InteractionConfig.ts — Interaction System Constants
 * Centralizes all magic values for hover, selection, raycasting thresholds,
 * and drag & drop parameters.
 * Part of M1.3.1 & M1.3.2 — Raycasting, Hover & Drag Interaction.
 */

import { PILE_LAYER_HEIGHT } from '@shared/constants/tablePiles';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { CARD_CONFIG } from '../objects/CardConfig';
import { TableShapeParams, clampPointToTable } from '../objects/TableShapeConfig';

export const INTERACTION_CONFIG = {
  /**
   * Emissive color applied to mesh materials when hovered (hex).
   * Blue glow indicating the object is interactive.
   */
  HOVER_EMISSIVE_COLOR: 0x3a80c8,

  /**
   * Emissive intensity applied when hovered.
   * Range: 0.0 (no glow) to 1.0+ (very bright).
   */
  HOVER_EMISSIVE_INTENSITY: 0.35,

  /**
   * Emissive color applied to mesh materials when selected (hex).
   * Green glow indicating the object is actively selected.
   */
  SELECTED_EMISSIVE_COLOR: 0x60a020,

  /**
   * Emissive intensity applied when selected.
   * Slightly brighter than hover to distinguish states clearly.
   */
  SELECTED_EMISSIVE_INTENSITY: 0.5,

  /**
   * Maximum mouse movement in pixels between mousedown and mouseup
   * to count as a click (vs. a camera orbit drag).
   * Below this threshold: treated as click. Above: treated as drag.
   */
  CLICK_DRAG_THRESHOLD_PX: 4,

  /**
   * THREE.Raycaster near threshold — objects closer than this are ignored.
   * Prevents false hits from objects clipping the camera near plane.
   */
  RAYCASTER_NEAR: 0.1,

  /**
   * THREE.Raycaster far threshold — objects further than this are ignored.
   */
  RAYCASTER_FAR: 1000,

  // ─── Drag & Drop (M1.3.2) ────────────────────────────────────────────────

  /**
   * Minimum pointer movement in pixels before drag starts (after mousedown on a card).
   * Prevents accidental micro-drags during clicks.
   */
  DRAG_START_THRESHOLD_PX: 4,

  /**
   * Height (Y-axis world units) the card lifts above the table surface during drag.
   * Keeps the card visually floating above the felt and prevents Z-fighting.
   * Card Group origin is at bottom, so position.y = SURFACE_Y + DRAG_LIFT_Y.
   */
  DRAG_LIFT_Y: 0.15,

  /**
   * Emissive color applied to a card while it is being dragged.
   * Orange-yellow tint to differentiate from hover and selection state.
   */
  DRAG_EMISSIVE_COLOR: 0xd08020,

  /**
   * Emissive intensity for the drag highlight.
   */
  DRAG_EMISSIVE_INTENSITY: 0.45,

  /**
   * Emissive color applied to candidate drop target cards or stacks (M1.3.4.3).
   * Cyan highlight indicating valid merge/drop zone.
   */
  DROP_PREVIEW_EMISSIVE_COLOR: 0x00bfff,

  /**
   * Emissive intensity for drop preview highlight.
   */
  DROP_PREVIEW_EMISSIVE_INTENSITY: 0.6,

  // ─── Manipulation & Arrangement (M1.3.4 / M1.3.4.3) ───────────────────────

  /** Default angle step in radians for rapid rotation (90 degrees) */
  ROTATION_STEP: Math.PI / 2,

  // ─── Free Rotation via Mouse Wheel (M1.7.5 Part 3) ─────────────────────────

  /** Wheel rotation step per notch in DEGREES (default 5°). */
  WHEEL_ROTATION_STEP_DEG: 5,

  /** Fine wheel rotation step per notch in DEGREES while Shift is held (1°). */
  WHEEL_ROTATION_STEP_FINE_DEG: 1,

  /** deltaY units per scroll "line" — used to normalize wheel deltas across browsers. */
  WHEEL_DELTA_UNITS_PER_LINE: 100,

  /** Physical elevation difference per stacked card (prevents geometry clipping) */
  STACK_OFFSET_Y: PILE_LAYER_HEIGHT,

  /** Proximity threshold for joining an existing stack (generous 1.5 units) vs stacking onto a standalone card (0.25 units) */
  STACK_DETECT_RADIUS: 0.25,
  DROP_ZONE_RADIUS: 1.5,

} as const;

export type InsertionMode = 'TOP' | 'BOTTOM' | 'CUSTOM';

/**
 * M1.7.5 Part 3: normalizes a raw WheelEvent delta into whole wheel NOTCHES.
 * Different browsers/devices report pixels (deltaMode 0), lines (1) or pages
 * (2) — one event is NOT necessarily one notch. Result is clamped to ±10
 * notches per event so a stray high-resolution delta can never whip a card
 * around.
 */
export function normalizeWheelNotches(deltaY: number, deltaMode: number): number {
  let notches: number;
  if (deltaMode === 1) {
    notches = deltaY; // lines — already notch-like
  } else if (deltaMode === 2) {
    notches = deltaY * 10; // pages (rare) — approximate
  } else {
    notches = deltaY / INTERACTION_CONFIG.WHEEL_DELTA_UNITS_PER_LINE; // pixels
  }
  if (!Number.isFinite(notches)) return 0;
  return Math.max(-10, Math.min(10, notches));
}

/**
 * Calculates oriented bounding extents on the table XZ plane for a card of given width/height
 * rotated by `rotationY` radians, and clamps the (x, z) coordinates within the playable felt area.
 */
export function clampTablePosition(
  x: number,
  z: number,
  rotationY: number,
  width: number = CARD_CONFIG.DEFAULT_WIDTH,
  height: number = CARD_CONFIG.DEFAULT_HEIGHT,
  tableParams?: TableShapeParams
): { x: number; z: number } {
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));

  // Half extents along X and Z axes in world space
  const halfExtentX = (cos * width + sin * height) / 2;
  const halfExtentZ = (sin * width + cos * height) / 2;
  const margin = Math.max(halfExtentX, halfExtentZ);

  if (tableParams) {
    return clampPointToTable({ x, z }, tableParams, margin);
  }

  // Maximum allowed center positions on the table felt (fallback)
  const maxX = Math.max(0, TABLE_CONFIG.FELT_WIDTH / 2 - halfExtentX);
  const minX = -maxX;
  const maxZ = Math.max(0, TABLE_CONFIG.FELT_DEPTH / 2 - halfExtentZ);
  const minZ = -maxZ;

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
}


