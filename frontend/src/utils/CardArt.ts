import { CARD_DEFINITIONS, CARD_PACK_BY_ID } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';

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
 * shared/constants/cardTypes.ts. Every card type has a distinct glyph and
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

// Dùng nhãn chữ và màu bộ cho các lá chưa có hình.
export function getExpansionCardArt(type?: string | null) {
  const card = CARD_DEFINITIONS.get(type as CardType);
  const pack = card?.pack ? CARD_PACK_BY_ID.get(card.pack) : undefined;
  if (!card || pack?.kind !== 'expansion') return;
  return { name: card.englishName, pack: pack.name, color: pack.color };
}
