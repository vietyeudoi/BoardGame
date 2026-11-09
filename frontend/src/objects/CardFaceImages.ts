import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';

import { CARD_FACE_ASSET_URLS } from './CardFaceAssetUrls.generated';

export function getCardFaceImage(type?: string | null, copy?: string): string | undefined {
  const paths = CARD_DEFINITIONS.get(type as CardType)?.faceImage;
  const path = copy && paths?.includes(copy) ? copy : paths?.[0];
  return path ? CARD_FACE_ASSET_URLS[path] : undefined;
}
