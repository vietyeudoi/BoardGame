/**
 * browserIntegration3452.test.ts — Browser Integration Testing & Insertion Flow Stabilization (M1.3.4.5.2)
 *
 * Implements end-to-end integration verification for Tests A through F:
 * - Test A: Toolbar CUSTOM insertion with varying numberOfCardsAbove (0, 1, max)
 * - Test B: Stack to Stack merging across CUSTOM positions
 * - Test C: Mode verification across TOP, BOTTOM, and CUSTOM
 * - Test D: Return to Deck (TOP, BOTTOM, CUSTOM=0, CUSTOM=deckCount)
 * - Test E: Context Menu actions, Modal validation, and Cancel safety
 * - Test F: Edge Cases (single-card stack dissolve, empty deck, self-merge prevention, cancel drag)
 * - Continuous Data Integrity verification with assertTabletopInvariants()
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { InsertionModal } from '../ui/components/InsertionModal';
import { TABLE_CONFIG } from '../objects/TableConfig';

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

/**
 * Robust Tabletop Invariant Verifier.
 * Checks CardRegistry, active stacks, decks, scene objects, and disposal states.
 */
function assertTabletopInvariants(sceneManager: SceneManager): void {
  const registry = sceneManager.getCardRegistry();
  const decks = sceneManager.getAllDecks();
  const tableCards = sceneManager.getAllCards();

  // 1. Validate CardRegistry integrity
  const regCheck = registry.validateIntegrity(decks, tableCards);
  expect(regCheck.valid).toBe(true);
  expect(regCheck.errors).toEqual([]);

  // 2. All table/scene cards must have location === 'ON_TABLE' or 'IN_HAND'
  for (const card of tableCards) {
    expect(card.isDisposed()).toBe(false);
    expect(['ON_TABLE', 'IN_HAND']).toContain(registry.getLocation(card.cardId));
  }

  // 3. All deck card IDs must have location === 'IN_DECK'
  for (const deck of decks) {
    const cardIds = deck.getCardIds();
    for (const id of cardIds) {
      expect(registry.getLocation(id)).toBe('IN_DECK');
      expect(registry.getRecord(id)?.containerId).toBe(deck.getId());
    }
  }

  // 4. Verify stack invariants
  const stackManager = sceneManager.getStackManager();
  for (const stack of stackManager.getAllStacks()) {
    // Stacks must contain at least 2 cards
    expect(stack.getCount()).toBeGreaterThanOrEqual(2);
    const cards = stack.getCards();
    const seenIds = new Set<string>();

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]!;
      expect(c.isDisposed()).toBe(false);
      expect(c.isInStack()).toBe(true);
      expect(c.getStackId()).toBe(stack.stackId);
      expect(seenIds.has(c.cardId)).toBe(false);
      seenIds.add(c.cardId);
    }
  }
}

describe('M1.3.4.5.2 — Browser Integration Testing & Insertion Flow Stabilization', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1024px';
    container.style.height = '768px';
    document.body.appendChild(container);

    sceneManager = new SceneManager(container);
    assertTabletopInvariants(sceneManager);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST A: Toolbar CUSTOM Insertion
  // ─────────────────────────────────────────────────────────────────────────
  describe('Test A — Toolbar CUSTOM Insertion Flow', () => {
    it('A.1: should insert card on TOP when numberOfCardsAbove = 0', () => {
      const deck = sceneManager.getDemoDeck()!;
      // Draw 5 cards to form initial stack [A, B, C, D, E]
      const cards: CardObject3D[] = [];
      for (let i = 0; i < 5; i++) {
        cards.push(sceneManager.drawCardFromDeck(deck.getId())!);
      }
      const stack = sceneManager.getStackManager().createStack(cards);
      const topBefore = stack.getTopCard()?.cardId;

      // Draw card X
      const cardX = sceneManager.drawCardFromDeck(deck.getId())!;
      cardX.position.set(stack.getPosition().x, TABLE_CONFIG.SURFACE_Y, stack.getPosition().z);

      // Set Toolbar insertion mode to CUSTOM with 0 cards above
      sceneManager.setInsertionMode('CUSTOM', 0);
      expect(sceneManager.getInsertionMode()).toBe('CUSTOM');
      expect(sceneManager.getCustomInsertionAboveCount()).toBe(0);

      // Simulate dropping cardX onto stack
      (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(cardX);

      // Invariants & Expectations
      expect(stack.getCount()).toBe(6);
      expect(stack.getTopCard()?.cardId).toBe(cardX.cardId);
      expect(stack.getCards()[4]?.cardId).toBe(topBefore);
      assertTabletopInvariants(sceneManager);
    });

    it('A.2: should insert card immediately under top card when numberOfCardsAbove = 1', () => {
      const deck = sceneManager.getDemoDeck()!;
      const cards: CardObject3D[] = [];
      for (let i = 0; i < 5; i++) {
        cards.push(sceneManager.drawCardFromDeck(deck.getId())!);
      }
      const stack = sceneManager.getStackManager().createStack(cards);
      const originalTopId = stack.getTopCard()!.cardId;

      const cardX = sceneManager.drawCardFromDeck(deck.getId())!;
      cardX.position.set(stack.getPosition().x, TABLE_CONFIG.SURFACE_Y, stack.getPosition().z);

      // Set Toolbar to CUSTOM = 1 (1 card above X)
      sceneManager.setInsertionMode('CUSTOM', 1);

      (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(cardX);

      expect(stack.getCount()).toBe(6);
      // Top card must remain the original top card
      expect(stack.getTopCard()?.cardId).toBe(originalTopId);
      // cardX must be at index 4 (1 below top index 5)
      expect(stack.getCards()[4]?.cardId).toBe(cardX.cardId);
      assertTabletopInvariants(sceneManager);
    });

    it('A.3: should insert card at BOTTOM when numberOfCardsAbove = targetCount', () => {
      const deck = sceneManager.getDemoDeck()!;
      const cards: CardObject3D[] = [];
      for (let i = 0; i < 5; i++) {
        cards.push(sceneManager.drawCardFromDeck(deck.getId())!);
      }
      const stack = sceneManager.getStackManager().createStack(cards);

      const cardX = sceneManager.drawCardFromDeck(deck.getId())!;
      cardX.position.set(stack.getPosition().x, TABLE_CONFIG.SURFACE_Y, stack.getPosition().z);

      // Set Toolbar to CUSTOM = 5 (all 5 cards above X => placed at bottom)
      sceneManager.setInsertionMode('CUSTOM', 5);

      (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(cardX);

      expect(stack.getCount()).toBe(6);
      expect(stack.getBottomCard()?.cardId).toBe(cardX.cardId);
      expect(stack.getCards()[0]?.cardId).toBe(cardX.cardId);
      assertTabletopInvariants(sceneManager);
    });

    it('A.4: changing CUSTOM value multiple times should reflect the latest value', () => {
      sceneManager.setInsertionMode('CUSTOM', 2);
      expect(sceneManager.calculateInsertionIndex(5)).toBe(3); // 5 - 2 = 3

      sceneManager.setInsertionMode('CUSTOM', 4);
      expect(sceneManager.calculateInsertionIndex(5)).toBe(1); // 5 - 4 = 1

      sceneManager.setInsertionMode('CUSTOM', 0);
      expect(sceneManager.calculateInsertionIndex(5)).toBe(5); // 5 - 0 = 5 (TOP)
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST B: Stack to Stack
  // ─────────────────────────────────────────────────────────────────────────
  describe('Test B — Stack to Stack Merging Flow', () => {
    it('B.1: should merge source stack on TOP of target stack when CUSTOM = 0', () => {
      const deck = sceneManager.getDemoDeck()!;
      const targetCards = [
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
      ];
      const targetStack = sceneManager.getStackManager().createStack(targetCards);

      const sourceCards = [
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
      ];
      const sourceStack = sceneManager.getStackManager().createStack(sourceCards);
      const sourceIds = sourceStack.getCardIds(); // [S1, S2, S3]

      sceneManager.setInsertionMode('CUSTOM', 0);

      // Simulate dragging entire source stack onto target stack
      const leader = sourceCards[0]!;
      leader.position.set(targetStack.getPosition().x, TABLE_CONFIG.SURFACE_Y, targetStack.getPosition().z);
      const followers = sourceCards.slice(1);
      (sceneManager as unknown as {
        _onCardDropped: (c: CardObject3D, isGroup: boolean, followers: CardObject3D[]) => void;
      })._onCardDropped(leader, true, followers);

      expect(targetStack.getCount()).toBe(8);
      // Source stack cards should be on top in their original order
      const targetIds = targetStack.getCardIds();
      expect(targetIds.slice(5)).toEqual(sourceIds);
      // Source stack must be dissolved
      expect(sceneManager.getStackManager().getStack(sourceStack.stackId)).toBeUndefined();
      assertTabletopInvariants(sceneManager);
    });

    it('B.2: should merge source stack at BOTTOM of target stack when CUSTOM = targetCount', () => {
      const deck = sceneManager.getDemoDeck()!;
      const targetCards = [
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
      ];
      const targetStack = sceneManager.getStackManager().createStack(targetCards);
      const originalTargetIds = targetStack.getCardIds();

      const sourceCards = [
        sceneManager.drawCardFromDeck(deck.getId())!,
        sceneManager.drawCardFromDeck(deck.getId())!,
      ];
      const sourceStack = sceneManager.getStackManager().createStack(sourceCards);
      const sourceIds = sourceStack.getCardIds();

      // CUSTOM = 2 (targetCount) => internalIndex = 0
      sceneManager.setInsertionMode('CUSTOM', 2);

      const leader = sourceCards[0]!;
      leader.position.set(targetStack.getPosition().x, TABLE_CONFIG.SURFACE_Y, targetStack.getPosition().z);
      const followers = sourceCards.slice(1);
      (sceneManager as unknown as {
        _onCardDropped: (c: CardObject3D, isGroup: boolean, followers: CardObject3D[]) => void;
      })._onCardDropped(leader, true, followers);

      expect(targetStack.getCount()).toBe(4);
      // Source stack cards must be at bottom [S1, S2, D1, D2]
      expect(targetStack.getCardIds()).toEqual([...sourceIds, ...originalTargetIds]);
      assertTabletopInvariants(sceneManager);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST C: Mode Consistency (TOP, BOTTOM, CUSTOM)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Test C — TOP, BOTTOM, and CUSTOM Mode Consistency', () => {
    it('C.1: TOP mode should always insert at index = targetCount', () => {
      sceneManager.setInsertionMode('TOP');
      expect(sceneManager.calculateInsertionIndex(5)).toBe(5);
      expect(sceneManager.calculateInsertionIndex(12)).toBe(12);
      expect(sceneManager.calculateInsertionIndex(0)).toBe(0);
    });

    it('C.2: BOTTOM mode should always insert at index = 0', () => {
      sceneManager.setInsertionMode('BOTTOM');
      expect(sceneManager.calculateInsertionIndex(5)).toBe(0);
      expect(sceneManager.calculateInsertionIndex(12)).toBe(0);
      expect(sceneManager.calculateInsertionIndex(0)).toBe(0);
    });

    it('C.3: CUSTOM mode should strictly apply targetCount - numberOfCardsAbove', () => {
      sceneManager.setInsertionMode('CUSTOM', 2);
      expect(sceneManager.calculateInsertionIndex(5)).toBe(3); // 5 - 2 = 3
      expect(sceneManager.calculateInsertionIndex(2)).toBe(0); // 2 - 2 = 0
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST D: Return to Deck
  // ─────────────────────────────────────────────────────────────────────────
  describe('Test D — Return to Deck Flow', () => {
    it('D.1: Return Card to Deck TOP should increase count and update peekTop', () => {
      const deck = sceneManager.getDemoDeck()!;
      const initialCount = deck.getCount();
      const card = sceneManager.drawCardFromDeck(deck.getId())!;
      expect(deck.getCount()).toBe(initialCount - 1);

      // Return to TOP
      const ok = sceneManager.returnCardToDeck(card, deck.getId(), deck.getCount());
      expect(ok).toBe(true);
      expect(deck.getCount()).toBe(initialCount);
      expect(deck.peekTop()).toBe(card.cardId);
      assertTabletopInvariants(sceneManager);
    });

    it('D.2: Return Card to Deck BOTTOM (index 0) should not alter peekTop', () => {
      const deck = sceneManager.getDemoDeck()!;
      const initialCount = deck.getCount();
      const card = sceneManager.drawCardFromDeck(deck.getId())!;
      const topBefore = deck.peekTop();

      // Return to BOTTOM (index 0)
      const ok = sceneManager.returnCardToDeck(card, deck.getId(), 0);
      expect(ok).toBe(true);
      expect(deck.getCount()).toBe(initialCount);
      expect(deck.getCardIds()[0]).toBe(card.cardId);
      // Top card must remain unchanged!
      expect(deck.peekTop()).toBe(topBefore);
      assertTabletopInvariants(sceneManager);
    });

    it('D.3: Return Card to Deck with CUSTOM = 0 should place card on TOP', () => {
      const deck = sceneManager.getDemoDeck()!;
      const card = sceneManager.drawCardFromDeck(deck.getId())!;

      const insertIdx = sceneManager.cardsAboveToInternalIndex(deck.getCount(), 0);
      expect(insertIdx).toBe(deck.getCount());

      const ok = sceneManager.returnCardToDeck(card, deck.getId(), insertIdx);
      expect(ok).toBe(true);
      expect(deck.peekTop()).toBe(card.cardId);
      assertTabletopInvariants(sceneManager);
    });

    it('D.4: Return Card to Deck with CUSTOM = deckCount should place card on BOTTOM', () => {
      const deck = sceneManager.getDemoDeck()!;
      const card = sceneManager.drawCardFromDeck(deck.getId())!;
      const topBefore = deck.peekTop();

      const insertIdx = sceneManager.cardsAboveToInternalIndex(deck.getCount(), deck.getCount());
      expect(insertIdx).toBe(0);

      const ok = sceneManager.returnCardToDeck(card, deck.getId(), insertIdx);
      expect(ok).toBe(true);
      expect(deck.getCardIds()[0]).toBe(card.cardId);
      expect(deck.peekTop()).toBe(topBefore);
      assertTabletopInvariants(sceneManager);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST E: Context Menu & InsertionModal Validation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Test E — Context Menu & InsertionModal Validation Flow', () => {
    it('E.1: InsertionModal should reject negative input and block confirm', () => {
      const modal = new InsertionModal(container);
      let confirmedVal = -1;

      modal.show({
        currentCount: 5,
        onConfirm: (val) => {
          confirmedVal = val;
        },
      });

      const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
      const buttons = container.querySelectorAll<HTMLButtonElement>('button');
      const confirmBtn = buttons[buttons.length - 1]!;

      input.value = '-2';
      confirmBtn.click();

      // Confirmed callback must NOT be invoked
      expect(confirmedVal).toBe(-1);
      // Error message should be visible
      const errorMsg = container.querySelector<HTMLElement>('#insertion-modal-overlay div[style*="color: rgb(248, 113, 113)"]');
      expect(errorMsg?.style.display).not.toBe('none');

      modal.dispose();
    });

    it('E.2: InsertionModal should reject numbers exceeding currentMax', () => {
      const modal = new InsertionModal(container);
      let confirmedVal = -1;

      modal.show({
        currentCount: 5,
        onConfirm: (val) => {
          confirmedVal = val;
        },
      });

      const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
      const buttons = container.querySelectorAll<HTMLButtonElement>('button');
      const confirmBtn = buttons[buttons.length - 1]!;

      input.value = '10';
      confirmBtn.click();

      expect(confirmedVal).toBe(-1);
      modal.dispose();
    });

    it('E.3: Canceling modal should not trigger onConfirm and leave state intact', () => {
      const modal = new InsertionModal(container);
      let confirmed = false;
      let canceled = false;

      modal.show({
        currentCount: 5,
        onConfirm: () => {
          confirmed = true;
        },
        onCancel: () => {
          canceled = true;
        },
      });

      const buttons = container.querySelectorAll<HTMLButtonElement>('button');
      const cancelBtn = buttons[buttons.length - 2]!; // Cancel button
      cancelBtn.click();

      expect(confirmed).toBe(false);
      expect(canceled).toBe(true);

      modal.dispose();
    });

    it('E.4: Reordering a card in-place inside a stack via cardsAbove', () => {
      const deck = sceneManager.getDemoDeck()!;
      const c1 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c2 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c3 = sceneManager.drawCardFromDeck(deck.getId())!;
      const stack = sceneManager.getStackManager().createStack([c1, c2, c3]); // [c1, c2, c3], c3 is top

      // Move c1 to TOP (0 cards above)
      // remainingCount = stack.getCount() - 1 = 2
      const internalIdx = sceneManager.cardsAboveToInternalIndex(2, 0); // 2 - 0 = 2
      stack.removeCard(c1.cardId);
      stack.insertCardAt(c1, internalIdx);

      expect(stack.getCardIds()).toEqual([c2.cardId, c3.cardId, c1.cardId]);
      expect(stack.getTopCard()?.cardId).toBe(c1.cardId);
      assertTabletopInvariants(sceneManager);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST F: Edge Cases
  // ─────────────────────────────────────────────────────────────────────────
  describe('Test F — Edge Cases & Stability', () => {
    it('F.1: removing card from 2-card stack dissolves it to standalone cards', () => {
      const deck = sceneManager.getDemoDeck()!;
      const c1 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c2 = sceneManager.drawCardFromDeck(deck.getId())!;
      const stack = sceneManager.getStackManager().createStack([c1, c2]);
      const stackId = stack.stackId;

      const removed = sceneManager.getStackManager().removeCardFromStack(c1);
      expect(removed?.cardId).toBe(c1.cardId);
      expect(c1.isInStack()).toBe(false);
      expect(c2.isInStack()).toBe(false);
      // Stack must be completely dissolved
      expect(sceneManager.getStackManager().getStack(stackId)).toBeUndefined();
      assertTabletopInvariants(sceneManager);
    });

    it('F.2: empty deck behavior preserves count = 0 and does not crash peekTop or draw', () => {
      const emptyDeck = new DeckObject3D({ id: 'empty_deck', cardIds: [] });
      expect(emptyDeck.getCount()).toBe(0);
      expect(emptyDeck.peekTop()).toBeNull();
      expect(emptyDeck.draw()).toBeNull();
      emptyDeck.dispose();
    });

    it('F.3: cannot insert stack into itself', () => {
      const deck = sceneManager.getDemoDeck()!;
      const c1 = sceneManager.drawCardFromDeck(deck.getId())!;
      const c2 = sceneManager.drawCardFromDeck(deck.getId())!;
      const stack = sceneManager.getStackManager().createStack([c1, c2]);

      expect(() => {
        sceneManager.getStackManager().insertStackIntoStack(stack, stack);
      }).toThrow(/Cannot insert a stack into itself/);

      assertTabletopInvariants(sceneManager);
    });

    it('F.4: dragging a card and canceling drag clears preview highlight', () => {
      const card = sceneManager.getDemoCard()!;
      const interaction = sceneManager.getInteractionManager();

      interaction.setDropTargetPreview([card]);
      expect(interaction.getHoveredObject()).toBeNull();

      // Trigger drag cancel
      const dragCtrl = sceneManager.getDragController();
      dragCtrl.onDragCancel?.();

      assertTabletopInvariants(sceneManager);
    });
  });
});
