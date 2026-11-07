/**
 * FanPreviewConfig.ts — M1.7.8 Full Hand Fan Preview constants & artwork map.
 *
 * Screen-space presentation only. Nothing here touches the 3D hand row or the
 * authoritative CardRegistry/game state.
 */

/** Visual identity for one card face in the fan preview. */
export interface FanCardArt {
  /** Large central glyph — the card's artwork stand-in in the overlay. */
  icon: string;
  /** Short English name shown in the card's header banner. */
  shortName: string;
  /** Accent colour (banner, border, glow). */
  accent: string;
  /** Radial background used behind the artwork glyph. */
  surface: string;
}

/**
 * Per-type artwork. Keys match the canonical card types produced by the
 * backend/deck (see `CARD_TYPES`). Every card type has a distinct glyph and
 * colour, so no two cards share the same face.
 */
export const FAN_CARD_ART: Readonly<Record<string, FanCardArt>> = {
  'exploding-kitten': {
    icon: '💥',
    shortName: 'Exploding Kitten',
    accent: '#fb7185',
    surface: 'radial-gradient(circle at 50% 38%, #ffe4e6 0%, #fecdd3 42%, #7f1d2e 100%)',
  },
  defuse: {
    icon: '🛠️',
    shortName: 'Defuse',
    accent: '#34d399',
    surface: 'radial-gradient(circle at 50% 38%, #d1fae5 0%, #a7f3d0 42%, #065f46 100%)',
  },
  nope: {
    icon: '🛑',
    shortName: 'Nope',
    accent: '#ef4444',
    surface: 'radial-gradient(circle at 50% 38%, #fee2e2 0%, #fecaca 42%, #7f1d1d 100%)',
  },
  attack: {
    icon: '⚔️',
    shortName: 'Attack',
    accent: '#f59e0b',
    surface: 'radial-gradient(circle at 50% 38%, #fef3c7 0%, #fde68a 42%, #78350f 100%)',
  },
  skip: {
    icon: '⏭️',
    shortName: 'Skip',
    accent: '#38bdf8',
    surface: 'radial-gradient(circle at 50% 38%, #e0f2fe 0%, #bae6fd 42%, #075985 100%)',
  },
  favor: {
    icon: '🤝',
    shortName: 'Favor',
    accent: '#c084fc',
    surface: 'radial-gradient(circle at 50% 38%, #f3e8ff 0%, #e9d5ff 42%, #4c1d95 100%)',
  },
  shuffle: {
    icon: '🔀',
    shortName: 'Shuffle',
    accent: '#2dd4bf',
    surface: 'radial-gradient(circle at 50% 38%, #ccfbf1 0%, #99f6e4 42%, #115e59 100%)',
  },
  'see-the-future': {
    icon: '🔮',
    shortName: 'See the Future',
    accent: '#818cf8',
    surface: 'radial-gradient(circle at 50% 38%, #e0e7ff 0%, #c7d2fe 42%, #312e81 100%)',
  },
  'taco-cat': {
    icon: '🌮',
    shortName: 'Taco Cat',
    accent: '#fbbf24',
    surface: 'radial-gradient(circle at 50% 38%, #fef9c3 0%, #fde68a 42%, #854d0e 100%)',
  },
  'hairy-potato-cat': {
    icon: '🥔',
    shortName: 'Hairy Potato Cat',
    accent: '#d97706',
    surface: 'radial-gradient(circle at 50% 38%, #ffedd5 0%, #fed7aa 42%, #7c2d12 100%)',
  },
  'rainbow-ralphing-cat': {
    icon: '🌈',
    shortName: 'Rainbow Ralphing Cat',
    accent: '#e879f9',
    surface: 'radial-gradient(circle at 50% 38%, #fae8ff 0%, #f5d0fe 42%, #701a75 100%)',
  },
  'beard-cat': {
    icon: '🧔',
    shortName: 'Beard Cat',
    accent: '#b45309',
    surface: 'radial-gradient(circle at 50% 38%, #f5f5f4 0%, #e7e5e4 42%, #44403c 100%)',
  },
  cattermelon: {
    icon: '🍉',
    shortName: 'Cattermelon',
    accent: '#4ade80',
    surface: 'radial-gradient(circle at 50% 38%, #dcfce7 0%, #bbf7d0 42%, #14532d 100%)',
  },
};

/** Face used when a card has no known type (e.g. sandbox demo cards). */
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
  MIN_CARD_HEIGHT_PX: 180,
  MAX_CARD_HEIGHT_PX: 240,
  CARD_HEIGHT_VIEWPORT_RATIO: 0.3,
  CARD_ASPECT_RATIO: 2.5 / 3.5,

  MIN_VIEWPORT_WIDTH_PX: 320,
  VIEWPORT_MARGIN_MIN_PX: 16,
  VIEWPORT_MARGIN_MAX_PX: 40,
  VIEWPORT_MARGIN_RATIO: 0.03,
  MAX_FAN_WIDTH_PX: 1500,

  /** Desired spacing as a fraction of card width, by hand size. */
  SPACING_RATIO_STEPS: [
    { maxCards: 3, ratio: 0.94 },
    { maxCards: 6, ratio: 0.8 },
    { maxCards: 10, ratio: 0.66 },
    { maxCards: 15, ratio: 0.56 },
    { maxCards: Number.POSITIVE_INFINITY, ratio: 0.48 },
  ] as ReadonlyArray<{ maxCards: number; ratio: number }>,

  BASE_HALF_SPREAD_DEG: 8,
  HALF_SPREAD_PER_CARD_DEG: 1.6,
  MAX_HALF_SPREAD_DEG: 28,

  ARC_HEIGHT_RATIO: 0.12,
  MAX_ARC_HEIGHT_PX: 34,

  CARD_BOTTOM_OFFSET_PX: 10,
  CLOSE_ANIMATION_MS: 260,
  OPEN_ANIMATION_MS: 220,
  STAGGER_PER_CARD_MS: 9,
} as const;
