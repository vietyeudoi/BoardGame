/**
 * room.ts — Room and Player Types
 * Shared between frontend and backend.
 */
import type { BaseCardPackId, CardPackId, CardType } from './gameObjects.js';
import type { Vector3Like } from './protocol.js';

export interface PlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  playerIndex?: number;
  spectator?: boolean;
}

export type DeckDrawEnd = 'TOP' | 'BOTTOM';
export const DEFAULT_DECK_DRAW_END: DeckDrawEnd = 'TOP';

export type ObjectLocation = 'TABLE' | 'DECK' | 'HAND' | 'DISCARD';

export interface SandboxObject {
  id: string;
  type: 'card' | 'deck' | 'token';
  position: Vector3Like;
  rotation: number;
  faceUp: boolean;
  lockedBy: string | null;
  /** Only populated for cards visible to the receiving player */
  cardType?: string;
  ownerId?: string | null;
  location?: ObjectLocation;
  handIndex?: number;
  takenFromDeck?: boolean;
  /** Chỉ phiên này được xem mặt bài đã lấy từ chồng. */
  privateViewerId?: string;
}



export const ANONYMOUS_HAND_PREFIX = 'anonymous-hand:';

// ID của ô minh họa, không liên hệ với ID lá thật trong phòng.
export function getAnonymousHandSlotId(playerId: string, slot: number): string {
  return ANONYMOUS_HAND_PREFIX + playerId + ':' + slot;
}

export interface DeckSetup {
  basePackId?: BaseCardPackId;
  enabledPacks?: CardPackId[];
  cardCounts?: Partial<Record<CardType, number>>;
  explodingKittens: number;
  defuses: number;
}

export interface RoundSetup extends DeckSetup {
  phase: 'SETUP' | 'PLAYING';
  seatedCount: number;
  ordinaryMultiplier: number;
  totalCards: number;
  remainingCards: number;
  remainingDefuses: number;
  rescueCount?: number;
  remainingRescues?: number;
  packTotals?: Partial<Record<CardPackId, number>>;
  bombCount?: number;
  remainingBombs?: number;
  streakingWarning?: boolean;
  validationError?: string;
}


export const DEFAULT_DECK_AFFECTED_COUNT = 3;

export interface PublicDeckState {
  count: number;
  affectedCount: number;
  topCardType?: string;
}

export interface RoomState {
  id: string;
  name: string;
  players: PlayerInfo[];
  objects: SandboxObject[];
  maxPlayers: number;
  deckDrawEnd?: DeckDrawEnd;
  round?: RoundSetup;
  deckCount?: number;
  deck?: PublicDeckState;
  handCounts?: Record<string, number>;
  handSlots?: Record<string, string[]>;
}

// CardStack căn các lá tại cùng tọa độ ngang. Độ cao xác định lá trên cùng.
export function cardsAtTablePile(objects: readonly SandboxObject[], anchorId: string): SandboxObject[] {
  const anchor = objects.find(card => card.id === anchorId && card.type === 'card'
    && (card.location === 'TABLE' || card.location === 'DISCARD'));
  if (!anchor) return [];
  return objects.filter(card => card.type === 'card' && (card.location === 'TABLE' || card.location === 'DISCARD')
    && card.position.x === anchor.position.x && card.position.z === anchor.position.z)
    .sort((a, b) => a.position.y - b.position.y);
}

export interface ObjectPosition {
  id: string;
  position: Vector3Like;
  rotation: number;
}
