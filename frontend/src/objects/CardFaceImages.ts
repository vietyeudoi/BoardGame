import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';

// Vite đóng gói tệp từ nguồn shared, không cần bản sao trong public.
const assets = import.meta.glob<string>('../../../shared/constants/**/*.{png,jpg,jpeg,webp}', {
  eager: true, import: 'default', query: '?url',
});

export function getCardFaceImage(type?: string | null, copy?: string): string | undefined {
  const paths = CARD_DEFINITIONS.get(type as CardType)?.faceImage;
  const path = copy && paths?.includes(copy) ? copy : paths?.[0];
  return path ? assets['../../../shared/constants/' + path] : undefined;
}
