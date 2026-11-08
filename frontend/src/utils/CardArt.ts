import { CARD_DEFINITIONS, CARD_PACK_BY_ID, DEFAULT_BASE_PACK } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';

/** Visual identity for one card face in the fan preview. */
export interface FanCardArt {
  /** Biểu tượng trong vùng minh họa của lá. */
  icon: string;
  /** Short English name shown in the card's header banner. */
  shortName: string;
  /** Accent colour (banner, border, glow). */
  accent: string;
}

/**
 * Per-type artwork. Keys match the canonical card types produced by the
 * shared/constants/cardTypes.ts. Every card type has a distinct glyph and
 * colour, so no two cards share the same face.
 */
export const FAN_CARD_ART: Readonly<Record<string, FanCardArt>> = {
  'exploding-kitten': {
    icon: '💥',
    shortName: 'Exploding Kitten',
    accent: '#fb7185',
  },
  defuse: {
    icon: '🛠️',
    shortName: 'Defuse',
    accent: '#34d399',
  },
  nope: {
    icon: '🛑',
    shortName: 'Nope',
    accent: '#ef4444',
  },
  attack: {
    icon: '⚔️',
    shortName: 'Attack',
    accent: '#f59e0b',
  },
  skip: {
    icon: '⏭️',
    shortName: 'Skip',
    accent: '#38bdf8',
  },
  favor: {
    icon: '🤝',
    shortName: 'Favor',
    accent: '#c084fc',
  },
  shuffle: {
    icon: '🔀',
    shortName: 'Shuffle',
    accent: '#2dd4bf',
  },
  'see-the-future': {
    icon: '🔮',
    shortName: 'See the Future',
    accent: '#818cf8',
  },
  'taco-cat': {
    icon: '🌮',
    shortName: 'Taco Cat',
    accent: '#fbbf24',
  },
  'hairy-potato-cat': {
    icon: '🥔',
    shortName: 'Hairy Potato Cat',
    accent: '#d97706',
  },
  'rainbow-ralphing-cat': {
    icon: '🌈',
    shortName: 'Rainbow Ralphing Cat',
    accent: '#e879f9',
  },
  'beard-cat': {
    icon: '🧔',
    shortName: 'Beard Cat',
    accent: '#b45309',
  },
  cattermelon: {
    icon: '🍉',
    shortName: 'Cattermelon',
    accent: '#4ade80',
  },
};

// Dùng nhãn chữ và màu bộ cho các lá chưa có hình.
export function getPackCardArt(type?: string | null) {
  const card = CARD_DEFINITIONS.get(type as CardType);
  const pack = card?.pack ? CARD_PACK_BY_ID.get(card.pack) : undefined;
  if (!card || !pack || pack.id === DEFAULT_BASE_PACK.id) return;
  return { name: card.englishName, pack: pack.name, color: pack.color };
}
