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
  ZombieExplodingKitten = 'zombie:exploding-kitten',
  ZombieKitten = 'zombie:zombie-kitten',
  ZombieAttack = 'zombie:attack',
  AttackOfTheDead = 'zombie:attack-of-the-dead',
  ZombieSkip = 'zombie:skip',
  ZombieSuperSkip = 'zombie:super-skip',
  ZombieSeeTheFuture = 'zombie:see-the-future',
  ZombieShuffle = 'zombie:shuffle',
  Clairvoyance = 'zombie:clairvoyance',
  FeedTheDead = 'zombie:feed-the-dead',
  GraveRobber = 'zombie:grave-robber',
  Clone = 'zombie:clone',
  DigDeeper = 'zombie:dig-deeper',
  ZombieFavor = 'zombie:favor',
  ZombieNope = 'zombie:nope',
  CatOLantern = 'zombie:cat-o-lantern',
  DeCatIpated = 'zombie:de-cat-ipated',
  Electrocat = 'zombie:electrocat',
  VampireCat = 'zombie:vampire-cat',
  CoffeeCoffeeKitten = 'coffee:coffee-kitten',
  CoffeeCaffeine = 'coffee:caffeine',
  CoffeeAmateurArchaeology = 'coffee:amateur-archaeology',
  CoffeeChangeSeats = 'coffee:change-seats',
  CoffeeCoinToss = 'coffee:coin-toss',
  CoffeeCopycat = 'coffee:copycat',
  CoffeeDisable = 'coffee:disable',
  CoffeeForcePlay = 'coffee:force-play',
  CoffeeForesight = 'coffee:foresight',
  CoffeeNowPlus = 'coffee:now-plus',
  CoffeeSuperNope = 'coffee:super-nope',
  CoffeeTheChosenOne = 'coffee:the-chosen-one',
  CoffeeGarbagePile = 'coffee:garbage-pile',
  CoffeeEvilPlot = 'coffee:evil-plot',
  TimebombTimebomb = 'timebomb:timebomb',
  TimebombDefuseTimebomb = 'timebomb:defuse-timebomb',
  TimebombBlind = 'timebomb:blind',
  TimebombSearch = 'timebomb:search',
  TimebombDiscard = 'timebomb:discard',
  TimebombCopyCat = 'timebomb:copy-cat',
  ChaosReturn = 'chaos:return',
  ChaosSplit = 'chaos:split',
  ChaosDumpsterDive = 'chaos:dumpster-dive',
  ChaosCreateTheFuture = 'chaos:create-the-future',
  ChaosPeek = 'chaos:peek',
  ChaosRefuse = 'chaos:refuse',
  ChaosYouveTakeThat = 'chaos:youve-take-that',
  AttackKittyRick = 'attack:kitty-rick',
  AttackCoronaKitten = 'attack:corona-kitten',
  AttackDefuse = 'attack:defuse',
  AttackStreakingKitten = 'attack:streaking-kitten',
  AttackImpendingImplodingKitten = 'attack:impending-imploding-kitten',
  AttackBlackHole = 'attack:black-hole',
  AttackCountingKitten = 'attack:counting-kitten',
  AttackOddKitten = 'attack:odd-kitten',
  AttackUnholyKitten = 'attack:unholy-kitten',
  AttackSuperDefuse = 'attack:super-defuse',
  AttackCaternator = 'attack:caternator',
  AttackTheTwins = 'attack:the-twins',
  AttackNope = 'attack:nope',
  AttackSelfAttack = 'attack:self-attack',
  AttackCreepyPeeky = 'attack:creepy-peeky',
  AttackAnnoyDiarrheaKitty = 'attack:annoy-diarrhea-kitty',
  AttackBattleHamster = 'attack:battle-hamster',
  AttackHipBat = 'attack:hip-bat',
  GamblingDisable = 'gambling:disable',
  GamblingGambler = 'gambling:gambler',
  GamblingDigDeep = 'gambling:dig-deep',
  GamblingUnholyKitten = 'gambling:unholy-kitten',
  GamblingLoadedDice = 'gambling:loaded-dice',
  GamblingAlterDice = 'gambling:alter-dice',
  GamblingFutureDice = 'gambling:future-dice',
  GamblingUnholyHybrid = 'gambling:unholy-hybrid',
}

export type BaseCardPackId = 'base' | 'zombie';
export type CardPackId = BaseCardPackId | 'imploding' | 'streaking' | 'barking' | 'coffee' | 'timebomb' | 'chaos' | 'attack' | 'gambling';

export interface CardDefinition {
  pack?: CardPackId;
  isBomb?: boolean;
  isRescue?: boolean;
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

export interface BaseCardPack extends CardPack {
  id: BaseCardPackId;
  kind: 'base';
  bomb: CardDefinition;
  rescue: CardDefinition;
}
