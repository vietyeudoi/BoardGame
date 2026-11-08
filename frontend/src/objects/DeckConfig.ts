/**
 * DeckConfig.ts — Centralized Constants for 3D Deck Objects
 * Standard dimensions, visual parameters, and configuration for Deck stacks.
 * Reuses CardConfig dimensions per PROJECT_RULES.md (DRY principle).
 */
import { CARD_CONFIG } from './CardConfig';

export const DECK_CONFIG = {
  // Physical dimensions inherited directly from CardConfig (no duplicate definitions)
  WIDTH: CARD_CONFIG.DEFAULT_WIDTH,
  HEIGHT: CARD_CONFIG.DEFAULT_HEIGHT,
  CARD_THICKNESS: CARD_CONFIG.DEFAULT_THICKNESS,
  CORNER_RADIUS: CARD_CONFIG.DEFAULT_CORNER_RADIUS,

  // Geometry curve tessellation
  CURVE_SEGMENTS: CARD_CONFIG.CURVE_SEGMENTS,

  // Materials & Lighting
  SURFACE_ROUGHNESS: CARD_CONFIG.SURFACE_ROUGHNESS,
  SURFACE_METALNESS: CARD_CONFIG.SURFACE_METALNESS,

  EDGE_COLOR: CARD_CONFIG.EDGE_COLOR,
  EDGE_ROUGHNESS: 0.65,
  EDGE_METALNESS: 0.0,

  // Layered paper striation texture configuration

  // Default color schemes
  DEFAULT_BG_BACK: CARD_CONFIG.DEFAULT_BG_BACK,
} as const;


