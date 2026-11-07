/**
 * ViewStateBuilder.ts — Builds secure, client-filtered RoomState
 * Enforces Private Hand confidentiality per PROJECT_RULES.md Section E.4.
 * NEVER leaks other players' private cards in WebSocket payloads.
 */
import type { RoomState, SandboxObject } from '../../../shared/types/room.js';
import type { Room } from './Room.js';

export class ViewStateBuilder {
  /**
   * Filters a single SandboxObject for a specific viewing client session.
   * Per M1.7.4.2: faceUp is the single source of truth for visibility everywhere.
   * If a card has faceUp === false, or is in the deck, its cardType is stripped.
   * If faceUp === true (in hand or on table), cardType and faceUp: true are visible to everyone.
   */
  static filterObjectForClient(obj: SandboxObject, _viewingSessionId?: string): SandboxObject {
    if (obj.type !== 'card') {
      return { ...obj };
    }

    // Card in deck is always face-down and secret to everyone
    if (obj.location === 'DECK') {
      const filtered: SandboxObject = {
        id: obj.id,
        type: obj.type,
        position: obj.position,
        rotation: obj.rotation,
        faceUp: false,
        lockedBy: obj.lockedBy,
        ownerId: null,
        location: obj.location,
      };
      delete filtered.cardType;
      return filtered;
    }

    // Card in hand or on table with faceUp = false: hide front
    if (!obj.faceUp) {
      const filtered: SandboxObject = {
        ...obj,
        faceUp: false,
      };
      delete filtered.cardType;
      return filtered;
    }

    // Public face-up card (in hand or on table): full content visible to everyone
    return { ...obj };
  }

  /**
   * Builds the complete room state filtered specifically for viewingSessionId.
   */
  static buildRoomState(room: Room, viewingSessionId: string): RoomState {
    const publicState = room.getRawState();
    const filteredObjects = publicState.objects.map((obj) =>
      this.filterObjectForClient(obj, viewingSessionId)
    );

    return {
      id: publicState.id,
      name: publicState.name,
      players: publicState.players,
      objects: filteredObjects,
      maxPlayers: publicState.maxPlayers,
    };
  }
}

