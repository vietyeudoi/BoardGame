/**
 * handZoneAndOwnership154.test.ts — Comprehensive Test Suite for Milestone M1.5.4
 * Hand Privacy, Card Ownership & Player Area Optimization
 *
 * Verifies:
 * - Nhóm 1: HandZone Geometry, Boundary Containment & Adaptive Centering (1, 2, 5, 10, 15 cards)
 * - Nhóm 2: Hover Elevation, Scale & Layer Order without altering logical order
 * - Nhóm 3: CardObject3D Texture Masking (Front texture protected from opponent views)
 * - Nhóm 4: Drag Permission & Opponent Card Protection (canDragCard)
 * - Nhóm 5: Card Transfer & Multiplayer Synchronization (syncTransferredCard, drop transfer to opponent)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';

// Mock WebGLRenderer for Node / JSDOM test runner
vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      private readonly _canvas: HTMLCanvasElement;
      private readonly _camera: THREE.PerspectiveCamera;

      constructor(container: HTMLElement) {
        this._canvas = document.createElement('canvas');
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      }

      getCamera() {
        return this._camera;
      }
      getDomElement() {
        return this._canvas;
      }
      startLoop() {}
      stopLoop() {}
      requestRender() {}
      handleResize() {}
      dispose() {
        this._canvas.remove();
      }
    },
  };
});

describe('M1.5.4 — Hand Privacy, Card Ownership & Player Area Optimization', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
    sceneManager.setLocalSessionId('test-local');
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm 1: HandZone Geometry, Boundary Containment & Centering (1–15 cards)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm 1 — Boundary Containment & Adaptive Layout (1, 2, 5, 10, 15 cards)', () => {
    it('strictly confines all cards within hand zone boundaries for any card count (1 to 15)', () => {
      const handZone = new HandZoneObject3D({
        id: 'test_hz_1',
        playerIndex: 0,
        label: 'Test Player',
        x: 0,
        z: 0,
        rotationY: 0,
      });
      const zoneHalfWidth = handZone.zoneWidth / 2;
      const cardHalfWidth = 2.5 / 2; // CARD_CONFIG.DEFAULT_WIDTH / 2 = 1.25

      const cardCounts = [1, 2, 5, 10, 15];

      for (const count of cardCounts) {
        handZone.clearCards();
        const cards: CardObject3D[] = [];
        for (let i = 0; i < count; i++) {
          const card = new CardObject3D({ id: `card_${count}_${i}` });
          cards.push(card);
          handZone.addCard(card);
        }

        expect(handZone.getCardCount()).toBe(count);

        // Check horizontal centering: first card and last card must be symmetrical around 0
        const firstCard = cards[0]!;
        const lastCard = cards[cards.length - 1]!;

        const firstLeftEdge = firstCard.position.x - cardHalfWidth;
        const lastRightEdge = lastCard.position.x + cardHalfWidth;

        // Centering symmetry: |firstLeftEdge| should equal lastRightEdge within tolerance
        expect(Math.abs(firstLeftEdge + lastRightEdge)).toBeLessThan(1e-4);

        // Strict boundary containment: no card may extend beyond [-zoneHalfWidth, +zoneHalfWidth]
        for (const card of cards) {
          const leftEdge = card.position.x - cardHalfWidth;
          const rightEdge = card.position.x + cardHalfWidth;
          expect(leftEdge).toBeGreaterThanOrEqual(-zoneHalfWidth - 1e-4);
          expect(rightEdge).toBeLessThanOrEqual(zoneHalfWidth + 1e-4);
        }
      }
    });

    it('re-centers remaining cards when a card is removed', () => {
      const handZone = new HandZoneObject3D({
        id: 'test_hz_recenter',
        playerIndex: 0,
        label: 'Player',
        x: 0,
        z: 0,
        rotationY: 0,
      });
      const cardA = new CardObject3D({ id: 'card_a' });
      const cardB = new CardObject3D({ id: 'card_b' });
      const cardC = new CardObject3D({ id: 'card_c' });

      handZone.addCard(cardA);
      handZone.addCard(cardB);
      handZone.addCard(cardC);

      // Card B should be at center 0
      expect(Math.abs(cardB.position.x)).toBeLessThan(1e-4);

      // Remove Card B
      handZone.removeCard('card_b');
      expect(handZone.getCardCount()).toBe(2);

      // Card A and Card C must now be symmetrically placed around 0
      expect(Math.abs(cardA.position.x + cardC.position.x)).toBeLessThan(1e-4);
      expect(cardA.position.x).toBeLessThan(0);
      expect(cardC.position.x).toBeGreaterThan(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm 2: Hover Elevation & Visual Selection Priority
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm 2 — Hover Elevation & Visual Priority', () => {
    it('elevates hovered card and sets top renderOrder without modifying logical hand order', () => {
      const handZone = new HandZoneObject3D({
        id: 'test_hz_hover',
        playerIndex: 0,
        label: 'Player',
        x: 0,
        z: 0,
        rotationY: 0,
      });
      const c1 = new CardObject3D({ id: 'c1' });
      const c2 = new CardObject3D({ id: 'c2' });
      const c3 = new CardObject3D({ id: 'c3' });

      handZone.addCard(c1);
      handZone.addCard(c2);
      handZone.addCard(c3);

      const baseElevationC2 = c2.position.y;
      const baseRenderOrderC2 = c2.getMesh().renderOrder;

      // Hover over c2
      handZone.setHoverCallback((card) => card.cardId === 'c2');
      handZone.arrangeCards();

      expect(c2.position.y).toBeGreaterThan(baseElevationC2 + HAND_ZONE_CONFIG.HOVER_LIFT_Y * 0.9); // subtle hover lift
      expect(c2.getMesh().renderOrder).toBeGreaterThanOrEqual(baseRenderOrderC2 + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET);

      // Logical order must remain [c1, c2, c3]
      const cardsInHand = handZone.getCards().map((c) => c.cardId);
      expect(cardsInHand).toEqual(['c1', 'c2', 'c3']);

      // Unhover
      handZone.setHoverCallback(undefined);
      handZone.arrangeCards();
      expect(c2.position.y).toBeCloseTo(baseElevationC2, 4);
      expect(c2.getMesh().renderOrder).toBe(baseRenderOrderC2);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm 3: CardObject3D Texture Masking & Privacy
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm 3 — CardObject3D Masking & Privacy', () => {
    it('masks front material to back texture when setMasked(true) and restores on setMasked(false)', () => {
      const frontTex = new THREE.Texture();
      const backTex = new THREE.Texture();
      const card = new CardObject3D({
        id: 'privacy_card',
        frontTexture: frontTex,
        backTexture: backTex,
      });
      expect(card.isMasked()).toBe(false);

      const frontMat = card.getMesh().material as THREE.MeshStandardMaterial[];
      expect(frontMat[0]!.map).toBe(frontTex);
      expect(frontMat[1]!.map).toBe(backTex);

      // Mask card
      card.setMasked(true);
      expect(card.isMasked()).toBe(true);
      expect(frontMat[0]!.map).toBe(backTex); // Front face renders back texture!

      // Flip while masked — back texture still covers both faces
      card.flip();
      expect(frontMat[0]!.map).toBe(backTex);

      // Unmask
      card.setMasked(false);
      expect(card.isMasked()).toBe(false);
      expect(frontMat[0]!.map).toBe(frontTex);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm 4: Drag Permission & Protection
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm 4 — Drag Permission Protection', () => {
    it('allows starting a drag on an opponent hand card (server still authorizes it)', () => {
      sceneManager.setupPlayerLayout(4);
      sceneManager.setPlayerPerspective(0, 4, false); // Local player is Player 0

      // Put card into Player 1 (opponent) hand
      const opponentCard = sceneManager.syncDrawnCard('opp_card', 1, 'defuse', false);
      expect(opponentCard).not.toBeNull();
      expect(opponentCard!.isInHand()).toBe(true);
      expect(opponentCard!.isMasked()).toBe(true);

      // Check canDragCard
      const dragCtrl = sceneManager.getDragController();
      expect(dragCtrl.canDragCard).toBeDefined();
      // M1.7.4: interaction starts optimistically; the backend rejects and the
      // client restores the card if the player does not own it.
      expect(dragCtrl.canDragCard!(opponentCard!)).toBe(true);

      // Put card into Player 0 (local player) hand
      const ownCard = sceneManager.syncDrawnCard('own_card', 0, 'attack', true, 'test-local');
      expect(ownCard).not.toBeNull();
      expect(ownCard!.isMasked()).toBe(false);
      expect(dragCtrl.canDragCard!(ownCard!)).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm 5: Card Transfer Flow & Synchronization
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm 5 — Card Transfer & Multiplayer Synchronization', () => {
    it('unmasks and sets cardType when local player receives transferred card', () => {
      sceneManager.setupPlayerLayout(4);
      sceneManager.setPlayerPerspective(0, 4, false); // Local player is Player 0

      // Transfer from Player 1 to Player 0
      const transferredCard = sceneManager.syncTransferredCard(
        'transferred_c1',
        1,
        0,
        'shuffle',
        true,
        undefined,
        undefined,
        'test-local'
      );

      expect(transferredCard).not.toBeNull();
      expect(transferredCard!.isInHand()).toBe(true);
      expect(transferredCard!.isMasked()).toBe(false);
      expect(transferredCard!.getContent().title).toContain('Shuffle');
      expect(transferredCard!.isFaceUp()).toBe(true);
    });

    it('masks card and strips private data when local player is not recipient', () => {
      sceneManager.setupPlayerLayout(4);
      sceneManager.setPlayerPerspective(0, 4, false); // Local player is Player 0

      // Transfer from Player 1 to Player 2 (peer to peer)
      const peerCard = sceneManager.syncTransferredCard(
        'transferred_c2',
        1,
        2,
        undefined,
        false
      );

      expect(peerCard).not.toBeNull();
      expect(peerCard!.isInHand()).toBe(true);
      expect(peerCard!.isMasked()).toBe(true);
      expect(peerCard!.isFaceUp()).toBe(false);
    });

    it('triggers onCardTransferRequested when local card is dropped into opponent hand zone', () => {
      sceneManager.setupPlayerLayout(4);
      sceneManager.setPlayerPerspective(0, 4, false);

      const transferSpy = vi.fn();
      sceneManager.onCardTransferRequested = transferSpy;

      // Local player draws a card
      const myCard = sceneManager.syncDrawnCard('my_card', 0, 'favor', true, 'test-local')!;
      expect(myCard.isMasked()).toBe(false);

      // Target opponent's hand zone (Player 1)
      const oppHandZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;

      // Drop myCard into oppHandZone
      myCard.position.set(oppHandZone.position.x, 0, oppHandZone.position.z);
      (sceneManager as any)._handleDropInHandZone(myCard, oppHandZone, false, null, []);

      expect(transferSpy).toHaveBeenCalledWith('my_card', 1);
      // M1.7.4.2: FaceUp is preserved across hand transfers
      expect(myCard.isFaceUp()).toBe(true);
      // M1.7.4.3: Masked because target is opponent hand
      expect(myCard.isMasked()).toBe(true);
    });
  });
});
