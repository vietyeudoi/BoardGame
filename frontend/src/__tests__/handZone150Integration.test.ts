/**
 * handZone150Integration.test.ts — Integration Tests for M1.5 Draw-to-Hand
 *
 * Verifies:
 * - Group A: drawCardToHand core behaviour
 * - Group B: CardRegistry integrity after draw-to-hand
 * - Group C: Hand-zone card counts across multiple draws
 * - Group D: Card drag from hand to table (hand → table transfer)
 * - Group E: Lifecycle & integrity invariants
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';

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
          left: 0, top: 0, width: 1024, height: 768,
          right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => ({}),
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
      getCamera(): THREE.PerspectiveCamera { return this._camera; }
      getDomElement(): HTMLCanvasElement { return this._canvas; }
      dispose(): void {}
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockContainer(): HTMLElement {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
  container.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 1024, height: 768,
    right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => ({}),
  });
  return container;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('M1.5 — drawCardToHand Integration', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = createMockContainer();
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
    // Ensure 4-player hand zone layout (same as App.ts default)
    sceneManager.setupPlayerLayout(4);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Group A — drawCardToHand core behaviour
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Nhóm A — Core draw-to-hand behaviour', () => {
    it('1. drawCardToHand returns a CardObject3D on success', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(card).toBeInstanceOf(CardObject3D);
      expect(card).not.toBeNull();
    });

    it('2. drawn card has the expected cardId from deck top', () => {
      const deck = sceneManager.getDemoDeck()!;
      const topId = deck.peekTop()!;

      const card = sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(card?.cardId).toBe(topId);
    });

    it('3. deck count decreases by 1 after draw-to-hand', () => {
      const deck = sceneManager.getDemoDeck()!;
      const before = deck.getCount();

      sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(deck.getCount()).toBe(before - 1);
    });

    it('4. drawn card is added to the 3D scene', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(sceneManager.getScene().children).toContain(card);
    });

    it('5. drawn card is registered with SceneManager (getObject)', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(sceneManager.getObject(card.cardId)).toBe(card);
    });

    it('6. drawCardToHand returns null when deck is empty', () => {
      const deck = sceneManager.getDemoDeck()!;
      const total = deck.getCount();

      // Drain the deck
      for (let i = 0; i < total; i++) {
        sceneManager.drawCardToHand('demo_deck_1', 0);
      }

      const result = sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(result).toBeNull();
    });

    it('7. drawCardToHand returns null for unknown deckId', () => {
      const result = sceneManager.drawCardToHand('nonexistent_deck', 0);
      expect(result).toBeNull();
    });

    it('8. drawCardToHand returns null for invalid playerIndex (no zone)', () => {
      // playerIndex 99 has no hand zone in a 4-player layout
      const result = sceneManager.drawCardToHand('demo_deck_1', 99);
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Group B — CardRegistry integrity after draw-to-hand
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Nhóm B — CardRegistry integrity', () => {
    it('9. card location is IN_HAND in CardRegistry after draw-to-hand', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      const registry = sceneManager.getCardRegistry();
      expect(registry.getLocation(card.cardId)).toBe('IN_HAND');
    });

    it('10. card is NOT still in deck after draw-to-hand', () => {
      const deck = sceneManager.getDemoDeck()!;
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      const ids = deck.getCardIds();
      expect(ids).not.toContain(card.cardId);
    });

    it('11. card.isInHand() returns true after draw-to-hand', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(card.isInHand()).toBe(true);
    });

    it('12. card.getHandZoneId() matches player-0 hand zone zoneId', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(card.getHandZoneId()).toBe(zone.zoneId);
    });

    it('13. registry containerId matches the hand zone id', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      const registry = sceneManager.getCardRegistry();
      expect(registry.getRecord(card.cardId)?.containerId).toBe(zone.zoneId);
    });

    it('14. CardRegistry.validateIntegrity passes after multiple draw-to-hand', () => {
      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 0);

      const registry = sceneManager.getCardRegistry();
      const result = registry.validateIntegrity(
        sceneManager.getAllDecks(),
        sceneManager.getAllCards()
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('15. no duplicate card IDs across deck, table, and hand after draws', () => {
      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardFromDeck('demo_deck_1');

      const deck = sceneManager.getDemoDeck()!;
      const deckIds = deck.getCardIds();
      const tableCards = sceneManager.getAllCards().map((c) => c.cardId);
      const allIds = [...deckIds, ...tableCards];

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Group C — Hand zone card counts
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Nhóm C — Hand zone card counts', () => {
    it('16. hand zone card count increases by 1 per draw', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      expect(zone.getCards().length).toBe(0);
      sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(zone.getCards().length).toBe(1);
      sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(zone.getCards().length).toBe(2);
    });

    it('17. multiple draws accumulate correctly in hand zone', () => {
      const drawCount = 5;
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      for (let i = 0; i < drawCount; i++) {
        sceneManager.drawCardToHand('demo_deck_1', 0);
      }

      expect(zone.getCards().length).toBe(drawCount);
    });

    it('18. hand zone contains the drawn card object', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(zone.hasCard(card.cardId)).toBe(true);
    });

    it('19. different player hands receive cards independently', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone0 = hzm.getHandZoneForPlayer(0)!;
      const zone1 = hzm.getHandZoneForPlayer(1)!;

      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 1);

      expect(zone0.getCards().length).toBe(1);
      expect(zone1.getCards().length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Group D — Card drag from hand to table (registry transition)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Nhóm D — Hand card transfer to table', () => {
    it('20. after transferHandToTable, card location is ON_TABLE', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      const registry = sceneManager.getCardRegistry();
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      // Simulate what drop-to-table does
      zone.removeCard(card.cardId);
      registry.transferHandToTable(card.cardId);

      expect(registry.getLocation(card.cardId)).toBe('ON_TABLE');
      expect(card.isInHand()).toBe(false);
    });

    it('21. after transferHandToTable, hand zone card count decreases', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(zone.getCards().length).toBe(1);

      zone.removeCard(card.cardId);
      sceneManager.getCardRegistry().transferHandToTable(card.cardId);
      expect(zone.getCards().length).toBe(0);
    });

    it('22. registry integrity is valid after hand → table transfer', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      const registry = sceneManager.getCardRegistry();
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      zone.removeCard(card.cardId);
      registry.transferHandToTable(card.cardId);

      const result = registry.validateIntegrity(
        sceneManager.getAllDecks(),
        sceneManager.getAllCards()
      );
      expect(result.valid).toBe(true);
    });

    it('23. canTransferToHand returns false for a card still IN_DECK', () => {
      const deck = sceneManager.getDemoDeck()!;
      const topId = deck.peekTop()!;
      const registry = sceneManager.getCardRegistry();
      // Still in deck — should not be transferable to hand directly
      expect(registry.canTransferToHand(topId)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Group E — Lifecycle & invariants
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Nhóm E — Lifecycle & invariants', () => {
    it('24. drawn hand-card is not disposed after draw', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(card.isDisposed()).toBe(false);
    });

    it('25. drawn hand-card is face-up', () => {
      const card = sceneManager.drawCardToHand('demo_deck_1', 0)!;
      expect(card.isFaceUp()).toBe(true);
    });

    it('26. player count rebuild preserves hand cards in new zones', () => {
      // Draw 2 cards into player 0 hand
      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 0);

      const hzm = sceneManager.getHandZoneManager();
      const cardsBefore = hzm.getHandZoneForPlayer(0)!.getCards();
      const idsBefore = cardsBefore.map((c) => c.cardId);

      // Rebuild to 3 players (player 0 zone should still exist)
      sceneManager.setupPlayerLayout(3);

      const zone0After = hzm.getHandZoneForPlayer(0);
      expect(zone0After).toBeDefined();
      const idsAfter = zone0After!.getCards().map((c) => c.cardId);

      // All previously drawn cards should still be in player 0's zone
      for (const id of idsBefore) {
        expect(idsAfter).toContain(id);
      }
    });

    it('27. sceneManager.dispose() cleans up without throwing', () => {
      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 0);

      expect(() => sceneManager.dispose()).not.toThrow();
    });

    it('28. drawing card to hand does not affect demo_card (ON_TABLE card)', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const registry = sceneManager.getCardRegistry();

      sceneManager.drawCardToHand('demo_deck_1', 0);

      expect(registry.getLocation(demoCard.cardId)).toBe('ON_TABLE');
      expect(demoCard.isInHand()).toBe(false);
    });

    it('29. deck count callback is called with correct count after draw-to-hand', () => {
      const deck = sceneManager.getDemoDeck()!;
      const initialCount = deck.getCount();
      let receivedCount = -1;

      sceneManager.onDeckCountChanged = (_id, count) => {
        receivedCount = count;
      };

      sceneManager.drawCardToHand('demo_deck_1', 0);
      expect(receivedCount).toBe(initialCount - 1);
    });

    it('30. getCardsInHand returns cards drawn via drawCardToHand', () => {
      const hzm = sceneManager.getHandZoneManager();
      const zone = hzm.getHandZoneForPlayer(0)!;

      sceneManager.drawCardToHand('demo_deck_1', 0);
      sceneManager.drawCardToHand('demo_deck_1', 0);

      const registry = sceneManager.getCardRegistry();
      const handCards = registry.getCardsInHand(zone.zoneId);
      expect(handCards.length).toBe(2);
    });
  });
});

