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
   * Trong ván online, người sở hữu tay bài nhận đủ dữ liệu để lật và hiển thị lá của mình.
   */
  static filterObjectForClient(obj: SandboxObject, viewingSessionId?: string, privateHands = false): SandboxObject {
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


    const restricted = obj.privateViewerId && obj.privateViewerId !== viewingSessionId;
    if (privateHands && obj.location === 'HAND' && obj.ownerId === viewingSessionId && !restricted) {
      return { ...obj };
    }
    if (!obj.faceUp || restricted || (privateHands && obj.location === 'HAND')) {
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

    if (publicState.round) {
      const handCounts: Record<string, number> = {};
      let deckCount = 0;
      const objects = publicState.objects.flatMap(obj => {
        if (obj.location === 'DECK') {
          deckCount++;
          return [];
        }
        if (obj.location === 'HAND' && obj.ownerId) {
          handCounts[obj.ownerId] = (handCounts[obj.ownerId] ?? 0) + 1;
          if (obj.ownerId !== viewingSessionId) return [];
        }
        return [this.filterObjectForClient(obj, viewingSessionId, true)];
      });
      const handSlots = Object.fromEntries(Object.keys(handCounts).map(id => [id, room.getHandSlots(id)]));
      return { ...publicState, objects, handCounts, handSlots, deckCount, deck: room.getPublicDeckState() };
    }
    const filteredObjects = publicState.objects.map(obj => this.filterObjectForClient(obj, viewingSessionId));

    return {
      id: publicState.id,
      name: publicState.name,
      players: publicState.players,
      objects: filteredObjects,
      deckDrawEnd: publicState.deckDrawEnd,
      maxPlayers: publicState.maxPlayers,
    };
  }
}

