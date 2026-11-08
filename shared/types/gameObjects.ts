/**
 * gameObjects.ts — Card and Deck Type Definitions
 */

export enum CardType {
  // Cat Boom base cards
  ExplodingKitten = 'exploding-kitten',
  Defuse = 'defuse',
  Nope = 'nope',
  Attack = 'attack',
  Skip = 'skip',
  Favor = 'favor',
  Shuffle = 'shuffle',
  SeeTheFuture = 'see-the-future',
  // Cat combo cards
  TacoCat = 'taco-cat',
  HairyPotatoCat = 'hairy-potato-cat',
  RainbowRalphingCat = 'rainbow-ralphing-cat',
  BeardCat = 'beard-cat',
  Cattermelon = 'cattermelon',
  ImplodingKitten = 'imploding:imploding-kitten',
  Reverse = 'imploding:reverse',
  DrawFromBottom = 'imploding:draw-from-bottom',
  AlterFutureThree = 'imploding:alter-future-3',
  TargetedAttack = 'imploding:targeted-attack',
  FeralCat = 'imploding:feral-cat',
  StreakingKitten = 'streaking:streaking-kitten',
  StreakingExplodingKitten = 'streaking:exploding-kitten',
  StreakingSuperSkip = 'streaking:super-skip',
  SeeFutureFive = 'streaking:see-future-5',
  AlterFutureFive = 'streaking:alter-future-5',
  SwapTopBottom = 'streaking:swap-top-bottom',
  Mark = 'streaking:mark',
  CatomicBomb = 'streaking:catomic-bomb',
  GarbageCollection = 'streaking:garbage-collection',
  CurseCatButt = 'streaking:curse-cat-butt',
  BarkingKitten = 'barking:barking-kitten',
  AlterFutureNow = 'barking:alter-future-now',
  Bury = 'barking:bury',
  PersonalAttack = 'barking:personal-attack',
  ShareFuture = 'barking:share-future',
  TowerOfPower = 'barking:tower-of-power',
  IllTakeThat = 'barking:ill-take-that',
  BarkingSuperSkip = 'barking:super-skip',
  Potluck = 'barking:potluck',
}

export type CardPackId = 'base' | 'imploding' | 'streaking' | 'barking';

export interface CardDefinition {
  pack?: CardPackId;
  isBomb?: boolean;
  type: CardType;
  name: string;
  englishName: string;
  isNormalCat: boolean;
  description: string;
  count: number;
}

export interface CardPack {
  id: CardPackId;
  name: string;
  description: string;
  kind: 'base' | 'expansion';
  color: string;
  cards: readonly CardDefinition[];
}
