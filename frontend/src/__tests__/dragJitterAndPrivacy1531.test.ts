/**
 * dragJitterAndPrivacy1531.test.ts
 *
 * Frontend unit/integration tests for M1.5.3.1:
 * 1. SceneManager ignores remote drag-move on cards currently being dragged locally.
 * 2. SceneManager drops out-of-order remote drag moves when seq < lastSeq.
 * 3. SceneManager onRemoteDragEnd updates position and faceUp orientation properly.
 * 4. SceneManager onRemoteDragEnd transfers card from hand to table when dropped on table.
 * 5. MessageHandler routes object:drag-move with seq, object:drag-end with faceUp & seq, and object:flipped.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { MessageHandler } from '../network/MessageHandler';
import { ClientStore } from '../store/ClientStore';
import { TABLE_CONFIG } from '../objects/TableConfig';

// ─── Mock Renderer (headless JSDOM) ──────────────────────────────────────────

vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      private readonly _canvas: HTMLCanvasElement;
      private readonly _camera: THREE.PerspectiveCamera;

      constructor(container: HTMLElement) {
        this._canvas = document.createElement('canvas');
        Object.defineProperty(this._canvas, 'clientWidth', { value: 1024, configurable: true });
        Object.defineProperty(this._canvas, 'clientHeight', { value: 768, configurable: true });
        this._canvas.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 1024,
          height: 768,
          right: 1024,
          bottom: 768,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        });
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 1000);
        this._camera.position.set(0, 8, 10);
        this._camera.lookAt(0, 0, 0);
        this._camera.updateProjectionMatrix();
      }

      startLoop(): void {}
      requestRender(): void {}
      handleResize(): void {}
      getCamera(): THREE.PerspectiveCamera {
        return this._camera;
      }
      getDomElement(): HTMLCanvasElement {
        return this._canvas;
      }
      dispose(): void {}
    },
  };
});

function createMockContainer(): HTMLElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1024,
    height: 768,
    right: 1024,
    bottom: 768,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return container;
}

describe('M1.5.3.1 — Frontend Drag Anti-Jitter & Privacy', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = createMockContainer();
    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
  });

  afterEach(() => {
    sceneManager.dispose();
  });

  it('drops out-of-order remote drag moves when seq < lastSeq', () => {
    const card = new CardObject3D({
      id: 'seq-test-card',
      title: 'Seq Test Card',
      position: { x: 0, y: TABLE_CONFIG.SURFACE_Y, z: 0 },
    });
    sceneManager.getCardRegistry().registerTableCard(card);
    sceneManager.addObject('seq-test-card', card);

    // Initial valid move with seq 100
    sceneManager.onRemoteDragMove('seq-test-card', { x: 5, y: 0.5, z: 5 }, 100);
    expect(card.position.x).toBe(5);
    expect(card.position.z).toBe(5);

    // Out-of-order move with older seq 90 should be IGNORED
    sceneManager.onRemoteDragMove('seq-test-card', { x: 1, y: 0.5, z: 1 }, 90);
    expect(card.position.x).toBe(5);
    expect(card.position.z).toBe(5);

    // Newer move with seq 101 should be ACCEPTED
    sceneManager.onRemoteDragMove('seq-test-card', { x: 6, y: 0.5, z: 6 }, 101);
    expect(card.position.x).toBe(6);
    expect(card.position.z).toBe(6);
  });

  it('ignores remote drag updates on a card actively being dragged locally', () => {
    const card = new CardObject3D({
      id: 'local-drag-card',
      title: 'Local Drag Card',
      position: { x: 2, y: TABLE_CONFIG.SURFACE_Y, z: 2 },
    });
    sceneManager.getCardRegistry().registerTableCard(card);
    sceneManager.addObject('local-drag-card', card);

    // Simulate local drag active
    const dragCtrl = sceneManager.getDragController();
    vi.spyOn(dragCtrl, 'isDragging').mockReturnValue(true);
    vi.spyOn(dragCtrl, 'getDraggedCard').mockReturnValue(card);

    // Remote drag move should NOT alter local card position
    sceneManager.onRemoteDragMove('local-drag-card', { x: 10, y: 1, z: 10 }, 50);
    expect(card.position.x).toBe(2);
    expect(card.position.z).toBe(2);

    // Remote drag end should also NOT alter local card position
    sceneManager.onRemoteDragEnd('local-drag-card', { x: 15, y: 0, z: 15 }, false, 60);
    expect(card.position.x).toBe(2);
    expect(card.position.z).toBe(2);
  });

  it('onRemoteDragEnd updates faceUp orientation and transfers hand card to table', () => {
    // Sync drawn card to player 1's hand
    const card = sceneManager.syncDrawnCard('drawn-card-1', 1, 'cat-boom', false);
    expect(card).not.toBeNull();
    expect(card!.isInHand()).toBe(true);
    expect(card!.isFaceUp()).toBe(false);

    // Remote player drags it to table and drops it face-down
    sceneManager.onRemoteDragEnd('drawn-card-1', { x: 0, y: 0.5, z: 0 }, false, 10);
    sceneManager.flushCardTransfers();
    expect(card!.isInHand()).toBe(false);
    expect(card!.isFaceUp()).toBe(false);
    expect(card!.position.x).toBe(0);
    expect(card!.position.z).toBe(0);

    // Another remote drag end updates it to face-up
    sceneManager.onRemoteDragEnd('drawn-card-1', { x: 2, y: 0.5, z: 2 }, true, 20);
    expect(card!.isFaceUp()).toBe(true);
  });



  it('dựng lại cùng ID khi lá từ tay đối thủ trở lại bàn', () => {
    const players = [{ id: 'peer', name: 'Peer', isHost: false, isConnected: true, playerIndex: 1 }];
    const card = {
      id: 'transferred-card', type: 'card', location: 'TABLE', position: { x: 0, y: 0, z: 0 },
      rotation: 0, faceUp: false, lockedBy: null,
    } as const;
    sceneManager.syncPrivateRoundObjects([card], players, {});
    const first = sceneManager.getObject(card.id) as CardObject3D;
    sceneManager.syncPrivateRoundObjects([], players, { peer: 1 });
    expect(first.isDisposed()).toBe(true);
    expect(sceneManager.getObject(card.id)).toBeUndefined();
    expect(sceneManager.getHandZoneManager().getHandZoneForPlayer(1)?.getCardCount()).toBe(1);

    sceneManager.syncPrivateRoundObjects([{ ...card, faceUp: true, cardType: 'skip' }], players, {});
    const returned = sceneManager.getObject(card.id) as CardObject3D;
    expect(returned).not.toBe(first);
    expect(returned.visible).toBe(true);
    expect(returned.isFaceUp()).toBe(true);
    expect(returned.getCardType()).toBe('skip');
    expect(sceneManager.getHandZoneManager().getHandZoneForPlayer(1)?.getCardCount()).toBe(0);

    sceneManager.syncPrivateRoundObjects([], players, { peer: 1 });
    expect(sceneManager.getHandZoneManager().getHandZoneForPlayer(1)?.getCardCount()).toBe(1);
  });

  it('giữ lá trên bàn theo máy chủ kể cả khi điểm thả trùng vùng tay', () => {
    const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
    const { x, z } = hand.position;
    expect(sceneManager.getHandZoneManager().findHandZoneAtPoint(x, z)).toBe(hand);

    sceneManager.onRemoteDragEnd('public-drop', { x, y: 0, z }, false, 10, 0, true);

    const card = sceneManager.getObject('public-drop') as CardObject3D;
    expect(card.visible).toBe(true);
    expect(card.isInHand()).toBe(false);
    expect(card.isFaceUp()).toBe(false);
    expect(hand.hasCard(card.cardId)).toBe(false);
  });

  it('MessageHandler dispatches object:flipped and updates card faceUp state', () => {
    const store = new ClientStore();
    const handler = new MessageHandler(store, sceneManager);

    const card = new CardObject3D({
      id: 'flip-card-test',
      title: 'Flip Card Test',
      faceUp: false,
    });
    sceneManager.getCardRegistry().registerTableCard(card);
    sceneManager.addObject('flip-card-test', card);

    expect(card.isFaceUp()).toBe(false);

    // MessageHandler receives object:flipped
    handler.handle({
      type: 'object:flipped',
      payload: { objectId: 'flip-card-test', faceUp: true },
    });

    expect(card.isFaceUp()).toBe(true);
  });
});
