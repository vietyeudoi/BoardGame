/**
 * MessageDispatcher.ts — Routes incoming WS messages to handlers
 */
import { DEFAULT_TABLE_RADIUS, SHARED_CONFIG } from "../../../shared/constants/config.js";
import type { ClientToServerMessage, CursorMovePayload, DragPreviewFrame, RemoteDragPreviewFrame, Vector3Like } from '../../../shared/types/protocol.js';
import type { RoomManager } from '../room/RoomManager.js';
import type { PlayerSession } from '../player/PlayerSession.js';
import type { Room } from '../room/Room.js';
import { SeatRequests } from '../room/SeatRequests.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';
import { RoomBroadcaster } from './RoomBroadcaster.js';
import { MessageValidator } from '../validation/MessageValidator.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('MessageDispatcher');

/** Minimum interval between object:drag-move messages per client (ms). */
const DRAG_MOVE_THROTTLE_MS = 50;
const PREVIEW_MOVE_THROTTLE_MS = 24;
const TABLE_EDGE_TOLERANCE = 0.015;

function isValidDefaultTableDrop(x: number, y: number, z: number): boolean {
  if (y < 0 || y > 5) return false;
  const sides = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM;
  const inradius = DEFAULT_TABLE_RADIUS * Math.cos(Math.PI / sides);
  for (let side = 0; side < sides; side++) {
    const angle = side * 2 * Math.PI / sides;
    if (x * Math.sin(angle) + z * Math.cos(angle) > inradius + TABLE_EDGE_TOLERANCE) return false;
  }
  return true;
}

export class MessageDispatcher {
  private readonly _seats = new SeatRequests((id, message) => this._sessions.get(id)?.sendRaw(message));
  /** Tracks the last drag-move timestamp per sessionId to enforce throttle. */
  private readonly _dragPreviews = new Map<string, { dragId: number; roomId: string; cards: Set<string>; requestedIds: Map<string, string>; anonymousIds: Map<string, string>; lastMove: number; frame?: RemoteDragPreviewFrame }>();
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

    const room = session.roomId ? this._roomManager.getRoom(session.roomId) : undefined;


    if (msg.type === 'seat:choose' || msg.type === 'seat:reply' || msg.type === 'seat:cancel' || msg.type === 'seat:busy') {
      if (!room) return;
      try {
        const message = this._seats.handle(room, sessionId, msg);
        if (message) {
          this._broadcastRoomState(room.id);
          this._broadcastToRoom(room.id, '', { type: 'seat:changed', payload: { message } });
        }
      } catch (error) {
        session.sendError(error instanceof Error ? error.message : 'Không thể đổi ghế.', 'SEAT_UNAVAILABLE');
      }
      return;
    }
    if (msg.type === 'object:drag-start' || (msg.type === 'object:drag-preview' && msg.payload.phase === 'start')) {
      this._seats.cancelFor(sessionId, 'Yêu cầu đổi ghế đã hủy vì người chơi đang kéo bài.');
    }
    const deckView = room?.deckView;
    const requiresUnlockedDeck = msg.type === 'card:draw' || msg.type === 'deck:take'
      || msg.type === 'deck:insert' || msg.type === 'deck:shuffle' || msg.type === 'deck:gather-bombs'
      || msg.type === 'deck:set-affected-count' || msg.type === 'deck:view-open';
    if (deckView && requiresUnlockedDeck) {
      const message = deckView.viewerName + (deckView.mode === 'alter' ? ' đang xếp bài.' : ' đang xem bài.');
      if (msg.type === 'deck:insert') {
        for (const id of msg.payload.cardIds) session.sendError(message, 'DRAG_END_FAILED', id);
      } else session.sendError(message, 'DECK_LOCKED');
      return;
    }
    const cardAction = /^(card|deck|object):/.test(msg.type) && msg.type !== 'object:drag-preview-stop';
    if (room?.phase && cardAction) {

      const flipTarget = msg.type === 'object:flip' ? room.getObject(msg.payload.objectId) : undefined;
      const canSpectatorFlip = flipTarget?.location === 'TABLE' && flipTarget.takenFromDeck;
      if (room.phase === 'SETUP' || (room.getPlayer(sessionId)?.spectator && !canSpectatorFlip)) {
        session.sendError('Thao tác bài chỉ dành cho người đang chơi sau khi chia.', 'ROUND_ACTION_FORBIDDEN');
        return;
      }
      if ('payload' in msg && msg.payload) {
        const id = 'objectId' in msg.payload ? msg.payload.objectId : 'cardId' in msg.payload ? msg.payload.cardId : undefined;
        if (id && !room.getInteractableObject(id, sessionId)) {
          session.sendError('Không thể thao tác lá bài này.', msg.type === 'object:flip' ? 'FLIP_REJECTED' : 'CARD_NOT_FOUND', id);
          return;
        }
      }
    }
    if (room?.phase && (msg.type === 'room:create' || msg.type === 'room:join')) {
      session.sendError('Hãy rời phòng hiện tại trước khi vào phòng khác.', 'ALREADY_IN_ROOM');
      return;
    }
    switch (msg.type) {
      case 'room:create':
        this._handleRoomCreate(sessionId, session, msg.payload);
        break;
      case 'room:join':
        this._handleRoomJoin(sessionId, session, msg.payload);
        break;

      case 'room:resume':
        this._handleRoomResume(session, msg.payload);
        break;
      case 'room:leave':
        this._handleRoomLeave(sessionId, session);
        break;


      case 'round:configure':
      case 'round:deal':
      case 'round:reset':
        this._handleRoundAction(room, session, msg);
        break;


      case 'deck:view-open':
      case 'deck:view-order':
      case 'deck:view-close':
        this._handleDeckView(room, session, msg);
        break;
      case 'table:roll': {
        if (!room) {
          session.sendError('Hãy vào bàn trước khi tung.', 'TABLE_ROLL_UNAVAILABLE');
          return;
        }
        try {
          const roll = room.rollTableItem(sessionId, msg.payload.kind);
          this._broadcastToRoom(room.id, '', { type: 'table:rolled', payload: { roll, sentAt: Date.now() } });
        } catch (error) {
          session.sendError(error instanceof Error ? error.message : 'Không thể tung.', 'TABLE_ROLL_UNAVAILABLE');
        }
        return;
      }
      case 'hand:shuffle':
      case 'stack:shuffle':
      case 'stack:form':
        this._handleTableShuffle(room, session, msg);
        break;
      case 'deck:insert':
      case 'deck:shuffle':
      case 'deck:gather-bombs':
      case 'deck:set-affected-count':
        this._handleDeckMutation(session, room, msg);
        break;
      case 'deck:set-draw-end':
      case 'deck:take':
        this._handleDeckAction(sessionId, session, msg);
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
      case 'draw:hover': {
        const room = session.roomId ? this._roomManager.getRoom(session.roomId) : undefined;
        if (room?.setDrawHover(sessionId, msg.payload.hovering)) {
          this._broadcastToRoom(room.id, sessionId, {
            type: 'draw:hovered',
            payload: { playerId: sessionId, playerName: room.getPlayer(sessionId)!.name, hovering: msg.payload.hovering },
          });
        }
        break;
      }
      case 'cursor:move':
        this._handleCursorMove(sessionId, session, msg.payload);
        break;
      case 'object:drag-preview':
        this._handleDragPreview(sessionId, session, msg.payload);
        break;
      case 'object:drag-preview-stop':
        this._stopDragPreview(sessionId, msg.payload.dragId);
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
    this._stopDragPreview(sessionId);
    session.roomId = room.id;
    const playerIndex = room.getPlayerIndex(sessionId);
    session.sendRaw({ type: 'room:joined', payload: { roomId: room.id, playerId: sessionId, playerIndex, resumeToken: room.getPlayer(sessionId)?.resumeToken } });
    session.sendRaw({ type: 'room:state', payload: ViewStateBuilder.buildRoomState(room, sessionId) });
    if (room.deckView) this._sendDeckView(room, sessionId);
    const now = Date.now();
    for (const roll of room.tableRolls.inProgress(now)) {
      session.sendRaw({ type: 'table:rolled', payload: { roll, sentAt: now } });
    }
    for (const preview of this._dragPreviews.values()) {
      if (preview.roomId === room.id && preview.frame && preview.frame.playerId !== sessionId) {

        const cards = room.phase ? preview.frame.cards.filter(card => {
          const location = room.getObject(card.objectId)?.location;
          return location !== 'DECK' && location !== 'HAND';
        }) : preview.frame.cards;
        if (cards.length) session.sendRaw({ type: 'object:drag-preview', payload: { ...preview.frame, cards, phase: 'start' } });
      }
    }
    for (const player of room.getDrawHoverPlayers()) {
      session.sendRaw({ type: 'draw:hovered', payload: { playerId: player.id, playerName: player.name, hovering: true } });
    }
    return playerIndex;
  }

  private _handleRoomCreate(
    sessionId: string,
    session: PlayerSession,
    payload: Extract<ClientToServerMessage, { type: 'room:create' }>['payload']
  ): void {
    session.playerName = payload.playerName ?? session.playerName ?? 'Player';
    const room = this._roomManager.createRoom({
      name: payload.roomName,
      hostSessionId: sessionId,
      hostName: session.playerName,
      password: payload.password,
      doubleDeck: payload.doubleDeck,
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
    const newPlayer = { id: sessionId, name: payload.playerName, isHost: false, isConnected: true, playerIndex,
      spectator: room.getPlayer(sessionId)?.spectator };
    this._broadcastToRoom(room.id, sessionId, { type: 'room:player-joined', payload: newPlayer });
    if (room.phase === 'SETUP') this._broadcastToRoom(room.id, sessionId, { type: 'round:configured', payload: room.round! });
    logger.info('Player joined room', { sessionId, roomId: room.id, playerIndex });
  }


  private _handleRoomResume(session: PlayerSession, { roomId, playerId, token }: { roomId: string; playerId: string; token: string }): void {

    const previous = this._sessions.get(playerId);
    const player = this._roomManager.getRoom(roomId)?.getPlayer(playerId);
    if (!session.roomId && player?.resumeToken === token && previous?.roomId === roomId) {
      // Mạng có thể đứt mà socket cũ chưa báo đóng. Chỉ mã hợp lệ mới thay được socket đó.
      this.handleDisconnect(playerId);
      this._sessions.delete(playerId);
      previous.terminate();
    }
    const room = !session.roomId && !this._sessions.has(playerId)
      ? this._roomManager.resumeRoom(roomId, playerId, token)
      : undefined;
    if (!room) {
      session.sendError('Không thể kết nối lại phòng. Hãy trở về sảnh để vào phòng.', 'ROOM_RESUME_FAILED');
      return;
    }
    // Gắn socket mới với ghế cũ để giữ quyền xem bài và trạng thái phòng.
    this._sessions.delete(session.sessionId);
    session.sessionId = playerId;
    this._sessions.set(playerId, session);
    this._enterRoom(session, room, playerId);
    this._broadcastRoomState(room.id);
  }

  public handleDisconnect(sessionId: string, intentional = false): void {
    this._seats.disconnect(sessionId);
    const session = this._sessions.get(sessionId);
    if (!session || !session.roomId) return;
    const roomId = session.roomId;
    this._stopDragPreview(sessionId);
    const room = this._roomManager.getRoom(roomId);
    if (room) {
      if (room.deckView?.viewerId === sessionId) {
        room.closeDeckView();
        this._broadcastDeckView(room);
      }
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
            faceUp: obj?.privateViewerId ? undefined : obj?.faceUp,
          },
        });
      });
    }
    this._roomManager.handlePlayerDisconnect(roomId, sessionId, intentional);
    this._broadcastToRoom(roomId, sessionId, { type: 'room:player-left', payload: { playerId: sessionId } });
    if (room?.phase) this._broadcastRoomState(room.id);
    session.roomId = null;
    this._dragMoveTimestamps.delete(sessionId);
    logger.info('Player left / disconnected', { sessionId, roomId });
  }

  private _handleRoomLeave(sessionId: string, _session: PlayerSession): void {
    this.handleDisconnect(sessionId, true);
  }



  private _handleRoundAction(
    room: Room | undefined,
    session: PlayerSession,
    msg: Extract<ClientToServerMessage, { type: 'round:configure' | 'round:deal' | 'round:reset' }>,
  ): void {
    if (!room?.isHost(session.sessionId)) {
      session.sendError('Chỉ chủ phòng được thiết lập, chia bài hoặc làm lại ván.', 'ROUND_HOST_REQUIRED');
      return;
    }
    try {
      if (msg.type === 'round:configure') {
        room.configureRound(msg.payload);
        this._broadcastToRoom(room.id, '', { type: 'round:configured', payload: room.round! });
        return;
      }
      if (msg.type === 'round:deal') {
        room.dealRound();
        for (const id of room.getConnectedSessionIds()) this._seats.cancelFor(id, 'Yêu cầu đổi ghế đã hủy vì đang chia bài.');
      } else {
        const hadView = Boolean(room.deckView);
        room.resetRound();
        if (hadView) this._broadcastDeckView(room);
        for (const [id, preview] of this._dragPreviews) {
          if (preview.roomId === room.id) this._stopDragPreview(id);
        }
      }
      this._broadcastRoomState(room.id);
    } catch (error) {
      session.sendError(error instanceof Error ? error.message : 'Thao tác ván thất bại.', 'ROUND_INVALID');
    }
  }



  private _sendDeckView(room: Room, sessionId: string): void {
    this._sessions.get(sessionId)?.sendRaw({
      type: 'deck:view-state', payload: room.deckView?.viewFor(sessionId) ?? null,
    });
  }

  private _broadcastDeckView(room: Room): void {
    for (const sessionId of room.getConnectedSessionIds()) this._sendDeckView(room, sessionId);
  }

  private _handleDeckView(
    room: Room | undefined,
    session: PlayerSession,
    msg: Extract<ClientToServerMessage, { type: 'deck:view-open' | 'deck:view-order' | 'deck:view-close' }>,
  ): void {
    if (!room) return;
    const viewerId = session.sessionId;
    if (msg.type === 'deck:view-open') {
      if (room.openDeckView(viewerId, msg.payload.mode)) {
        this._seats.cancelFor(viewerId, 'Yêu cầu đổi ghế đã hủy vì người chơi đang xem chồng.');
        this._broadcastDeckView(room);
      }
      else session.sendError('Không có lá để mở phiên xem.', 'DECK_VIEW_UNAVAILABLE');
      return;
    }
    const view = room.deckView;
    if (!view || view.id !== msg.payload.id || view.viewerId !== viewerId) {
      session.sendError('Phiên xem không thuộc về bạn hoặc đã đóng.', 'DECK_VIEW_INVALID');
      return;
    }
    if (msg.payload.order !== undefined) {
      if (!view.setOrder(msg.payload.order)) {
        session.sendError('Thứ tự phải chứa đúng các lá đã mở.', 'DECK_VIEW_INVALID');
        return;
      }
      this._broadcastDeckView(room);
      if (msg.type === 'deck:view-order') return;
      room.commitDeckView();
      const deck = room.getPublicDeckState();
      this._broadcastToRoom(room.id, '', { type: 'deck:count', payload: { count: deck.count, deck } });
    }
    room.closeDeckView();
    this._broadcastDeckView(room);
  }


  private _handleTableShuffle(
    room: Room | undefined, session: PlayerSession,
    msg: Extract<ClientToServerMessage, { type: 'hand:shuffle' | 'stack:shuffle' | 'stack:form' }>,
  ): void {
    const playerId = session.sessionId;
    if (!room?.canShuffle(playerId)) {
      session.sendError('Chỉ người đang chơi mới được thao tác.', 'SHUFFLE_FORBIDDEN');
      return;
    }
    const playerName = room.getPlayer(playerId)!.name;
    try {
      if (msg.type === 'hand:shuffle') {
        if (!room.shuffleHand(playerId)) return;
        this._broadcastRoomState(room.id);
        this._broadcastToRoom(room.id, '', { type: 'hand:shuffled', payload: { playerId, playerName, placedIds: [] } });
      } else if (msg.type === 'stack:form') {
        room.formTablePile(msg.payload.cardIds);
        this._broadcastRoomState(room.id);
        this._broadcastToRoom(room.id, '', { type: 'stack:formed', payload: { anchorId: msg.payload.cardIds[0]! } });
      } else {
        const { anchorId } = msg.payload;
        if (!room.shuffleTablePile(anchorId)) {
          session.sendError('Chồng cần ít nhất hai lá để xáo.', 'SHUFFLE_UNAVAILABLE');
          return;
        }
        this._broadcastRoomState(room.id);
        this._broadcastToRoom(room.id, '', { type: 'stack:shuffled', payload: { anchorId, playerName } });
      }
    } catch (error) {
      session.sendError(error instanceof Error ? error.message : 'Không thể xáo bài.', 'SHUFFLE_UNAVAILABLE');
    }
  }

  private _handleDeckMutation(
    session: PlayerSession,
    room: Room | undefined,
    msg: Extract<ClientToServerMessage, { type: 'deck:insert' | 'deck:shuffle' | 'deck:set-affected-count' | 'deck:gather-bombs' }>,
  ): void {
    const id = session.sessionId;
    const player = room?.getPlayer(id);
    if (!room?.canShuffle(id) || !player) return;


    if (msg.type === 'deck:gather-bombs') {
      try {
        const anchor = room.gatherDeckBombs(id);
        if (!anchor) {
          session.sendRaw({ type: 'deck:gather-empty', payload: { message: 'Chồng bốc không có bom thường.' } });
          return;
        }
        this._broadcastRoomState(room.id);
        this._broadcastToRoom(room.id, '', { type: 'stack:formed', payload: { anchorId: anchor.id, gatheredBy: player.name } });
      } catch (error) {
        session.sendError(error instanceof Error ? error.message : 'Không thể gom bom.', 'GATHER_UNAVAILABLE');
      }
      return;
    }

    if (msg.type === 'deck:shuffle') {
      if (room.shuffleDeck()) this._broadcastToRoom(room.id, '', {
        type: 'deck:shuffled', payload: { deck: room.getPublicDeckState(), playerName: player.name },
      });
      return;
    }
    if (msg.type === 'deck:set-affected-count') {
      room.setDeckAffectedCount(msg.payload.count);
      const deck = room.getPublicDeckState();
      this._broadcastToRoom(room.id, '', { type: 'deck:count', payload: { count: deck.count, deck } });
      return;
    }

    const { cardIds, cardsAbove, dragId } = msg.payload;
    const active = this._dragPreviews.get(id);
    const validDrag = dragId === undefined || (active?.dragId === dragId && cardIds.every(cardId =>
      active.requestedIds.has(cardId) && room.isLockedBy(active.requestedIds.get(cardId)!, id)));
    if (!validDrag || !room.insertDeckCards(id, cardIds, cardsAbove)) {
      for (const cardId of cardIds) session.sendError('Không thể chèn nhóm bài này.', 'DRAG_END_FAILED', cardId);
      return;
    }

    // Xóa bản xem trước cũ để người mới vào phòng không nhận ID lá đã chèn.
    this._stopDragPreview(id);
    this._broadcastToRoom(room.id, '', { type: 'deck:inserted', payload: { count: cardIds.length } });
    this._broadcastRoomState(room.id);
  }

  private _handleDeckAction(
    sessionId: string,
    session: PlayerSession,
    msg: Extract<ClientToServerMessage, { type: 'deck:set-draw-end' | 'deck:take' }>,
  ): void {
    const room = session.roomId ? this._roomManager.getRoom(session.roomId) : undefined;
    if (!room?.getPlayer(sessionId)?.isConnected) {
      session.sendError('Bạn chưa vào phòng.', 'NOT_IN_ROOM');
      return;
    }
    if (msg.type === 'deck:set-draw-end') {
      room.setDeckDrawEnd(msg.payload.end);
      this._broadcastRoomState(room.id);
      return;
    }
    const card = room.takeDeckCard(sessionId, msg.payload?.cardsAbove);
    if (!card) {
      if (room.hasCardsInDeck()) {
        session.sendError('Vị trí đã chọn không còn trong chồng bài.', 'DECK_POSITION_INVALID');
      } else {
        session.sendError('Chồng bài đã hết.', 'DECK_EMPTY');
      }
      return;
    }
    this._broadcastToRoom(room.id, '', {
      type: 'deck:card-taken',
      payload: { card: ViewStateBuilder.filterObjectForClient(card), ...(room.phase ? { deckCount: room.getDeckCount(), deck: room.getPublicDeckState() } : {}) },
    });
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

    if (!room.hasCardsInDeck()) return;
    const drawnCard = room.drawCard(sessionId);
    const playerIndex = room.getPlayerIndex(sessionId);
    RoomBroadcaster.broadcastCardDrawn(this._sessions, room, drawnCard, playerIndex);
    if (room.phase) this._broadcastToRoom(room.id, '', { type: 'deck:count', payload: {
      count: room.getDeckCount(), ownerId: sessionId, handCount: room.getHandCount(sessionId), handSlots: room.getHandSlots(sessionId), deck: room.getPublicDeckState(),
    } });
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

    const card = room.getInteractableObject(payload.cardId, sessionId);
    if (!card) return;
    const faceUp = room.phase && card.ownerId !== sessionId ? false : payload.faceUp;
    room.playCardToTable(sessionId, card.id, payload.position, faceUp);
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
    sessionId: string,
    session: PlayerSession,
    payload: { objectId: string }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    const targetObj = room.getInteractableObject(payload.objectId, sessionId);
    if (!targetObj) {
      session.sendError('Object not found', 'OBJECT_NOT_FOUND', payload.objectId);
      return;
    }
    if (targetObj.location === 'DECK' || targetObj.location === 'DISCARD') {
      session.sendError('Cannot flip card in deck', 'INVALID_OPERATION', payload.objectId);
      return;
    }


    if (targetObj.privateViewerId && targetObj.privateViewerId !== sessionId) {
      session.sendError('Chỉ người lấy lá này mới được lật bài.', 'FLIP_REJECTED', payload.objectId);
      return;
    }

    if (targetObj.lockedBy && targetObj.lockedBy !== sessionId) {
      session.sendError("Card locked by another player", "FLIP_REJECTED", payload.objectId);
      return;
    }
    const flippedObj = room.flipObject(targetObj.id);

    const flipMessage = {
      type: 'object:flipped' as const,
      payload: {
        objectId: flippedObj.id,
        faceUp: flippedObj.faceUp,
        cardType: flippedObj.faceUp ? flippedObj.cardType : undefined,
        faceImage: flippedObj.faceUp ? flippedObj.faceImage : undefined,
        ownerId: flippedObj.ownerId ?? null,

        location: flippedObj.location,
      },
    };
    if (room.phase && flippedObj.location === 'HAND' && flippedObj.ownerId) {
      this._sessions.get(flippedObj.ownerId)?.sendRaw(flipMessage);
    } else if (flippedObj.privateViewerId) session.sendRaw(flipMessage);
    else this._broadcastToRoom(room.id, '', flipMessage);
    this._broadcastRoomState(room.id);
  }

  // ── M1.5.3: cursor:move — broadcast cursor position to other room members ──

  private _handleCursorMove(
    sessionId: string,
    session: PlayerSession,
    payload: CursorMovePayload
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
        y: payload.y,
        z: payload.z,
        seq: payload.seq,
      },
    });
  }

  private _handleDragPreview(sessionId: string, session: PlayerSession, frame: DragPreviewFrame): void {
    const room = session.roomId ? this._roomManager.getRoom(session.roomId) : undefined;
    const player = room?.getPlayer(sessionId);
    if (!room || !player?.isConnected) return;
    const ids = new Set(frame.cards.map(card => card.objectId));
    if (ids.size !== frame.cards.length) return;

    if (frame.phase === "start") {
      if (this._dragPreviews.has(sessionId)) return;

      // Ánh xạ mã do người kéo gửi sang ID thật trước khi khóa cả nhóm.
      const requestedIds = new Map<string, string>();
      const cards = new Set<string>();
      const anonymousIds = new Map<string, string>();
      for (const id of ids) {
        const card = room.getInteractableObject(id, sessionId);
        if (!card || card.type !== 'card' || card.location === 'DECK' || cards.has(card.id) ||
          (card.lockedBy && card.lockedBy !== sessionId)) {
          session.sendError('Lá bài đang bận hoặc không còn trên tay.', 'OBJECT_LOCKED', frame.cards[0]!.objectId);
          return;
        }
        cards.add(card.id);
        requestedIds.set(id, card.id);
        const alias = room.phase ? room.getHandAlias(card) : undefined;
        if (alias) anonymousIds.set(card.id, alias);
      }
      for (const id of cards) room.dragLock(id, sessionId);
      this._dragPreviews.set(sessionId, { dragId: frame.dragId, roomId: room.id, cards, requestedIds, anonymousIds, lastMove: 0 });
    } else {
      const active = this._dragPreviews.get(sessionId);
      if (!active || active.dragId !== frame.dragId || [...ids].some(id => !active.requestedIds.has(id) || !room.isLockedBy(active.requestedIds.get(id)!, sessionId))) return;
      const now = Date.now();
      if (now - active.lastMove < PREVIEW_MOVE_THROTTLE_MS) return;
      active.lastMove = now;
    }

    // Chỉ trình diễn, không ghi tọa độ nhấc bài vào trạng thái phòng.
    const active = this._dragPreviews.get(sessionId)!;
    const preview: RemoteDragPreviewFrame = {
        dragId: frame.dragId, phase: frame.phase, playerId: sessionId,
        playerName: player.name, playerIndex: room.getPlayerIndex(sessionId),

        cards: frame.cards.map(({ objectId, x, y, z, rotation }) => {
          const actualId = active.requestedIds.get(objectId)!;
          const anonymousId = active.anonymousIds.get(actualId);
          if (anonymousId) return { objectId: anonymousId, x, y, z, rotation, faceUp: false, masked: true };
          const card = room.getObject(actualId);
          const faceUp = card?.location !== "HAND" && !card?.privateViewerId && card?.faceUp === true;
          return { objectId: actualId, x, y, z, rotation, faceUp, masked: !faceUp };
        }),
    };
    if (preview.cards.length === 0) return;
    active.frame = preview;
    this._broadcastToRoom(room.id, sessionId, { type: "object:drag-preview", payload: preview });
  }

  private _stopDragPreview(sessionId: string, dragId?: number): void {
    const active = this._dragPreviews.get(sessionId);
    if (!active || (dragId !== undefined && active.dragId !== dragId)) return;
    this._dragPreviews.delete(sessionId);
    const room = this._roomManager.getRoom(active.roomId);
    if (!room) return;
    for (const id of active.cards) room.dragUnlock(id, sessionId);
    this._broadcastToRoom(room.id, sessionId, {
      type: "object:drag-preview-stop", payload: { playerId: sessionId, dragId: active.dragId },
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
    payload: { cardId: string; targetPlayerIndex?: number; targetPlayerId?: string; handIndex?: number; seq?: number; dragId?: number }
  ): void {
    if (!session.roomId) return;
    const room = this._roomManager.getRoom(session.roomId);
    if (!room) return;

    const active = this._dragPreviews.get(sessionId);
    const cardObj = room.getInteractableObject(payload.cardId, sessionId);
    if (payload.dragId !== undefined && (active?.dragId !== payload.dragId ||
      !cardObj || active.requestedIds.get(payload.cardId) !== cardObj.id || !room.isLockedBy(cardObj.id, sessionId))) {
      session.sendError("Drag lock not granted", "OBJECT_LOCKED", payload.cardId);
      return;
    }
    const targetSid = payload.targetPlayerId ??
      (payload.targetPlayerIndex !== undefined ? room.getPlayerByIndex(payload.targetPlayerIndex)?.sessionId : undefined);
    if (!targetSid) {
      session.sendError('Target player not found', 'TARGET_PLAYER_NOT_FOUND', payload.cardId);
      return;
    }

    if (!cardObj) {
      session.sendError('Card not found', 'CARD_NOT_FOUND', payload.cardId);
      return;
    }
    if (cardObj.location === 'DECK' || (cardObj.location === 'DISCARD' && payload.dragId === undefined)) {
      session.sendError('Cannot transfer card from deck', 'INVALID_OPERATION', payload.cardId);
      return;
    }

    try {
      const fromIdx = cardObj.location === 'HAND' && cardObj.ownerId ? room.getPlayerIndex(cardObj.ownerId) : -1;
      const prevOwner = cardObj.ownerId;
      const card = room.transferCard(sessionId, cardObj.id, targetSid, undefined, payload.handIndex);
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
      dragId?: number;
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


    const prevObj = room.getInteractableObject(payload.objectId, sessionId);
    if (payload.dragId !== undefined) {
      const active = this._dragPreviews.get(sessionId);
      if (active?.dragId !== payload.dragId || !prevObj ||
        active.requestedIds.get(payload.objectId) !== prevObj.id || !room.isLockedBy(prevObj.id, sessionId)) {
        session.sendError("Drag lock not granted", "OBJECT_LOCKED", payload.objectId);
        return;
      }
      if (payload.targetPlayerIndex == null && !isValidDefaultTableDrop(payload.x, payload.y, payload.z)) {
        this._stopDragPreview(sessionId, payload.dragId);
        session.sendError("Drop is outside the table", "DRAG_END_FAILED", payload.objectId);
        return;
      }
    }
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
    if (prevObj.location === 'DECK' || (prevObj.location === 'DISCARD' && payload.dragId === undefined)) {
      session.sendError('Cannot drag card in deck', 'INVALID_OPERATION', payload.objectId);
      return;
    }

    let updated: ReturnType<Room['updateObjectAfterDrag']> | null = null;
    try {
      updated = room.updateObjectAfterDrag(
        prevObj.id, sessionId,
        { x: payload.x, y: payload.y, z: payload.z },
        room.phase && prevObj.location === 'HAND' && prevOwner !== sessionId && payload.targetPlayerIndex == null
          ? false : (prevObj.privateViewerId || (payload.dragId !== undefined && prevObj.location === 'HAND'))
            ? prevObj.faceUp : payload.faceUp,
        payload.targetPlayerIndex, payload.handIndex,
        payload.rotation
      );
    } catch (err) {
      if (payload.dragId !== undefined) this._stopDragPreview(sessionId, payload.dragId);
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

    // Với bài riêng, chỉ đồng bộ vị trí; từng máy giữ mặt bài theo quyền xem.
    const broadcastFaceUp = updated.privateViewerId ? undefined : updated.faceUp ?? payload.faceUp;

    const dropMessage = {
      type: "object:drag-end" as const,
      payload: {
        ...payload,
        objectId: updated.id,
        x: updated.position.x, y: updated.position.y, z: updated.position.z,
        playerId: sessionId,
        faceUp: broadcastFaceUp,
      },
    };

    this._broadcastToRoom(room.id, sessionId, dropMessage);
    if (payload.dragId !== undefined) session.sendRaw(dropMessage);
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
