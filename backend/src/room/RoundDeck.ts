import { randomInt } from 'node:crypto';
import { CARD_DEFINITIONS, CARD_PACKS, STARTING_OTHER_CARDS } from '../../../shared/constants/cardTypes.js';
import { CardType, type CardPackId } from '../../../shared/types/gameObjects.js';
import type { DeckSetup, RoundSetup, SandboxObject } from '../../../shared/types/room.js';
import { IdGenerator } from '../utils/IdGenerator.js';

export const DEFAULT_DECK_SETUP: DeckSetup = {
  explodingKittens: CARD_DEFINITIONS.get(CardType.ExplodingKitten)!.count,
  defuses: CARD_DEFINITIONS.get(CardType.Defuse)!.count,
};

export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}


export function mergeDeckSetup(previous: DeckSetup, update: DeckSetup): DeckSetup {
  const explodingKittens = update.cardCounts?.[CardType.ExplodingKitten] ?? update.explodingKittens;
  const defuses = update.cardCounts?.[CardType.Defuse] ?? update.defuses;
  const enabled = update.enabledPacks ?? previous.enabledPacks ?? [];
  return {
    explodingKittens, defuses,
    enabledPacks: CARD_PACKS.filter(pack => pack.kind === 'base' || enabled.includes(pack.id)).map(pack => pack.id),
    cardCounts: { ...previous.cardCounts, ...update.cardCounts,
      [CardType.ExplodingKitten]: explodingKittens, [CardType.Defuse]: defuses },
  };
}

function configuredCards(setup: DeckSetup, doubleDeck: boolean) {
  return CARD_PACKS.filter(pack => setup.enabledPacks?.includes(pack.id)).flatMap(pack =>
    pack.cards.map(card => ({
      ...card,
      count: setup.cardCounts?.[card.type] ?? card.count * (pack.kind === 'base' && doubleDeck ? 2 : 1),
    })),
  );
}

function summarize(setup: DeckSetup, cards: ReturnType<typeof configuredCards>, seatedCount: number, phase: RoundSetup['phase'], doubleDeck: boolean): RoundSetup {
  const packTotals: Partial<Record<CardPackId, number>> = {};
  let totalCards = 0;
  let bombCount = 0;
  for (const card of cards) {
    const pack = card.pack!;
    packTotals[pack] = (packTotals[pack] ?? 0) + card.count;
    totalCards += card.count;
    if (card.isBomb) bombCount += card.count;
  }
  const remainingDefuses = setup.defuses - seatedCount;
  const missingOrdinary = seatedCount * STARTING_OTHER_CARDS - (totalCards - bombCount - setup.defuses);
  let validationError: string | undefined;
  if (seatedCount === 0) validationError = 'Cần ít nhất một người đang ngồi để chia bài.';
  else if (remainingDefuses < 0) validationError = 'Thiếu ' + -remainingDefuses + ' lá Gỡ Bom để chia.';
  else if (missingOrdinary > 0) validationError = 'Không đủ lá ngoài bom và Gỡ Bom để chia. Còn thiếu ' + missingOrdinary + ' lá.';
  return {
    ...setup, phase, seatedCount, ordinaryMultiplier: doubleDeck ? 2 : 1, totalCards, remainingDefuses, packTotals,
    bombCount, remainingBombs: bombCount, streakingWarning: setup.enabledPacks?.includes('streaking') === true && bombCount !== seatedCount,
    remainingCards: totalCards - seatedCount * (STARTING_OTHER_CARDS + 1), validationError,
  };
}

export function previewRound(setup: DeckSetup, seatedCount: number, phase: RoundSetup['phase'], doubleDeck = false): RoundSetup {
  const normalized = mergeDeckSetup(DEFAULT_DECK_SETUP, setup);
  return summarize(normalized, configuredCards(normalized, doubleDeck), seatedCount, phase, doubleDeck);
}

export function buildRoundDeck(setup: DeckSetup, seatedIds: readonly string[], doubleDeck = false): SandboxObject[] {
  const normalized = mergeDeckSetup(DEFAULT_DECK_SETUP, setup);
  const cards = configuredCards(normalized, doubleDeck);
  const plan = summarize(normalized, cards, seatedIds.length, 'SETUP', doubleDeck);
  if (plan.validationError) throw new Error(plan.validationError);

  const makeCard = (cardType: CardType, ownerId: string | null = null, handIndex?: number): SandboxObject => ({
    id: IdGenerator.generate(), type: 'card', cardType, ownerId, handIndex, lockedBy: null,
    position: { x: 0, y: 0, z: 0 }, rotation: 0, location: ownerId ? 'HAND' : 'DECK', faceUp: ownerId !== null,
  });
  const pool: CardType[] = [];
  const bombs: CardType[] = [];
  for (const { type, count, isBomb } of cards) {
    if (type === CardType.Defuse) continue;
    (isBomb ? bombs : pool).push(...Array<CardType>(count).fill(type));
  }
  shuffle(pool);
  const hands = seatedIds.flatMap(id => [
    makeCard(CardType.Defuse, id, 0),
    ...Array.from({ length: STARTING_OTHER_CARDS }, (_, index) => makeCard(pool.pop()!, id, index + 1)),
  ]);
  const remaining = [
    ...pool,
    ...bombs,
    ...Array<CardType>(plan.remainingDefuses).fill(CardType.Defuse),
  ];
  return [...hands, ...shuffle(remaining).map(type => makeCard(type))];
}
