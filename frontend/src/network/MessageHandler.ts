/**
 * MessageHandler.ts — Dispatches incoming server messages to appropriate handlers
 */
import type { TableRollEvent } from '@shared/types/tableRoll';
import type { DeckViewState, DrawHoverUpdatePayload, ServerToClientMessage } from '@shared/types/protocol';
import type { DeckDrawEnd, SandboxObject } from '@shared/types/room';
import type { ClientStore } from '../store/ClientStore';
import type { SceneManager } from '../scene/SceneManager';
import type { RemoteCursorManager } from '../scene/RemoteCursorManager';
import { Logger } from '../utils/Logger';

const logger = Logger.create('MessageHandler');

export class MessageHandler {
  public onDrawHoverChanged: ((payload: DrawHoverUpdatePayload) => void) | null = null;
  public onFlipConfirmed?: (cardId: string) => void;
  public onCardDrawn: ((card: SandboxObject, playerIndex: number, end?: DeckDrawEnd) => void) | null = null;
  public onCardTransferred: ((payload: { cardId: string; fromPlayerIndex: number; toPlayerIndex: number; card: SandboxObject; seq?: number }) => void) | null = null;
  onTableRolled?: (event: TableRollEvent) => void;
  public onDeckView?: (state: DeckViewState | null) => void;
  onHandShuffled?: (payload: Extract<ServerToClientMessage, { type: 'hand:shuffled' }>['payload']) => void;

  onSeatRequest?: (request: import('@shared/types/protocol').SeatRequest) => void;
  onSeatResult?: (id: string, message: string) => void;
  onSeatChanged?: (message: string) => void;
  onStackFormed?: (payload: Extract<ServerToClientMessage, { type: 'stack:formed' }>['payload']) => void;
  onGatherEmpty?: (message: string) => void;
  onStackShuffled?: (payload: Extract<ServerToClientMessage, { type: 'stack:shuffled' }>['payload']) => void;
  public onDeckNotice?: (message: string) => void;
  public onDeckShuffled?: (playerName: string) => void;
  public onError: ((message: string) => void) | null = null;
  /** M1.7.4: server rejection tied to an object, used to restore optimistic UI. */
  public onRejection: ((objectId: string, code?: string) => void) | null = null;

  /** Optional reference to RemoteCursorManager for cursor:update routing (M1.5.3). */
  public remoteCursorManager: RemoteCursorManager | null = null;

  constructor(
    private readonly _store: ClientStore,
    private readonly _sceneManager: SceneManager
  ) {}

  handle(msg: ServerToClientMessage): void {
    logger.debug('Received message', { type: msg.type });
    switch (msg.type) {

      case 'round:configured':
        this._store.updateRound(msg.payload);
        break;

      case 'table:rolled':
        this.onTableRolled?.(msg.payload);
        break;
      case 'deck:view-state':
        this.onDeckView?.(msg.payload);
        break;
      case 'hand:shuffled':
        this.onHandShuffled?.(msg.payload);
        break;
      case 'deck:gather-empty':
        this.onGatherEmpty?.(msg.payload.message);
        break;
      case 'stack:formed':
        this.onStackFormed?.(msg.payload);
        break;
      case 'stack:shuffled':
        this.onStackShuffled?.(msg.payload);
        break;
      case 'deck:shuffled':
        this._store.updateDeckCount(msg.payload.deck.count, undefined, undefined, msg.payload.deck);
        this._sceneManager.animateDeckShuffle();
        this.onDeckShuffled?.(msg.payload.playerName);
        break;
      case 'deck:inserted':
        this._sceneManager.animateDeckInsertion(msg.payload.count);
        if (msg.payload.playerName) this.onDeckNotice?.(msg.payload.playerName + ' vừa bỏ ' + msg.payload.count + ' lá vào chồng bài');
        break;
      case 'discard:taken': {
        const { cardIds, playerName, mode } = msg.payload;
        this._sceneManager.animateDiscardTake(cardIds);
        if (mode) this.onDeckNotice?.(playerName + (mode === 'all'
          ? ' vừa lấy cả chồng bỏ ra bàn' : ' vừa lấy lá trên cùng của chồng bỏ ra bàn'));
        break;
      }
      case 'deck:draw-notice': {
        const { playerName, count, end } = msg.payload;
        const source = end === 'BOTTOM' ? 'đáy chồng bài' : end === 'TOP' ? 'đỉnh chồng bài' : 'chồng bài';
        this.onDeckNotice?.(playerName + ' vừa rút ' + count + ' lá từ ' + source);
        break;
      }
      case 'deck:count': {
        const { count, ownerId, handCount, deck, handSlots, drawEnd } = msg.payload;
        const remoteDraw = drawEnd && ownerId !== this._store.getPlayerId() ? handSlots?.at(-1) : undefined;
        const start = remoteDraw ? this._sceneManager.getDeckFlightStart(drawEnd) : undefined;
        this._store.updateDeckCount(count, ownerId, handCount, deck, handSlots);
        if (remoteDraw && start) this._sceneManager.animateDeckTake(remoteDraw, start);
        break;
      }

      case 'seat:request':
        this.onSeatRequest?.(msg.payload);
        break;
      case 'seat:result':
        this.onSeatResult?.(msg.payload.id, msg.payload.message);
        break;
      case 'seat:changed':
        this.onSeatChanged?.(msg.payload.message);
        break;
      case 'room:state':
        this._store.updateRoomState(msg.payload);
        break;
      case 'room:joined':
        this._store.setRoomId(msg.payload.roomId);
        this._store.setPlayerId(msg.payload.playerId);
        this._store.setPlayerIndex(msg.payload.playerIndex ?? 0);
        logger.info('Joined room', {
          roomId: msg.payload.roomId,
          playerId: msg.payload.playerId,
          playerIndex: msg.payload.playerIndex,
        });
        break;
      case 'room:player-joined':
        this._store.addPlayer(msg.payload);
        break;
      case 'room:player-left':
        // Server vẫn giữ ghế và bài tay của người đã ngắt kết nối.
        this._store.markPlayerDisconnected(msg.payload.playerId);
        // Remove the departing player's cursor (M1.5.3)
        this.remoteCursorManager?.removeCursor(msg.payload.playerId);
        this._sceneManager.remoteDragPreview?.stop(msg.payload.playerId);
        this.onDrawHoverChanged?.({ playerId: msg.payload.playerId, playerName: "", hovering: false });
        break;
      case 'deck:card-taken': {
        const start = this._sceneManager.getDeckFlightStart(msg.payload.end);
        this._store.addOrUpdateObject(msg.payload.card, msg.payload.deckCount, msg.payload.deck);
        this._sceneManager.animateDeckTake(msg.payload.card.id, start);
        break;
      }
      case 'hand:card-drawn':
        this._store.addOrUpdateObject(msg.payload.card);
        this.onCardDrawn?.(msg.payload.card, msg.payload.playerIndex, msg.payload.end);
        break;
      case 'hand:card-transferred':
        this._store.addOrUpdateObject(msg.payload.card);
        this.onCardTransferred?.(msg.payload);
        break;
      case 'object:moved':
        // M1.7.5 Part 3: mirror the authoritative rotation/position into the
        // 3D scene FIRST (skipped for the locally dragged card by SceneManager).
        // Scene application must not depend on the store notify completing:
        // a throwing store subscriber (e.g. a stale registry divergence) would
        // otherwise abort this handler before the rotation ever reaches 3D.
        this._sceneManager.onRemoteObjectMoved?.(
          msg.payload.id,
          { x: msg.payload.position.x, y: msg.payload.position.y, z: msg.payload.position.z },
          msg.payload.rotation
        );
        this._sceneManager.requestRender();
        this._store.updateObjectPosition(msg.payload);
        break;

      // ── M1.5.3: Remote cursor & drag sync ──────────────────────────────
      case 'draw:hovered':
        if (msg.payload.hovering) this.remoteCursorManager?.removeCursor(msg.payload.playerId);
        this.onDrawHoverChanged?.(msg.payload);
        break;
      case 'cursor:update':
        this.remoteCursorManager?.updateCursor(msg.payload);
        break;
      case 'object:drag-preview':
        this._sceneManager.remoteDragPreview?.update(msg.payload);
        break;
      case 'object:drag-preview-stop':
        this._sceneManager.remoteDragPreview?.stop(msg.payload.playerId, msg.payload.dragId);
        break;
      case 'object:drag-start':
        this._sceneManager.onRemoteDragStart?.(
          msg.payload.objectId,
          { x: msg.payload.x, y: msg.payload.y, z: msg.payload.z }
        );
        break;
      case 'object:drag-move':
        this._sceneManager.onRemoteDragMove?.(
          msg.payload.objectId,
          { x: msg.payload.x, y: msg.payload.y, z: msg.payload.z },
          msg.payload.seq
        );
        break;

      case 'object:drag-end': {
        const room = this._store.getRoomState();
        const object = room?.objects.find(item => item.id === msg.payload.objectId);
        const authoritativeTable = Boolean(room?.round && object?.location === 'TABLE');
        if (msg.payload.playerId !== this._store.getPlayerId()) this._sceneManager.onRemoteDragEnd?.(
          msg.payload.objectId,
          { x: msg.payload.x, y: msg.payload.y, z: msg.payload.z },
          msg.payload.faceUp,
          msg.payload.seq,
          msg.payload.rotation,
          authoritativeTable,
        );
        if (msg.payload.dragId !== undefined || authoritativeTable) {
          if (object?.location === "TABLE") {
            this._store.updateObjectPosition({ id: object.id, position: { x: msg.payload.x, y: msg.payload.y, z: msg.payload.z }, rotation: msg.payload.rotation ?? object.rotation });
          }
        }
        break;
      }
      // ────────────────────────────────────────────────────────────────────

      case 'error':
        logger.error('Server error', { message: msg.payload.message, code: msg.payload.code });
        if (msg.payload.objectId) {
          this.onRejection?.(msg.payload.objectId, msg.payload.code);
        }
        this.onError?.(msg.payload.message);
        break;
      case 'pong':
        logger.debug('Pong received');
        break;
      case 'object:flipped': {
        this.onFlipConfirmed?.(msg.payload.objectId);
        this._sceneManager.syncFlippedCard(
          msg.payload.objectId,
          msg.payload.faceUp,
          msg.payload.cardType,
          msg.payload.ownerId ?? undefined,
          msg.payload.location ?? undefined,
          true,
          msg.payload.faceImage
        );
        break;
      }
      case 'object:locked':
      case 'object:unlocked':
        logger.debug('Object event', { type: msg.type });
        break;
      default:
        logger.warn('Unknown message type received');
    }
  }
}
