/**
 * FanPreviewConfig.ts — M1.7.8 Full Hand Fan Preview constants & artwork map.
 *
 * Screen-space presentation only. Nothing here touches the 3D hand row or the
 * authoritative CardRegistry/game state.
 */

import type { FanCardArt } from '../utils/CardArt';
export { FAN_CARD_ART, type FanCardArt } from '../utils/CardArt';

export const FAN_CARD_FALLBACK: FanCardArt = {
  icon: '🃏',
  shortName: 'Card',
  accent: '#94a3b8',
  surface: 'radial-gradient(circle at 50% 38%, #f1f5f9 0%, #e2e8f0 42%, #334155 100%)',
};

/** Card back shown if a local hand card is unexpectedly masked. */
export const FAN_CARD_BACK: FanCardArt = {
  icon: '🐾',
  shortName: 'Ẩn',
  accent: '#475569',
  surface: 'radial-gradient(circle at 50% 38%, #334155 0%, #1e293b 55%, #0f172a 100%)',
};

/** Pure layout constants for the fan geometry (px / degrees / ratios). */
export const FAN_PREVIEW_LAYOUT = {
  MIN_CARD_HEIGHT_PX: 102,
  MAX_CARD_HEIGHT_PX: 222,
  CARD_HEIGHT_VIEWPORT_RATIO: 0.264,
  CARD_ASPECT_RATIO: 2.5 / 3.5,

  MIN_VIEWPORT_WIDTH_PX: 320,
  VIEWPORT_MARGIN_MIN_PX: 16,
  VIEWPORT_MARGIN_MAX_PX: 40,
  VIEWPORT_MARGIN_RATIO: 0.03,
  MAX_FAN_WIDTH_PX: 1500,
  PAGE_MAX_CARDS: 24,
  PAGE_VISIBLE_STRIP_PX: 24,
  PAGE_RESERVED_WIDTH_PX: 160,
  PAGE_CONTROLS_HEIGHT_PX: 28,

  /** Desired spacing as a fraction of card width, by hand size. */
  SPACING_RATIO_STEPS: [
    { maxCards: 3, ratio: 0.94 },
    { maxCards: 6, ratio: 0.8 },
    { maxCards: 10, ratio: 0.66 },
    { maxCards: 15, ratio: 0.56 },
    { maxCards: Number.POSITIVE_INFINITY, ratio: 0.48 },
  ] as ReadonlyArray<{ maxCards: number; ratio: number }>,

  BASE_HALF_SPREAD_DEG: 2,
  HALF_SPREAD_PER_CARD_DEG: 0.65,
  MAX_HALF_SPREAD_DEG: 11,

  ARC_HEIGHT_RATIO: 0.045,
  MAX_ARC_HEIGHT_PX: 14,

  CARD_BOTTOM_OFFSET_PX: 10,
  CLOSE_ANIMATION_MS: 260,
  OPEN_ANIMATION_MS: 220,
  STAGGER_PER_CARD_MS: 9,
} as const;
