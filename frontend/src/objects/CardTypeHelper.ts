/**
 * CardTypeHelper.ts — Formats card names and descriptions for display
 */
export function getCardTitle(cardType?: string): string {
  if (!cardType) return 'Lá bài';
  switch (cardType) {
    case 'exploding-kitten':
      return '💣 Mèo Nổ (Exploding Kitten)';
    case 'defuse':
      return '🛠️ Gỡ Bom (Defuse)';
    case 'nope':
      return '🛑 Chặn (Nope!)';
    case 'attack':
      return '⚔️ Tấn Công (Attack)';
    case 'skip':
      return '⏭️ Bỏ Lượt (Skip)';
    case 'favor':
      return '🤝 Xin Xỏ (Favor)';
    case 'shuffle':
      return '🔀 Xào Bài (Shuffle)';
    case 'see-the-future':
      return '🔮 Nhìn Thấu (See The Future)';
    case 'taco-cat':
      return '🌮 Taco Cat';
    case 'hairy-potato-cat':
      return '🥔 Hairy Potato Cat';
    case 'rainbow-ralphing-cat':
      return '🌈 Rainbow Ralphing Cat';
    case 'beard-cat':
      return '🧔 Beard Cat';
    case 'cattermelon':
      return '🍉 Cattermelon';
    default:
      return cardType;
  }
}

/**
 * M1.7.8: Every canonical card type known to the project. Used by the
 * screen-space hand fan preview to pick the correct per-type artwork.
 */
export const CARD_TYPES = [
  'exploding-kitten',
  'defuse',
  'nope',
  'attack',
  'skip',
  'favor',
  'shuffle',
  'see-the-future',
  'taco-cat',
  'hairy-potato-cat',
  'rainbow-ralphing-cat',
  'beard-cat',
  'cattermelon',
] as const;

