import { randomInt } from 'node:crypto';
import { CARD_DEFINITIONS, CARD_PACKS, DEFAULT_BASE_PACK, getBasePack, STARTING_OTHER_CARDS } from '../../../shared/constants/cardTypes.js';
import type { BaseCardPack, CardPackId, CardType } from '../../../shared/types/gameObjects.js';
import type { DeckSetup, RoundSetup, SandboxObject } from '../../../shared/types/room.js';
import { IdGenerator } from '../utils/IdGenerator.js';

export const DEFAULT_DECK_SETUP: DeckSetup = {
  basePackId: DEFAULT_BASE_PACK.id,
  explodingKittens: DEFAULT_BASE_PACK.bomb.count,
  defuses: DEFAULT_BASE_PACK.rescue.count,
};

export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}


export function mergeDeckSetup(previous: DeckSetup, update: DeckSetup): DeckSetup {

  // Hai trường cũ chỉ là giá trị tương thích của bộ Exploding Kittens.
  const { bomb, rescue } = DEFAULT_BASE_PACK;
  const explodingKittens = update.cardCounts?.[bomb.type] ?? update.explodingKittens;
  const defuses = update.cardCounts?.[rescue.type] ?? update.defuses;
  const basePackId = update.basePackId ?? previous.basePackId ?? DEFAULT_BASE_PACK.id;
  const enabled = update.enabledPacks ?? previous.enabledPacks ?? [];
  return {
    basePackId, explodingKittens, defuses,
    enabledPacks: [basePackId, ...CARD_PACKS.filter(pack => pack.kind === 'expansion' && enabled.includes(pack.id)).map(pack => pack.id)],
    cardCounts: { ...previous.cardCounts, ...update.cardCounts, [bomb.type]: explodingKittens, [rescue.type]: defuses },
  };
}

function configuredCards(setup: DeckSetup, doubleDeck: boolean) {
  return CARD_PACKS.filter(pack => setup.enabledPacks?.includes(pack.id)).flatMap(pack =>
    pack.cards.map(card => ({
      ...card, pack: pack.id,
      count: setup.cardCounts?.[card.type] ??
        card.count * (pack.kind === 'base' && doubleDeck && !card.isBomb && !card.isRescue ? 2 : 1),
    })),
  );
}

function summarize(setup: DeckSetup, base: BaseCardPack, cards: ReturnType<typeof configuredCards>, seatedCount: number, phase: RoundSetup['phase'], doubleDeck: boolean): RoundSetup {
  const packTotals: Partial<Record<CardPackId, number>> = {};
  let totalCards = 0;
  let bombCount = 0;
  let rescueCount = 0;
  for (const card of cards) {
    packTotals[card.pack] = (packTotals[card.pack] ?? 0) + card.count;
    totalCards += card.count;
    if (card.isBomb) bombCount += card.count;
    if (card.isRescue) rescueCount += card.count;
  }
  const remainingRescues = rescueCount - seatedCount;
  const missingOrdinary = seatedCount * STARTING_OTHER_CARDS - (totalCards - bombCount - rescueCount);
  const rescueName = base.rescue.name === base.rescue.englishName ? base.rescue.name
    : base.rescue.name + ' (' + base.rescue.englishName + ')';
  let validationError: string | undefined;
  if (seatedCount === 0) validationError = 'Cần ít nhất một người đang ngồi để chia bài.';
  else if (remainingRescues < 0) validationError = base.name + ' thiếu ' + -remainingRescues + ' lá ' + rescueName + ' để chia.';
  else if (missingOrdinary > 0) validationError = 'Không đủ lá ngoài bom và lá cứu để chia. Còn thiếu ' + missingOrdinary + ' lá.';
  return {
    ...setup, phase, seatedCount, ordinaryMultiplier: doubleDeck ? 2 : 1, totalCards, packTotals,
    rescueCount, remainingRescues, remainingDefuses: setup.defuses - seatedCount, bombCount, remainingBombs: bombCount,
    streakingWarning: setup.enabledPacks?.includes('streaking') === true && bombCount !== seatedCount,
    remainingCards: totalCards - seatedCount * (STARTING_OTHER_CARDS + 1), validationError,
  };
}

export function previewRound(setup: DeckSetup, seatedCount: number, phase: RoundSetup['phase'], doubleDeck = false): RoundSetup {
  const normalized = mergeDeckSetup(DEFAULT_DECK_SETUP, setup);
  return summarize(normalized, getBasePack(normalized.basePackId), configuredCards(normalized, doubleDeck), seatedCount, phase, doubleDeck);
}

export function buildRoundDeck(setup: DeckSetup, seatedIds: readonly string[], doubleDeck = false): SandboxObject[] {
  const normalized = mergeDeckSetup(DEFAULT_DECK_SETUP, setup);
  const cards = configuredCards(normalized, doubleDeck);
  const base = getBasePack(normalized.basePackId);
  const plan = summarize(normalized, base, cards, seatedIds.length, 'SETUP', doubleDeck);
  if (plan.validationError) throw new Error(plan.validationError);

  const faceCopies = new Map<CardType, number>();
  const makeCard = (cardType: CardType, ownerId: string | null = null, handIndex?: number): SandboxObject => {
    const images = CARD_DEFINITIONS.get(cardType)?.faceImage;
    let faceImage: string | undefined;
    if (images?.length) {
      // Gắn ảnh vào lá thật để xáo, chuyển tay và lật không làm đổi ảnh.
      const copy = faceCopies.get(cardType) ?? 0;
      faceCopies.set(cardType, copy + 1);
      faceImage = images[copy % images.length];
    }
    return {
      id: IdGenerator.generate(), type: 'card', cardType, ownerId, handIndex, lockedBy: null,
      position: { x: 0, y: 0, z: 0 }, rotation: 0, location: ownerId ? 'HAND' : 'DECK', faceUp: ownerId !== null,
      ...(faceImage ? { faceImage } : {}),
    };
  };
  const pool: CardType[] = [];
  const bombs: CardType[] = [];
  for (const { type, count, isBomb, isRescue } of cards) {
    if (isRescue) continue;
    (isBomb ? bombs : pool).push(...Array<CardType>(count).fill(type));
  }
  shuffle(pool);
  const hands = seatedIds.flatMap(id => [
    makeCard(base.rescue.type, id, 0),
    ...Array.from({ length: STARTING_OTHER_CARDS }, (_, index) => makeCard(pool.pop()!, id, index + 1)),
  ]);
  const remaining = [
    ...pool,
    ...bombs,
    ...Array<CardType>(plan.remainingRescues!).fill(base.rescue.type),
  ];
  return [...hands, ...shuffle(remaining).map(type => makeCard(type))];
}
