/**
 * room.ts — Room and Player Types
 * Shared between frontend and backend.
 */
import type { Vector3Like } from './protocol.js';

export interface PlayerInfo {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  playerIndex?: number;
}

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
}

export interface RoomState {
  id: string;
  name: string;
  players: PlayerInfo[];
  objects: SandboxObject[];
  maxPlayers: number;
}

export interface ObjectPosition {
  id: string;
  position: Vector3Like;
  rotation: number;
}
