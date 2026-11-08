/**
 * sharedHandInteraction1742.test.ts — M1.7.4.2 Frontend Shared Card Interaction Tests
 *
 * Verifies sandbox rules on frontend:
 * 1. canInteractWithObject and canDragCard return true for all cards (local hand, opponent hand, table).
 * 2. Dragging card from Hand A to Table updates CardRegistry to ON_TABLE and removes card from Hand A.
 * 3. Dragging card from Hand A directly to Hand B (own hand) moves it into local hand.
 * 4. Dragging card from Hand A directly to Hand C triggers onCardTransferRequested(cardId, targetPlayerIndex).
 * 5. syncFlippedCard flips any card in hand or on table and updates title if faceUp.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

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
      stopLoop(): void {}
      requestRender(): void {}
      handleResize(): void {}
      getCamera(): THREE.PerspectiveCamera {
        return this._camera;
      }
      getDomElement(): HTMLCanvasElement {
        return this._canvas;
      }
      dispose(): void {
        this._canvas.remove();
      }
    },
  };
});

import { SceneManager } from '../scene/SceneManager';

describe('M1.7.4.2 — Frontend Shared Card Interaction', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    // Local player is index 0
    sceneManager.setPlayerPerspective(0, 4, false);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  it('1. canInteractWithObject and canDragCard return true for cards in any hand zone and table', () => {
    const cardLocal = sceneManager.syncDrawnCard('card_local', 0, 'attack', true)!;
    const cardOpponent1 = sceneManager.syncDrawnCard('card_opp1', 1, 'defuse', true)!;
    const cardOpponent2 = sceneManager.syncDrawnCard('card_opp2', 2, 'nope', true)!;

    const interactionMgr = sceneManager.getInteractionManager();
    const dragCtrl = sceneManager.getDragController();

    expect(interactionMgr.canInteractWithObject!(cardLocal)).toBe(true);
    expect(interactionMgr.canInteractWithObject!(cardOpponent1)).toBe(true);
    expect(interactionMgr.canInteractWithObject!(cardOpponent2)).toBe(true);

    expect(dragCtrl.canDragCard!(cardLocal)).toBe(true);
    expect(dragCtrl.canDragCard!(cardOpponent1)).toBe(true);
    expect(dragCtrl.canDragCard!(cardOpponent2)).toBe(true);
  });

  it('2. Dragging card from opponent hand to table places it on table and preserves faceUp', () => {
    // Card in Player 1's hand
    const card = sceneManager.syncDrawnCard('card_opp_drop', 1, 'favor', true)!;
    const sourceZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;
    expect(sourceZone.hasCard(card.cardId)).toBe(true);

    // Drop onto table felt (outside all hand zones)
    card.position.set(2, 0, 2);
    (sceneManager as any)._onCardDropped(card, false, []);

    expect(card.isInHand()).toBe(false);
    expect(card.getHandZoneId()).toBeNull();
    expect(sourceZone.hasCard(card.cardId)).toBe(false);
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(false);
  });

  it('3. Dragging card from opponent Hand 1 to local Hand 0 moves it directly into local hand', () => {
    const card = sceneManager.syncDrawnCard('card_opp_to_my_hand', 1, 'shuffle', true)!;
    const oppZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;
    const localZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

    expect(oppZone.hasCard(card.cardId)).toBe(true);

    // Drop into local hand zone (playerIndex 0)
    card.position.set(localZone.position.x, 0, localZone.position.z);
    (sceneManager as any)._handleDropInHandZone(card, localZone, false, null, []);

    expect(oppZone.hasCard(card.cardId)).toBe(false);
    expect(localZone.hasCard(card.cardId)).toBe(true);
    expect(card.getHandZoneId()).toBe(localZone.zoneId);
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(false);
  });

  it('4. Dragging card from Hand 1 directly to 3rd party Hand 2 triggers onCardTransferRequested', () => {
    const card = sceneManager.syncDrawnCard('card_h1_to_h2', 1, 'nope', true)!;
    const targetZone2 = sceneManager.getHandZoneManager().getHandZoneForPlayer(2)!;

    const transferSpy = vi.fn();
    sceneManager.onCardTransferRequested = transferSpy;

    // Drop into Player 2's hand zone
    card.position.set(targetZone2.position.x, 0, targetZone2.position.z);
    (sceneManager as any)._handleDropInHandZone(card, targetZone2, false, null, []);

    expect(transferSpy).toHaveBeenCalledTimes(1);
    expect(transferSpy).toHaveBeenCalledWith('card_h1_to_h2', 2);
    // faceUp state preserved
    expect(card.isFaceUp()).toBe(true);
    // M1.7.4.3: Opponent hand card is masked from viewer perspective
    expect(card.isMasked()).toBe(true);
  });

  it('5. syncFlippedCard flips any card in hand or on table and updates title if faceUp', () => {
    const card = sceneManager.syncDrawnCard('card_flip_sync', 1, 'see-the-future', true)!;
    expect(card.isFaceUp()).toBe(true);
    expect(card.getContent().title).toContain('See the Future');

    // Flip to face down
    sceneManager.syncFlippedCard('card_flip_sync', false);
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(false);
    expect(card.isMasked()).toBe(true);

    // Flip to face up with cardType
    sceneManager.syncFlippedCard('card_flip_sync', true, 'attack');
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(true);
    // M1.7.4.3: Opponent hand card remains masked to viewer even when faceUp
    expect(card.isMasked()).toBe(true);
    expect(card.getContent().title).toContain('Attack');
  });
});
