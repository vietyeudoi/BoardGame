/**
 * protocol.ts — WebSocket Message Protocol
 * Shared between frontend and backend.
 */

import type { RoomState, PlayerInfo, ObjectPosition, SandboxObject, DeckDrawEnd, DeckSetup, RoundSetup, PublicDeckState } from './room.js';

// ─── Client → Server Messages ───────────────────────────────────────────────

export type ClientToServerMessage =
  | { type: 'room:create'; payload: { roomName: string; playerName?: string; password?: string; doubleDeck?: boolean } }
  | { type: 'room:join'; payload: { roomId: string; playerName: string; password?: string } }
  | { type: 'room:resume'; payload: { roomId: string; playerId: string; token: string } }
  | { type: 'room:leave' }
  | { type: 'round:configure'; payload: DeckSetup }
  | { type: 'round:deal' }
  | { type: 'round:reset' }
  | { type: 'deck:set-draw-end'; payload: { end: DeckDrawEnd } }


  | { type: 'deck:view-open'; payload: { mode: DeckViewMode } }
  | { type: 'deck:view-order'; payload: { id: string; order: number[] } }
  | { type: 'deck:view-close'; payload: { id: string; order?: number[] } }
  | { type: 'deck:insert'; payload: { cardIds: string[]; dragId?: number; cardsAbove?: number } }
  | { type: 'deck:set-affected-count'; payload: { count: number } }
  | { type: 'deck:shuffle' }
  | { type: 'deck:take'; payload?: { cardsAbove: number } }
  | { type: 'card:draw'; payload?: { deckId?: string } }
  | { type: 'card:play-to-table'; payload: { cardId: string; position: Vector3Like; faceUp?: boolean } }
  | { type: 'card:transfer'; payload: { cardId: string; targetPlayerIndex?: number; targetPlayerId?: string; handIndex?: number; seq?: number; dragId?: number } }
  | { type: 'object:move'; payload: { objectId: string; position: Vector3Like; rotation: number } }
  | { type: 'object:flip'; payload: { objectId: string } }
  | { type: 'object:grab'; payload: { objectId: string } }
  | { type: 'object:release'; payload: { objectId: string } }
  | { type: 'draw:hover'; payload: { hovering: boolean } }
  | { type: 'cursor:move'; payload: CursorMovePayload }
  | { type: 'object:drag-preview'; payload: DragPreviewFrame }
  | { type: 'object:drag-preview-stop'; payload: { dragId: number } }
  | { type: 'object:drag-start'; payload: ObjectDragStartPayload }
  | { type: 'object:drag-move'; payload: ObjectDragMovePayload }
  | { type: 'object:drag-end'; payload: ObjectDragEndPayload }
  | { type: 'ping' };

// ─── Server → Client Messages ───────────────────────────────────────────────

export type ServerToClientMessage =
  | { type: 'room:state'; payload: RoomState }
  | { type: 'round:configured'; payload: RoundSetup }
  | { type: 'deck:count'; payload: { count: number; ownerId?: string; handCount?: number; deck?: PublicDeckState } }
  | { type: 'deck:view-state'; payload: DeckViewState | null }
  | { type: 'deck:shuffled'; payload: { deck: PublicDeckState; playerName: string } }
  | { type: 'deck:inserted'; payload: { count: number } }
  | { type: 'room:joined'; payload: { roomId: string; playerId: string; playerIndex: number; resumeToken?: string } }
  | { type: 'room:player-joined'; payload: PlayerInfo }
  | { type: 'room:player-left'; payload: { playerId: string } }
  | { type: 'deck:card-taken'; payload: { card: SandboxObject; deckCount?: number; deck?: PublicDeckState } }
  | { type: 'hand:card-drawn'; payload: { card: SandboxObject; playerIndex: number } }
  | { type: 'hand:card-transferred'; payload: { cardId: string; fromPlayerIndex: number; toPlayerIndex: number; card: SandboxObject; seq?: number } }
  | { type: 'object:moved'; payload: ObjectPosition }
  | { type: 'object:flipped'; payload: { objectId: string; faceUp: boolean; cardType?: string; ownerId?: string | null; location?: string } }
  | { type: 'object:locked'; payload: { objectId: string; lockedBy: string } }
  | { type: 'object:unlocked'; payload: { objectId: string } }
  | { type: 'draw:hovered'; payload: DrawHoverUpdatePayload }
  | { type: 'cursor:update'; payload: CursorUpdatePayload }
  | { type: 'object:drag-preview'; payload: RemoteDragPreviewFrame }
  | { type: 'object:drag-preview-stop'; payload: { dragId: number; playerId: string } }
  | { type: 'object:drag-start'; payload: ObjectDragStartPayload & { playerId: string } }
  | { type: 'object:drag-move'; payload: ObjectDragMovePayload & { playerId: string } }
  | { type: 'object:drag-end'; payload: ObjectDragEndPayload & { playerId: string } }
  | { type: 'error'; payload: { message: string; code?: string; objectId?: string } }
  | { type: 'pong' };

// ─── Shared Types ───────────────────────────────────────────────────────────


export type DeckViewMode = 'see' | 'alter';

export interface DeckViewState {
  id: string;
  mode: DeckViewMode;
  viewerId: string;
  viewerName: string;
  seat: number;
  // Token chỉ là chỉ số trong phiên, không phải ID lá thật.
  cards: { token: number; cardType?: string }[];
}

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

// ─── M1.5.3 Multiplayer Shared Interaction Payloads ─────────────────────────

/** Sent by client to broadcast their cursor position on the table surface (M1.5.3). */
export interface CursorMovePayload {
  /** World X coordinate on table surface. */
  x: number;
  /** Độ cao điểm trỏ khi nằm trên chồng rút. */
  y?: number;
  /** World Z coordinate on table surface. */
  z: number;
  /** Monotonically increasing sequence number for ordering/anti-jitter. */
  seq: number;
}

/** Broadcast by server to all other clients with a player's cursor position (M1.5.3). */
export interface DrawHoverUpdatePayload {
  playerId: string;
  playerName: string;
  hovering: boolean;
}

export interface CursorUpdatePayload {
  playerId: string;
  playerName: string;
  x: number;
  y?: number;
  z: number;
  seq: number;
}

/** Sent when a drag begins on an object (M1.5.3). */
export interface ObjectDragStartPayload {
  objectId: string;
  x: number;
  y: number;
  z: number;
  seq?: number;
}

/** Sent during drag movement, throttled (M1.5.3). */
export interface ObjectDragMovePayload {
  objectId: string;
  x: number;
  y: number;
  z: number;
  /** Monotonically increasing sequence number for ordering. */
  seq: number;
}

/** Sent when drag ends — object dropped at final position (M1.5.3, M1.5.3.1). */
export interface DragPreviewCard extends Vector3Like {
  objectId: string;
  rotation?: number;
  faceUp?: boolean;
}

export interface DragPreviewFrame {
  dragId: number;
  phase: "start" | "move";
  cards: DragPreviewCard[];
}

export interface RemoteDragPreviewFrame extends Omit<DragPreviewFrame, "cards"> {
  playerId: string;
  playerName: string;
  playerIndex: number;
  cards: (DragPreviewCard & { masked?: boolean })[];
}

export interface ObjectDragEndPayload {
  /** Khóa của phiên kéo mới, tùy chọn cho client cũ. */
  dragId?: number;
  objectId: string;
  x: number;
  y: number;
  z: number;
  seq?: number;
  faceUp?: boolean;
  targetPlayerIndex?: number | null;
  /** Insertion index inside the target hand (M1.7.4.2). */
  handIndex?: number;
  /**
   * Table yaw (radians) of the dragged card at drop time (M1.7.5 Part 2).
   * On a HAND→TABLE drop this is the acting seat's default orientation,
   * computed once at the transition; for table drags it is the current manual
   * yaw. Stored authoritatively by the backend and broadcast to all clients.
   */
  rotation?: number;
}
