import { BASE_CARD_DEFINITIONS, CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';
import { FAN_CARD_ART } from '../utils/CardArt';

export function getCardTitle(cardType?: string): string {
  if (!cardType) return 'Lá bài';
  const definition = CARD_DEFINITIONS.get(cardType as CardType);
  if (!definition) return cardType;
  const title = definition.name === definition.englishName
    ? definition.name : definition.name + ' (' + definition.englishName + ')';
  return FAN_CARD_ART[cardType]?.icon ? FAN_CARD_ART[cardType]!.icon + ' ' + title : title;
}

export const CARD_TYPES = BASE_CARD_DEFINITIONS.map(({ type }) => type);
