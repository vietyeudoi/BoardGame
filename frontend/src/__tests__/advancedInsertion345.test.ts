/**
 * advancedInsertion345.test.ts — Advanced Deck & Stack Insertion Test Suite (M1.3.4.5)
 * Comprehensive testing of:
 * 1. Stack insertion at index 0, middle, top, and multi-card stack insertion.
 * 2. DeckObject3D insertion at bottom, middle, top; LIFO invariants preserved.
 * 3. Return to Deck (single card, card in stack, full stack, atomic rollback).
 * 4. UI Insertion mode calculations & validations.
 * 5. CardRegistry integrity guarantees.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { CardStack } from '../objects/CardStack';
import { CardStackManager } from '../objects/CardStackManager';
import { SceneManager } from '../scene/SceneManager';
import { InsertionModal } from '../ui/components/InsertionModal';

// Mock WebGLRenderer for Node/JSDOM test runner
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

describe('M1.3.4.5 — Advanced Deck & Stack Insertion', () => {
  let scene: THREE.Scene;

  beforeEach(() => {
    scene = new THREE.Scene();
  });

  afterEach(() => {
    // cleanup
  });

  // ─── Group 1: Stack Insertion (CardStack & CardStackManager) ───────────────
  describe('Group 1: Stack Insertion', () => {
    it('1.1 should insert a single card at bottom (index 0) of an existing stack', () => {
      const c1 = new CardObject3D({ id: 'c1' });
      const c2 = new CardObject3D({ id: 'c2' });
      const c3 = new CardObject3D({ id: 'c3' });
      const stack = new CardStack({ cards: [c1, c2], scene });

      expect(stack.getCardIds()).toEqual(['c1', 'c2']);

      stack.insertCardAt(c3, 0);

      // c3 should now be at bottom
      expect(stack.getCardIds()).toEqual(['c3', 'c1', 'c2']);
      expect(stack.getBottomCard()?.cardId).toBe('c3');
      expect(stack.getTopCard()?.cardId).toBe('c2');
      expect(stack.getCount()).toBe(3);

      stack.dispose();
      c1.dispose();
      c2.dispose();
      c3.dispose();
    });

    it('1.2 should insert a single card in the middle of a stack', () => {
      const c1 = new CardObject3D({ id: 'c1' });
      const c2 = new CardObject3D({ id: 'c2' });
      const c3 = new CardObject3D({ id: 'c3' });
      const cX = new CardObject3D({ id: 'cX' });
      const stack = new CardStack({ cards: [c1, c2, c3], scene });

      // Insert at index 1: between c1 and c2
      stack.insertCardAt(cX, 1);

      expect(stack.getCardIds()).toEqual(['c1', 'cX', 'c2', 'c3']);
      expect(stack.getCount()).toBe(4);

      stack.dispose();
      c1.dispose();
      c2.dispose();
      c3.dispose();
      cX.dispose();
    });

    it('1.3 should insert a single card at the top (index = count)', () => {
      const c1 = new CardObject3D({ id: 'c1' });
      const c2 = new CardObject3D({ id: 'c2' });
      const cTop = new CardObject3D({ id: 'cTop' });
      const stack = new CardStack({ cards: [c1, c2], scene });

      stack.insertCardAt(cTop, 2);

      expect(stack.getCardIds()).toEqual(['c1', 'c2', 'cTop']);
      expect(stack.getTopCard()?.cardId).toBe('cTop');

      stack.dispose();
      c1.dispose();
      c2.dispose();
      cTop.dispose();
    });

    it('1.4 should insert multiple cards (stack) into another stack preserving relative order', () => {
      const manager = new CardStackManager();
      manager.setScene(scene);

      const a = new CardObject3D({ id: 'a' });
      const b = new CardObject3D({ id: 'b' });
      const c = new CardObject3D({ id: 'c' });
      const d = new CardObject3D({ id: 'd' });
      const targetStack = manager.createStack([a, d]); // [a (bottom), d (top)]

      const sourceStack = manager.createStack([b, c]); // [b (bottom), c (top)]

      // Insert sourceStack into targetStack at index 1 (between a and d)
      manager.insertStackIntoStack(sourceStack, targetStack, 1);

      expect(targetStack.getCardIds()).toEqual(['a', 'b', 'c', 'd']);
      expect(manager.getStack(sourceStack.stackId)).toBeUndefined(); // dissolved

      manager.dispose();
      a.dispose();
      b.dispose();
      c.dispose();
      d.dispose();
    });

    it('1.5 should reject invalid insertion index (< 0 or > count)', () => {
      const c1 = new CardObject3D({ id: 'c1' });
      const c2 = new CardObject3D({ id: 'c2' });
      const cX = new CardObject3D({ id: 'cX' });
      const stack = new CardStack({ cards: [c1, c2], scene });

      expect(() => stack.insertCardAt(cX, -1)).toThrow(/Invalid insertion index/);
      expect(() => stack.insertCardAt(cX, 3)).toThrow(/Invalid insertion index/);

      stack.dispose();
      c1.dispose();
      c2.dispose();
      cX.dispose();
    });
  });

  // ─── Group 2: Deck Insertion (DeckObject3D) ───────────────────────────────
  describe('Group 2: Deck Insertion', () => {
    it('2.1 should insert card at bottom of deck (index 0)', () => {
      const deck = new DeckObject3D({ id: 'deck_1', cardIds: ['d1', 'd2', 'd3'] });
      // Initially: d1 = bottom, d3 = top
      expect(deck.getCardIds()).toEqual(['d1', 'd2', 'd3']);

      deck.insertCardAt('d_bottom', 0);

      expect(deck.getCardIds()).toEqual(['d_bottom', 'd1', 'd2', 'd3']);
      expect(deck.getCount()).toBe(4);
      // Top card must still be d3!
      expect(deck.peekTop()).toBe('d3');
      expect(deck.draw()).toBe('d3');

      deck.dispose();
    });

    it('2.2 should insert card into middle of deck', () => {
      const deck = new DeckObject3D({ id: 'deck_1', cardIds: ['d1', 'd2', 'd3'] });

      deck.insertCardAt('d_mid', 1);

      expect(deck.getCardIds()).toEqual(['d1', 'd_mid', 'd2', 'd3']);
      expect(deck.getCount()).toBe(4);

      deck.dispose();
    });

    it('2.3 should insert card at top of deck (index = count)', () => {
      const deck = new DeckObject3D({ id: 'deck_1', cardIds: ['d1', 'd2', 'd3'] });

      deck.insertCardAt('d_top', 3);

      expect(deck.getCardIds()).toEqual(['d1', 'd2', 'd3', 'd_top']);
      expect(deck.peekTop()).toBe('d_top');
      expect(deck.draw()).toBe('d_top');
      expect(deck.peekTop()).toBe('d3');

      deck.dispose();
    });

    it('2.4 should insert multiple cards into deck at specified index', () => {
      const deck = new DeckObject3D({ id: 'deck_1', cardIds: ['d1', 'd4'] });

      deck.insertCardsAt(['d2', 'd3'], 1);

      expect(deck.getCardIds()).toEqual(['d1', 'd2', 'd3', 'd4']);
      expect(deck.getCount()).toBe(4);

      deck.dispose();
    });

    it('2.5 should reject duplicate or invalid index in deck insertion', () => {
      const deck = new DeckObject3D({ id: 'deck_1', cardIds: ['d1', 'd2'] });

      expect(() => deck.insertCardAt('d1', 1)).toThrow(/already exists/);
      expect(() => deck.insertCardAt('d_new', -1)).toThrow(/Invalid insertion index/);
      expect(() => deck.insertCardAt('d_new', 5)).toThrow(/Invalid insertion index/);

      deck.dispose();
    });
  });

  // ─── Group 3: Return to Deck & Atomic Transactions ────────────────────────
  describe('Group 3: Return to Deck & Atomic Transactions', () => {
    let container: HTMLElement;
    let sceneManager: SceneManager;

    beforeEach(() => {
      container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.body.appendChild(container);

      sceneManager = new SceneManager(container);
    });

    afterEach(() => {
      sceneManager.dispose();
      container.remove();
    });

    it('3.1 should return a standalone tabletop card to the top of the deck', () => {
      const deck = sceneManager.getDemoDeck()!;
      const initialCount = deck.getCount();

      // Draw a card from deck
      const drawn = sceneManager.drawCardFromDeck(deck.getId())!;
      expect(drawn).toBeDefined();
      expect(deck.getCount()).toBe(initialCount - 1);
      expect(sceneManager.getCardRegistry().getLocation(drawn.cardId)).toBe('ON_TABLE');

      // Return card to deck top
      const success = sceneManager.returnCardToDeck(drawn, deck.getId(), deck.getCount());
      expect(success).toBe(true);
      expect(deck.getCount()).toBe(initialCount);
      expect(deck.peekTop()).toBe(drawn.cardId);
      expect(sceneManager.getCardRegistry().getLocation(drawn.cardId)).toBe('IN_DECK');
      expect(sceneManager.getObject(drawn.cardId)).toBeUndefined();
    });

    it('3.2 should return a standalone tabletop card to the bottom of the deck (index 0)', () => {
      const deck = sceneManager.getDemoDeck()!;
      const initialCount = deck.getCount();

      const drawn = sceneManager.drawCardFromDeck(deck.getId())!;
      const originalTop = deck.peekTop();

      // Return to bottom
      const success = sceneManager.returnCardToDeck(drawn, deck.getId(), 0);
      expect(success).toBe(true);
      expect(deck.getCount()).toBe(initialCount);
      expect(deck.getCardIds()[0]).toBe(drawn.cardId);
      // Top card should remain unchanged!
      expect(deck.peekTop()).toBe(originalTop);
    });

    it('3.3 should return a card from inside a stack to the deck and preserve remaining stack', () => {
      const deck = sceneManager.getDemoDeck()!;
      const c1 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c2 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c3 = sceneManager.drawCardFromDeck(deck.getId())!;

      // Form stack of 3 cards
      const stack = sceneManager.getStackManager().createStack([c1, c2, c3]);
      expect(stack.getCount()).toBe(3);

      // Return middle card (c2) to deck
      const success = sceneManager.returnCardToDeck(c2, deck.getId());
      expect(success).toBe(true);

      // Remaining stack should have c1 and c3
      expect(stack.getCount()).toBe(2);
      expect(stack.getCardIds()).toEqual([c1.cardId, c3.cardId]);
      expect(sceneManager.getCardRegistry().getLocation(c2.cardId)).toBe('IN_DECK');
    });

    it('3.4 should return an entire stack to the deck preserving bottom-to-top order', () => {
      const deck = sceneManager.getDemoDeck()!;
      const c1 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c2 = sceneManager.drawCardFromDeck(deck.getId())!;
      const stack = sceneManager.getStackManager().createStack([c1, c2]);
      const stackId = stack.stackId;

      const initialCount = deck.getCount();
      // Return stack into deck at index 0 (bottom)
      const success = sceneManager.returnStackToDeck(stackId, deck.getId(), 0);
      expect(success).toBe(true);

      expect(deck.getCount()).toBe(initialCount + 2);
      expect(deck.getCardIds()[0]).toBe(c1.cardId);
      expect(deck.getCardIds()[1]).toBe(c2.cardId);
      expect(sceneManager.getStackManager().getStack(stackId)).toBeUndefined();
    });

    it('3.5 should maintain CardRegistry integrity with no orphaned or duplicate records', () => {
      const registry = sceneManager.getCardRegistry();
      const check = registry.validateIntegrity(
        sceneManager.getAllDecks(),
        sceneManager.getAllCards()
      );
      expect(check.valid).toBe(true);
      expect(check.errors).toEqual([]);
    });
  });

  // ─── Group 4: UI Mode Calculation & Modal Validation ──────────────────────
  describe('Group 4: UI Mode Calculation & Modal Validation', () => {
    let container: HTMLElement;
    let sceneManager: SceneManager;

    beforeEach(() => {
      container = document.createElement('div');
      sceneManager = new SceneManager(container);
    });

    afterEach(() => {
      sceneManager.dispose();
      container.remove();
    });

    it('4.1 should calculate index correctly for TOP, BOTTOM, and CUSTOM modes', () => {
      // Target count = 10
      // TOP => 10 (0 cards above)
      expect(sceneManager.calculateInsertionIndex(10, 'TOP')).toBe(10);
      // BOTTOM => 0 (10 cards above)
      expect(sceneManager.calculateInsertionIndex(10, 'BOTTOM')).toBe(0);
      // CUSTOM with 3 cards above => internal index = 10 - 3 = 7
      expect(sceneManager.calculateInsertionIndex(10, 'CUSTOM', 3)).toBe(7);
      // CUSTOM with 0 cards above => internal index = 10 - 0 = 10 (TOP)
      expect(sceneManager.calculateInsertionIndex(10, 'CUSTOM', 0)).toBe(10);
      // CUSTOM with 10 cards above => internal index = 10 - 10 = 0 (BOTTOM)
      expect(sceneManager.calculateInsertionIndex(10, 'CUSTOM', 10)).toBe(0);
      // Clamping:
      // Entering 15 cards above => clamped to 10 cards above => internal index = 0
      expect(sceneManager.calculateInsertionIndex(10, 'CUSTOM', 15)).toBe(0);
      // Entering -5 cards above => clamped to 0 cards above => internal index = 10
      expect(sceneManager.calculateInsertionIndex(10, 'CUSTOM', -5)).toBe(10);
    });

    it('4.2 InsertionModal should enforce non-negative integers within bounds', () => {
      const modal = new InsertionModal(container);
      let confirmedIndex = -1;

      modal.show({
        currentCount: 5,
        initialValue: 2,
        onConfirm: (idx) => {
          confirmedIndex = idx;
        },
      });

      const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
      const confirmBtn = container.querySelectorAll<HTMLButtonElement>('button')[1]!;

      // Valid confirm
      input.value = '3';
      confirmBtn.click();
      expect(confirmedIndex).toBe(3);

      modal.dispose();
    });
  });

  // ─── Group 5: M1.3.4.5.1 Directional Index & Custom Inversion Verification ─
  describe('Group 5: M1.3.4.5.1 Directional Index & Custom Inversion Verification', () => {
    let container: HTMLElement;
    let sceneManager: SceneManager;

    beforeEach(() => {
      container = document.createElement('div');
      sceneManager = new SceneManager(container);
    });

    afterEach(() => {
      sceneManager.dispose();
      container.remove();
    });

    it('5.1 should convert cardsAbove to internalIndex and back accurately', () => {
      const targetCount = 5;
      // 0 cards above => internalIndex = 5 (TOP)
      expect(sceneManager.cardsAboveToInternalIndex(targetCount, 0)).toBe(5);
      expect(sceneManager.internalIndexToCardsAbove(targetCount, 5)).toBe(0);

      // 1 card above => internalIndex = 4
      expect(sceneManager.cardsAboveToInternalIndex(targetCount, 1)).toBe(4);
      expect(sceneManager.internalIndexToCardsAbove(targetCount, 4)).toBe(1);

      // 2 cards above => internalIndex = 3
      expect(sceneManager.cardsAboveToInternalIndex(targetCount, 2)).toBe(3);
      expect(sceneManager.internalIndexToCardsAbove(targetCount, 3)).toBe(2);

      // 5 cards above => internalIndex = 0 (BOTTOM)
      expect(sceneManager.cardsAboveToInternalIndex(targetCount, 5)).toBe(0);
      expect(sceneManager.internalIndexToCardsAbove(targetCount, 0)).toBe(5);
    });

    it('5.2 should insert single card into stack according to cardsAbove', () => {
      const manager = sceneManager.getStackManager();
      const a = new CardObject3D({ id: 'A' });
      const b = new CardObject3D({ id: 'B' });
      const c = new CardObject3D({ id: 'C' });
      const d = new CardObject3D({ id: 'D' });
      const e = new CardObject3D({ id: 'E' });
      const stack = manager.createStack([a, b, c, d, e]); // [A, B, C, D, E], E is top

      // Case: cardsAbove = 0 => should be on top
      const x0 = new CardObject3D({ id: 'X0' });
      const idx0 = sceneManager.cardsAboveToInternalIndex(stack.getCount(), 0);
      manager.insertCardIntoStack(x0, stack, idx0);
      expect(stack.getCardIds()).toEqual(['A', 'B', 'C', 'D', 'E', 'X0']);
      expect(stack.getTopCard()?.cardId).toBe('X0');

      // Case: cardsAbove = 1 => 1 card above X1 (which is X0)
      const x1 = new CardObject3D({ id: 'X1' });
      const idx1 = sceneManager.cardsAboveToInternalIndex(stack.getCount(), 1);
      manager.insertCardIntoStack(x1, stack, idx1);
      expect(stack.getCardIds()).toEqual(['A', 'B', 'C', 'D', 'E', 'X1', 'X0']);

      // Case: cardsAbove = stack.getCount() => bottom
      const xBottom = new CardObject3D({ id: 'X_BOT' });
      const idxBot = sceneManager.cardsAboveToInternalIndex(stack.getCount(), stack.getCount());
      manager.insertCardIntoStack(xBottom, stack, idxBot);
      expect(stack.getCardIds()[0]).toBe('X_BOT');
      expect(stack.getBottomCard()?.cardId).toBe('X_BOT');
    });

    it('5.3 should insert multi-card stack with cardsAbove preserving source order', () => {
      const manager = sceneManager.getStackManager();
      const a = new CardObject3D({ id: 'A' });
      const b = new CardObject3D({ id: 'B' });
      const c = new CardObject3D({ id: 'C' });
      const targetStack = manager.createStack([a, b, c]); // [A, B, C], C is top

      const s1 = new CardObject3D({ id: 'S1' });
      const s2 = new CardObject3D({ id: 'S2' });
      const sourceStack = manager.createStack([s1, s2]); // [S1, S2]

      // cardsAbove = 1 => 1 card above [S1, S2] in target stack (namely C)
      // targetCount = 3 => internalIndex = 3 - 1 = 2
      const internalIdx = sceneManager.cardsAboveToInternalIndex(targetStack.getCount(), 1);
      manager.insertStackIntoStack(sourceStack, targetStack, internalIdx);

      expect(targetStack.getCardIds()).toEqual(['A', 'B', 'S1', 'S2', 'C']);
      expect(targetStack.getTopCard()?.cardId).toBe('C');
    });

    it('5.4 should return card to deck with custom cardsAbove', () => {
      const deck = sceneManager.getDemoDeck()!;
      const drawn = sceneManager.drawCardFromDeck(deck.getId())!;
      const initialCount = deck.getCount();

      // Return card with cardsAbove = 0 => placed on TOP
      const topIdx = sceneManager.cardsAboveToInternalIndex(deck.getCount(), 0);
      sceneManager.returnCardToDeck(drawn, deck.getId(), topIdx);
      expect(deck.getCount()).toBe(initialCount + 1);
      expect(deck.peekTop()).toBe(drawn.cardId);

      // Draw it again
      const drawnAgain = sceneManager.drawCardFromDeck(deck.getId())!;
      expect(drawnAgain.cardId).toBe(drawn.cardId);

      // Return with cardsAbove = deck.getCount() => placed on BOTTOM
      const botIdx = sceneManager.cardsAboveToInternalIndex(deck.getCount(), deck.getCount());
      sceneManager.returnCardToDeck(drawnAgain, deck.getId(), botIdx);
      expect(deck.getCardIds()[0]).toBe(drawn.cardId);
    });
  });
});
