/**
 * TableConfig.ts — Table dimensions and visual parameters
 * Centralized constants for Tabletop Sandbox 3D table.
 * No magic numbers allowed per PROJECT_RULES.md Section B.3.
 */

export const TABLE_CONFIG = {
  // Felt surface dimensions (playable area)
  FELT_WIDTH: 15.0,
  FELT_DEPTH: 9.5,
  FELT_THICKNESS: 0.1,
  SURFACE_Y: 0.0, // Authoritative surface plane height for objects

  // Outer wood rail / border
  RAIL_WIDTH: 0.8,
  RAIL_HEIGHT: 0.26, // Total height of rail cross-section
  RAIL_LIP: 0.10,    // Height lip rises above surface level
  RAIL_BEVEL: 0.04,

  // Table apron (skirt under the rail)
  APRON_THICKNESS: 0.5,

  // Table legs
  LEG_RADIUS: 0.32,
  LEG_HEIGHT: 5.5,
  LEG_INSET_X: 1.4,
  LEG_INSET_Z: 1.2,

  // Visuals & Colors
  FELT_COLOR: 0x1e5628,        // Classic casino green felt
  FELT_ROUGHNESS: 0.90,
  FELT_METALNESS: 0.02,

  WOOD_COLOR: 0x42220f,        // Rich polished walnut wood
  WOOD_ROUGHNESS: 0.38,
  WOOD_METALNESS: 0.08,

  WOOD_TRIM_COLOR: 0x2c1508,   // Deep mahogany accent trim
  WOOD_TRIM_ROUGHNESS: 0.45,

  LEG_COLOR: 0x331a0b,
  LEG_ROUGHNESS: 0.50,

  // ─── Player Area Constants (M1.4.0) ────────────────────────────────────────
  PLAYER_AREA_WIDTH: 3.5,          // Width of each player area rectangle (X-axis)
  PLAYER_AREA_DEPTH: 2.0,          // Depth of each player area rectangle (Z-axis)
  PLAYER_AREA_BORDER_COLOR: 0x00ccff,    // Cyan border
  PLAYER_AREA_HOVER_COLOR:  0x44ddff,    // Lighter cyan on hover
  PLAYER_AREA_SELECT_COLOR: 0x00ff88,    // Green on select
  PLAYER_AREA_BORDER_OPACITY: 0.6,
  PLAYER_AREA_SURFACE_Y: 0.005,    // Slightly above table surface to avoid Z-fighting
} as const;


