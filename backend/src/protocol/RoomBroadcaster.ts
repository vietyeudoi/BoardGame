/**
 * RoomBroadcaster.ts — Secure room broadcasting helpers (M1.5.4)
 * Encapsulates client-filtered broadcasting to maintain privacy and clean architecture.
 */

import type { Room } from '../room/Room.js';
import type { RoomManager } from '../room/RoomManager.js';
import type { PlayerSession } from '../player/PlayerSession.js';
import type { SandboxObject } from '../../../shared/types/room.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';

export class RoomBroadcaster {
  static broadcastRoomState(
    roomManager: RoomManager,
    sessions: Map<string, PlayerSession>,
    roomId: string
  ): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    room.getConnectedSessionIds().forEach((sid) => {
      sessions.get(sid)?.sendRaw({
        type: 'room:state',
        payload: ViewStateBuilder.buildRoomState(room, sid),
      });
    });
  }

  static broadcastToRoom(
    roomManager: RoomManager,
    sessions: Map<string, PlayerSession>,
    roomId: string,
    excludeSessionId: string,
    message: Parameters<PlayerSession['sendRaw']>[0]
  ): void {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    room.getConnectedSessionIds()
      .filter((sid) => sid !== excludeSessionId)
      .forEach((sid) => sessions.get(sid)?.sendRaw(message));
  }

  static broadcastCardDrawn(
    sessions: Map<string, PlayerSession>,
    room: Room,
    card: SandboxObject,
    playerIndex: number,
    end?: import('../../../shared/types/room.js').DeckDrawEnd,
  ): void {
    room.getConnectedSessionIds().forEach((sid) => {
      if (room.phase && sid !== card.ownerId) return;
      sessions.get(sid)?.sendRaw({
        type: 'hand:card-drawn',
        payload: {
          card: ViewStateBuilder.filterObjectForClient(card, sid, Boolean(room.phase)),
          playerIndex,
          end,
        },
      });
    });
  }

  static broadcastHandCardTransferred(
    sessions: Map<string, PlayerSession>,
    room: Room,
    card: SandboxObject,
    fromIdx: number,
    toIdx: number,
    seq?: number
  ): void {
    room.getConnectedSessionIds().forEach((sid) => {
      if (room.phase && sid !== card.ownerId) return;
      sessions.get(sid)?.sendRaw({
        type: 'hand:card-transferred',
        payload: {
          cardId: card.id,
          fromPlayerIndex: fromIdx,
          toPlayerIndex: toIdx,
          card: ViewStateBuilder.filterObjectForClient(card, sid, Boolean(room.phase)),
          ...(seq !== undefined ? { seq } : {}),
        },
      });
    });
  }
}
