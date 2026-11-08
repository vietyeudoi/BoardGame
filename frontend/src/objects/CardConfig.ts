/**
 * CardConfig.ts — Centralized Card Dimensions and Visual Constants
 * Standard dimensions and properties for 3D Card objects in the Sandbox.
 * No magic numbers allowed per PROJECT_RULES.md Section B.3.
 */

export const CARD_CONFIG = {
  // Physical dimensions (standard tabletop card ratio ~ 2.5 x 3.5 inches)
  DEFAULT_WIDTH: 2.5,
  DEFAULT_HEIGHT: 3.5,
  DEFAULT_THICKNESS: 0.045,
  DEFAULT_CORNER_RADIUS: 0.12,

  // Geometry curve tessellation
  CURVE_SEGMENTS: 8,

  // Material properties
  EDGE_COLOR: 0xf4f1ea,        // Clean ivory multi-ply cardstock core
  EDGE_ROUGHNESS: 0.65,
  EDGE_METALNESS: 0.0,

  SURFACE_ROUGHNESS: 0.32,     // High-grade satin linen finish
  SURFACE_METALNESS: 0.05,

  // Canvas texture generation dimensions
  TEXTURE_WIDTH: 512,
  TEXTURE_HEIGHT: 716,

  // Default color schemes
  DEFAULT_BG_FRONT: '#ffffff',
  DEFAULT_BG_BACK: '#751f2c',
  DEFAULT_TEXT_COLOR: '#1a1a24',
  DEFAULT_ACCENT_COLOR: '#2563eb',
} as const;


