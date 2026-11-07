/**
 * MessageDispatcher.ts — Routes incoming WS messages to handlers
 */
import type { ClientToServerMessage, Vector3Like } from '../../../shared/types/protocol.js';
import type { RoomManager } from '../room/RoomManager.js';
import type { PlayerSession } from '../player/PlayerSession.js';
import type { Room } from '../room/Room.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';
import { RoomBroadcaster } from './RoomBroadcaster.js';
import { MessageValidator } from '../validation/MessageValidator.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('MessageDispatcher');

/** Minimum interval between object:drag-move messages per client (ms). */
const DRAG_MOVE_THROTTLE_MS = 50;

export class MessageDispatcher {
  /** Tracks the last drag-move timestamp per sessionId to enforce throttle. */
  private readonly _dragMoveTimestamps = new Map<string, number>();

  constructor(
    private readonly _roomManager: RoomManager,
    private readonly _sessions: Map<string, PlayerSession>
  ) {}

  dispatch(sessionId: string, raw: unknown): void {
    const session = this._sessions.get(sessionId);
    if (!session) {
      logger.warn('Message from unknown session', { sessionId });
      return;
    }

    const result = MessageValidator.validate(raw);
    if (!result.success) {
      logger.warn('Invalid message format', { sessionId, error: result.error });
      session.sendError('Invalid message format', 'INVALID_FORMAT');
      return;
    }

    const msg = result.data;
    logger.debug('Dispatching message', { sessionId, type: msg.type });

    try {
      this._route(sessionId, session, msg);
    } catch (error) {
      logger.error('Error handling message', { sessionId, type: msg.type, error: String(error) });
      session.sendError(error instanceof Error ? error.message : 'Internal server error', 'INTERNAL_ERROR');
    }
  }

  private _route(sessionId: string, session: PlayerSession, msg: ClientToServerMessage): void {
    switch (msg.type) {
      case 'room:create':
        this._handleRoomCreate(sessionId, session, msg.payload);
        break;
      case 'room:join':
        this._handleRoomJoin(sessionId, session, msg.payload);
        break;
      case 'room:leave':
        this._handleRoomLeave(sessionId, session);
        break;
      case 'card:draw':
        this._handleCardDraw(sessionId, session);
        break;
      case 'card:play-to-table':
        this._handleCardPlay(sessionId, session, msg.payload);
        break;
      case 'card:transfer':
        this._handleCardTransfer(sessionId, session, msg.payload);
        break;
      case 'object:move':
        this._handleObjectMove(sessionId, session, msg.payload);
        break;
      case 'object:flip':
        this._handleObjectFlip(sessionId, session, msg.payload);
        break;
      case 'ping':
        session.sendRaw({ type: 'pong' });
        break;
      case 'object:grab':
      case 'object:release':
        logger.debug('Object interaction lock', { type: msg.type });
        break;
      case 'cursor:move':
        this._handleCursorMove(sessionId, session, msg.payload);
        break;
      case 'object:drag-start':
        this._handleDragStart(sessionId, session, msg.payload);
        break;
      case 'object:drag-move':
        this._handleDragMove(sessionId, session, msg.payload);
        break;
      case 'object:drag-end':
        this._handleDragEnd(sessionId, session, msg.payload);
        break;
    }
  }

  private _enterRoom(session: PlayerSession, room: Room, sessionId: string): number {
    session.roomId = room.id;
    const playerIndex = room.getPlayerIndex(sessionId);
    session.sendRaw({ type: 'room:joined', payload: { roomId: room.id, playerId: sessionId, playerIndex } });
    session.sendRaw({ type: 'room:state', payload: ViewStateBuilder.buildRoomState(room, sessionId) });
    return playerIndex;
  }

  private _handleRoomCreate(
    sessionId: string,
    session: PlayerSession,
    payload: { roomName: string; maxPlayers?: number; password?: string }
  ): void {
    const room = this._roomManager.createRoom({
      name: payload.roomName,
      hostSessionId: sessionId,
      hostName: session.playerName ?? 'Player',
      password: payload.password,
      maxPlayers: payload.maxPlayers,
    });
    const playerIndex = this._enterRoom(session, room, sessionId);
    logger.info('Room created', { sessionId, roomId: room.id, playerIndex });
  }

  private _handleRoomJoin(
    sessionId: string,
    session: PlayerSession,
    payload: { roomId: string; playerName: string; password?: string }
  ): void {
    session.playerName = payload.playerName;
    const room = this._roomManager.joinRoom(payload.roomId, sessionId, payload.playerName, payload.password);
    const playerIndex = this._enterRoom(session, room, sessionId);
    const newPlayer = { id: sessionId, name: payload.playerName, isHost: false, isConnected: true, playerIndex };
    this._broadcastToRoom(room.id, sessionId, { type: 'room:player-joined', payload: newPlayer });
    logger.info('Player joined room', { sessionId, roomId: room.id, playerIndex });
  }

  public handleDisconnect(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (!session || !session.roomId) return;
    const roomId = session.roomId;
    const room = this._roomManager.getRoom(roomId);
    if (room) {
      room.clearSessionLocks(sessionId).forEach((objectId) => {
        const obj = room.getObject(objectId);
        // Never broadcast a private hand card's raw transform.
        if (obj?.location === 'HAND') return;
        this._broadcastToRoom(roomId, sessionId, {
          type: 'object:drag-end',
          payload: {
            objectId,
            playerId: sessionId,
            x: obj?.position.x ?? 0,
            y: obj?.position.y ?? 0,
            z: obj?.position.z ?? 0,
            faceUp: obj?.faceUp,
          },
        });
      });
    }
    this._roomManager.handlePlayerDisconnect(roomId, sessionId);
    this._broadcastToRoom(roomId, sessionId, { type: 'room:player-left', payload: { playerId: sessionId } });
    session.roomId = null;
    this._dragMoveTimestamps.delete(sessionId);
    logger.info('Player left / disconnected', { sessionId, roomId });
  }

  private _handleRoomLeave(sessionId: string, _session: PlayerSession): void {
    this.handleDisconnect(sessionId);
  }

  private _handleCardDraw(sessionId: string, session: PlayerSession): void {
    if (!session.roomId) {
      session.sendError('Cannot draw: not in a room', 'NOT_IN_ROOM');
      return;
    }
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) {
      session.sendError('Room not found', 'ROOM_NOT_FOUND');
      return;
    }

    const drawnCard = room.drawCard(sessionId);
    const playerIndex = room.getPlayerIndex(sessionId);
    RoomBroadcaster.broadcastCardDrawn(this._sessions, room, drawnCard, playerIndex);
    logger.info('Card drawn & distributed securely', { roomId: room.id, drawerSessionId: sessionId, cardId: drawnCard.id });
  }

  private _handleCardPlay(
    sessionId: string,
    session: PlayerSession,
    payload: { cardId: string; position: Vector3Like; faceUp?: boolean }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    room.playCardToTable(sessionId, payload.cardId, payload.position, payload.faceUp);
    this._broadcastRoomState(room.id);
  }

  private _handleObjectMove(
    sessionId: string,
    session: PlayerSession,
    payload: { objectId: string; position: Vector3Like; rotation: number }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    // M1.7.5 Part 3: rotation sync must respect membership, locks and location
    // the same way a drag does — a card locked by another player (or in the
    // deck/discard, or still in a hand) can never be rotated remotely.
    const existing = room.getObject(payload.objectId);
    if (!existing) {
      session.sendError('Object not found', 'OBJECT_NOT_FOUND', payload.objectId);
      return;
    }
    if (existing.lockedBy !== null && existing.lockedBy !== sessionId) {
      session.sendError('Object is currently locked by another player', 'OBJECT_LOCKED', payload.objectId);
      return;
    }
    if (existing.location !== 'TABLE') {
      session.sendError('Can only rotate objects on the table', 'INVALID_OPERATION', payload.objectId);
      return;
    }

    let movedObj: ReturnType<Room['moveObject']>;
    try {
      movedObj = room.moveObject(payload.objectId, payload.position, payload.rotation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Move failed';
      session.sendError(message, 'INVALID_OPERATION', payload.objectId);
      return;
    }

    this._broadcastToRoom(room.id, sessionId, {
      type: 'object:moved',
      payload: {
        id: movedObj.id,
        position: movedObj.position,
        rotation: movedObj.rotation,
      },
    });
  }

  private _handleObjectFlip(
    _sessionId: string,
    session: PlayerSession,
    payload: { objectId: string }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    const targetObj = room.getObject(payload.objectId);
    if (!targetObj) {
      session.sendError('Object not found', 'OBJECT_NOT_FOUND', payload.objectId);
      return;
    }
    if (targetObj.location === 'DECK' || targetObj.location === 'DISCARD') {
      session.sendError('Cannot flip card in deck', 'INVALID_OPERATION', payload.objectId);
      return;
    }

    const flippedObj = room.flipObject(payload.objectId);
    this._broadcastToRoom(room.id, '', {
      type: 'object:flipped',
      payload: {
        objectId: flippedObj.id,
        faceUp: flippedObj.faceUp,
        cardType: flippedObj.faceUp ? flippedObj.cardType : undefined,
        ownerId: flippedObj.ownerId ?? null,
        location: flippedObj.location,
      },
    });
    this._broadcastRoomState(room.id);
  }

  // ── M1.5.3: cursor:move — broadcast cursor position to other room members ──

  private _handleCursorMove(
    sessionId: string,
    session: PlayerSession,
    payload: { x: number; z: number; seq: number }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    this._broadcastToRoom(room.id, sessionId, {
      type: 'cursor:update',
      payload: {
        playerId: sessionId,
        playerName: session.playerName ?? 'Player',
        x: payload.x,
        z: payload.z,
        seq: payload.seq,
      },
    });
  }

  private _handleDragStart(
    sessionId: string,
    session: PlayerSession,
    payload: { objectId: string; x: number; y: number; z: number; seq?: number }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    const obj = room.getObject(payload.objectId);
    if (obj && (obj.location === 'DECK' || obj.location === 'DISCARD')) {
      session.sendError('Cannot drag card in deck', 'INVALID_OPERATION', payload.objectId);
      return;
    }

    if (!room.dragLock(payload.objectId, sessionId)) {
      session.sendError(
        'Object is currently locked by another player',
        'OBJECT_LOCKED',
        payload.objectId
      );
      return;
    }

    // M1.7.4.2: any room member may drag any card in HAND or TABLE. Hand drags
    // take the server lock but keep transforms private (no raw hand broadcast);
    // drops travel through object:drag-end / card:transfer for authorization.
    if (obj?.location === 'HAND') return;

    this._broadcastToRoom(room.id, sessionId, {
      type: 'object:drag-start',
      payload: { ...payload, playerId: sessionId },
    });
  }

  private _handleDragMove(
    sessionId: string,
    session: PlayerSession,
    payload: { objectId: string; x: number; y: number; z: number; seq: number }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    if (!room.isLockedBy(payload.objectId, sessionId)) return;
    const obj = room.getObject(payload.objectId);
    // M1.7.4: never persist or broadcast raw private hand drag positions.
    if (obj?.location === 'HAND') return;
    if (obj) obj.position = { x: payload.x, y: payload.y, z: payload.z };

    const now = Date.now();
    const last = this._dragMoveTimestamps.get(sessionId) ?? 0;
    if (now - last < DRAG_MOVE_THROTTLE_MS) return;
    this._dragMoveTimestamps.set(sessionId, now);

    this._broadcastToRoom(room.id, sessionId, {
      type: 'object:drag-move',
      payload: { ...payload, playerId: sessionId },
    });
  }

  private _handleCardTransfer(
    sessionId: string,
    session: PlayerSession,
    payload: { cardId: string; targetPlayerIndex?: number; targetPlayerId?: string; handIndex?: number; seq?: number }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    const targetSid = payload.targetPlayerId ??
      (payload.targetPlayerIndex !== undefined ? room.getPlayerByIndex(payload.targetPlayerIndex)?.sessionId : undefined);
    if (!targetSid) {
      session.sendError('Target player not found', 'TARGET_PLAYER_NOT_FOUND', payload.cardId);
      return;
    }

    const cardObj = room.getObject(payload.cardId);
    if (!cardObj) {
      session.sendError('Card not found', 'CARD_NOT_FOUND', payload.cardId);
      return;
    }
    if (cardObj.location === 'DECK' || cardObj.location === 'DISCARD') {
      session.sendError('Cannot transfer card from deck', 'INVALID_OPERATION', payload.cardId);
      return;
    }

    try {
      const fromIdx = cardObj.location === 'HAND' && cardObj.ownerId ? room.getPlayerIndex(cardObj.ownerId) : -1;
      const prevOwner = cardObj.ownerId;
      const card = room.transferCard(sessionId, payload.cardId, targetSid, undefined, payload.handIndex);
      const toIdx = room.getPlayerIndex(targetSid);
      const ownerChanged = card.ownerId !== prevOwner;
      // Single ownership-change path: transfer event + filtered room state.
      if (ownerChanged) {
        this._broadcastHandCardTransferred(room, card, fromIdx, toIdx, payload.seq);
      }
      this._broadcastRoomState(room.id);
    } catch (err) {
      session.sendError(err instanceof Error ? err.message : 'Transfer failed', 'TRANSFER_FAILED', payload.cardId);
    }
  }

  private _handleDragEnd(
    sessionId: string,
    session: PlayerSession,
    payload: {
      objectId: string;
      x: number;
      y: number;
      z: number;
      seq?: number;
      faceUp?: boolean;
      targetPlayerIndex?: number | null;
      handIndex?: number;
      rotation?: number;
    }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    const prevObj = room.getObject(payload.objectId);
    const prevOwner = prevObj?.ownerId ?? null;
    const prevLocation = prevObj?.location;

    if (!prevObj) {
      room.dragUnlock(payload.objectId, sessionId);
      this._broadcastToRoom(room.id, sessionId, {
        type: 'object:drag-end',
        payload: {
          ...payload,
          playerId: sessionId,
          faceUp: payload.faceUp ?? true,
        },
      });
      return;
    }
    if (prevObj.lockedBy !== null && prevObj.lockedBy !== sessionId) {
      session.sendError('Object is currently locked by another player', 'OBJECT_LOCKED', payload.objectId);
      return;
    }
    if (prevObj.location === 'DECK' || prevObj.location === 'DISCARD') {
      session.sendError('Cannot drag card in deck', 'INVALID_OPERATION', payload.objectId);
      return;
    }

    let updated: ReturnType<Room['updateObjectAfterDrag']> | null = null;
    try {
      updated = room.updateObjectAfterDrag(
        payload.objectId, sessionId,
        { x: payload.x, y: payload.y, z: payload.z },
        payload.faceUp, payload.targetPlayerIndex, payload.handIndex,
        payload.rotation
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drag end failed';
      const code = message.includes('locked')
        ? 'OBJECT_LOCKED'
        : 'DRAG_END_FAILED';
      session.sendError(message, code, payload.objectId);
      return;
    }

    if (!updated) {
      session.sendError('Object not found', 'OBJECT_NOT_FOUND', payload.objectId);
      return;
    }

    const locationChanged = prevLocation !== updated.location;
    const ownerChanged = prevOwner !== (updated.ownerId ?? null);
    const sameHandReorder = prevLocation === 'HAND' && updated.location === 'HAND' && prevOwner === updated.ownerId;

    // Ownership transfer: the transfer event is the single authoritative path.
    if (updated.location === 'HAND' && updated.ownerId && ownerChanged) {
      const fromIdx = prevOwner ? room.getPlayerIndex(prevOwner) : -1;
      const toIdx = room.getPlayerIndex(updated.ownerId);
      this._broadcastHandCardTransferred(room, updated, fromIdx, toIdx, payload.seq);
    }

    const needsSync = locationChanged || ownerChanged || sameHandReorder;
    if (needsSync) {
      this._broadcastRoomState(room.id);
    }

    // Never broadcast raw private hand transforms. Hand membership changes are
    // communicated by room:state / hand:card-transferred instead.
    if (updated.location === 'HAND') return;

    const broadcastFaceUp = updated.faceUp ?? payload.faceUp;

    this._broadcastToRoom(room.id, sessionId, {
      type: 'object:drag-end',
      payload: {
        ...payload,
        playerId: sessionId,
        faceUp: broadcastFaceUp,
      },
    });
  }

  private _broadcastHandCardTransferred(
    room: Room,
    card: Parameters<typeof RoomBroadcaster.broadcastHandCardTransferred>[2],
    fromIdx: number,
    toIdx: number,
    seq?: number
  ): void {
    RoomBroadcaster.broadcastHandCardTransferred(this._sessions, room, card, fromIdx, toIdx, seq);
  }

  private _broadcastRoomState(roomId: string): void {
    RoomBroadcaster.broadcastRoomState(this._roomManager, this._sessions, roomId);
  }

  private _broadcastToRoom(roomId: string, excludeSessionId: string, message: Parameters<PlayerSession['sendRaw']>[0]): void {
    RoomBroadcaster.broadcastToRoom(this._roomManager, this._sessions, roomId, excludeSessionId, message);
  }
}
