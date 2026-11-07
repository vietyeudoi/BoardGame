/**
 * MessageHandler.ts — Dispatches incoming server messages to appropriate handlers
 */
import type { ServerToClientMessage } from '@shared/types/protocol';
import type { SandboxObject } from '@shared/types/room';
import type { ClientStore } from '../store/ClientStore';
import type { SceneManager } from '../scene/SceneManager';
import type { RemoteCursorManager } from '../scene/RemoteCursorManager';
import { Logger } from '../utils/Logger';

const logger = Logger.create('MessageHandler');

export class MessageHandler {
  public onCardDrawn: ((card: SandboxObject, playerIndex: number) => void) | null = null;
  public onCardTransferred: ((payload: { cardId: string; fromPlayerIndex: number; toPlayerIndex: number; card: SandboxObject; seq?: number }) => void) | null = null;
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
        this._store.removePlayer(msg.payload.playerId);
        // Remove the departing player's cursor (M1.5.3)
        this.remoteCursorManager?.removeCursor(msg.payload.playerId);
        break;
      case 'hand:card-drawn':
        this._store.addOrUpdateObject(msg.payload.card);
        this.onCardDrawn?.(msg.payload.card, msg.payload.playerIndex);
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
      case 'cursor:update':
        this.remoteCursorManager?.updateCursor(msg.payload);
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
      case 'object:drag-end':
        this._sceneManager.onRemoteDragEnd?.(
          msg.payload.objectId,
          { x: msg.payload.x, y: msg.payload.y, z: msg.payload.z },
          msg.payload.faceUp,
          msg.payload.seq,
          msg.payload.rotation
        );
        break;
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
        this._sceneManager.syncFlippedCard(
          msg.payload.objectId,
          msg.payload.faceUp,
          msg.payload.cardType,
          msg.payload.ownerId ?? undefined,
          msg.payload.location ?? undefined
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
