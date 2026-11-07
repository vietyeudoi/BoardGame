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
}

export interface CardDefinition {
  type: CardType;
  name: string;
  description: string;
  count: number;
}
