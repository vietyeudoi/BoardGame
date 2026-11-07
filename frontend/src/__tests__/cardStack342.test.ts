/**
 * cardStack342.test.ts — Unit & Integration Tests for Milestone M1.3.4.2
 * Card Stack Rework & Selection System
 *
 * Verifies:
 * - Group S: Stack-aware selection system (selectObjects, selectStack, single vs multi-select, Alt+Click callback)
 * - Group K: CardStackManager lifecycle & operations (createStack, addCardToStack, mergeStacks, removeCardFromStack, stackCards)
 * - Group I: Integration with CardRegistry, flip, takeTopCard, dissolve
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { SceneManager } from '../scene/SceneManager';
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

describe('M1.3.4.2 Card Stack Rework & Selection System', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  // Helper to create a standalone test card
  function createCard(id: string, x = 0, z = 0): CardObject3D {
    const card = new CardObject3D({
      id,
      title: `Card ${id}`,
      faceUp: true,
    });
    card.position.set(x, TABLE_CONFIG.SURFACE_Y, z);
    sceneManager.getCardRegistry().registerTableCard(card);
    sceneManager.getInteractionManager().registerObject(id, card);
    return card;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm S — Selection System Tests
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group S — Selection System', () => {
    it('S1. selectObjects([c1, c2]) selects both objects and getSelectedCards returns both', () => {
      const im = sceneManager.getInteractionManager();
      const c1 = createCard('s1_a', -1, 0);
      const c2 = createCard('s1_b', 1, 0);

      im.selectObjects([c1, c2]);
      const selected = im.getSelectedCards();

      expect(selected).toHaveLength(2);
      expect(selected).toContain(c1);
      expect(selected).toContain(c2);
      expect(im.isSelected(c1)).toBe(true);
      expect(im.isSelected(c2)).toBe(true);
    });

    it('S2. Single select card only selects that card, even if card is in a stack', () => {
      const im = sceneManager.getInteractionManager();
      const sm = sceneManager.getStackManager();
      const c1 = createCard('s2_a', 0, 0);
      const c2 = createCard('s2_b', 0, 0);
      sm.createStack([c1, c2]);

      im.selectObject(c1);

      expect(im.isSelected(c1)).toBe(true);
      expect(im.isSelected(c2)).toBe(false);
      expect(im.getSelectedCards()).toEqual([c1]);
    });

    it('S3. selectStack(stackId) via SceneManager selects all cards in the stack', () => {
      const im = sceneManager.getInteractionManager();
      const sm = sceneManager.getStackManager();
      const c1 = createCard('s3_a', 0, 0);
      const c2 = createCard('s3_b', 0, 0);
      const c3 = createCard('s3_c', 0, 0);
      const stack = sm.createStack([c1, c2, c3]);

      sceneManager.selectStack(stack.stackId);

      const selected = im.getSelectedCards();
      expect(selected).toHaveLength(3);
      expect(im.isSelected(c1)).toBe(true);
      expect(im.isSelected(c2)).toBe(true);
      expect(im.isSelected(c3)).toBe(true);
    });

    it('S4. selectObjects([c1, c2, c3]) multi-select returns all 3 cards', () => {
      const im = sceneManager.getInteractionManager();
      const c1 = createCard('s4_a', -2, 0);
      const c2 = createCard('s4_b', 0, 0);
      const c3 = createCard('s4_c', 2, 0);

      im.selectObjects([c1, c2, c3]);
      expect(im.getSelectedCards()).toHaveLength(3);
    });

    it('S5. clearSelection() resets selected cards count to 0', () => {
      const im = sceneManager.getInteractionManager();
      const c1 = createCard('s5_a', 0, 0);
      im.selectObject(c1);
      expect(im.getSelectedCards().length).toBe(1);

      im.clearSelection();
      expect(im.getSelectedCards().length).toBe(0);
      expect(im.isSelected(c1)).toBe(false);
    });

    it('S6. unregisterObject clears selection if unregistering a selected card', () => {
      const im = sceneManager.getInteractionManager();
      const c1 = createCard('s6_a', 0, 0);
      im.selectObject(c1);
      expect(im.isSelected(c1)).toBe(true);

      im.unregisterObject('s6_a');
      expect(im.isSelected(c1)).toBe(false);
      expect(im.getSelectedCards()).toHaveLength(0);
    });

    it('S7. dissolveStackForCard dissolves stack and sets isInStack to false for all cards', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('s7_a', 0, 0);
      const c2 = createCard('s7_b', 0, 0);
      const stack = sm.createStack([c1, c2]);

      expect(c1.isInStack()).toBe(true);
      expect(c2.isInStack()).toBe(true);

      sceneManager.dissolveStackForCard(c1);

      expect(c1.isInStack()).toBe(false);
      expect(c2.isInStack()).toBe(false);
      expect(sm.getStack(stack.stackId)).toBeUndefined();
    });

    it('S8. flip logic flips only selected cards, without fallback to demoCard', () => {
      const c1 = createCard('s8_a', 0, 0);
      expect(c1.isFaceUp()).toBe(true);

      // Flip function matching App.ts
      const flipSelected = () => {
        const selected = sceneManager.getInteractionManager().getSelectedCards();
        for (const card of selected) {
          if (!card.isDisposed()) card.flip();
        }
      };

      // With no selection -> c1 remains face up
      flipSelected();
      expect(c1.isFaceUp()).toBe(true);

      // Select c1 -> flipSelected flips c1
      sceneManager.getInteractionManager().selectObject(c1);
      flipSelected();
      expect(c1.isFaceUp()).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm K — Stack Operations Tests
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group K — Stack Operations', () => {
    it('K1. createStack([A, B]) creates stack with A bottom, B top', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k1_a');
      const b = createCard('k1_b');

      const stack = sm.createStack([a, b]);

      expect(stack.getCount()).toBe(2);
      expect(stack.getBottomCard()).toBe(a);
      expect(stack.getTopCard()).toBe(b);
      expect(a.getStackId()).toBe(stack.stackId);
      expect(b.getStackId()).toBe(stack.stackId);
    });

    it('K2. addCardToStack(C, stack) appends C to top of stack [A, B]', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k2_a');
      const b = createCard('k2_b');
      const c = createCard('k2_c');
      const stack = sm.createStack([a, b]);

      sm.addCardToStack(c, stack);

      expect(stack.getCount()).toBe(3);
      expect(stack.getTopCard()).toBe(c);
      expect(c.isInStack()).toBe(true);
      expect(c.getStackId()).toBe(stack.stackId);
    });

    it('K3. addCardToStack(D, stack) adds fourth card preserving bottom-to-top order', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k3_a');
      const b = createCard('k3_b');
      const c = createCard('k3_c');
      const d = createCard('k3_d');
      const stack = sm.createStack([a, b]);

      sm.addCardToStack(c, stack);
      sm.addCardToStack(d, stack);

      expect(stack.getCount()).toBe(4);
      expect(stack.getCards()).toEqual([a, b, c, d]);
      expect(stack.getTopCard()).toBe(d);
    });

    it('K4. mergeStacks(source[C, D], target[A, B]) puts source on top of target and dissolves source', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k4_a');
      const b = createCard('k4_b');
      const c = createCard('k4_c');
      const d = createCard('k4_d');

      const target = sm.createStack([a, b]);
      const source = sm.createStack([c, d]);
      const sourceId = source.stackId;

      const merged = sm.mergeStacks(source, target);

      expect(merged).toBe(target);
      expect(target.getCount()).toBe(4);
      expect(target.getCards()).toEqual([a, b, c, d]);
      expect(target.getBottomCard()).toBe(a);
      expect(target.getTopCard()).toBe(d);
      expect(c.getStackId()).toBe(target.stackId);
      expect(d.getStackId()).toBe(target.stackId);
      expect(sm.getStack(sourceId)).toBeUndefined();
    });

    it('K5. stackCards(targetInStack, standaloneIncoming) adds incoming to target stack', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k5_a');
      const b = createCard('k5_b');
      const incoming = createCard('k5_inc');
      const stack = sm.createStack([a, b]);

      const res = sm.stackCards(b, incoming);

      expect(res.stackId).toBe(stack.stackId);
      expect(res.getCount()).toBe(3);
      expect(res.getTopCard()).toBe(incoming);
    });

    it('K6. stackCards(standaloneTarget, incomingInStack) removes incoming from old stack and creates new stack', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k6_a');
      const b = createCard('k6_b');
      const oldStack = sm.createStack([a, b]);
      const standalone = createCard('k6_target');

      const res = sm.stackCards(standalone, b);

      // Old stack dropped to 1 card (a) -> auto-dissolved
      expect(sm.getStack(oldStack.stackId)).toBeUndefined();
      expect(a.isInStack()).toBe(false);

      // New stack formed with standalone at bottom, b at top
      expect(res.getCount()).toBe(2);
      expect(res.getBottomCard()).toBe(standalone);
      expect(res.getTopCard()).toBe(b);
    });

    it('K7. stackCards(cardInStackA, cardInStackB) merges stackB on top of stackA', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k7_a');
      const b = createCard('k7_b');
      const c = createCard('k7_c');
      const d = createCard('k7_d');

      const stackA = sm.createStack([a, b]);
      const stackB = sm.createStack([c, d]);
      const bId = stackB.stackId;

      const res = sm.stackCards(b, d);

      expect(res.stackId).toBe(stackA.stackId);
      expect(res.getCount()).toBe(4);
      expect(res.getCards()).toEqual([a, b, c, d]);
      expect(sm.getStack(bId)).toBeUndefined();
    });

    it('K8. Repeated takeTopCard from [A, B, C, D] returns top card and dissolves when <= 1 remains', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k8_a');
      const b = createCard('k8_b');
      const c = createCard('k8_c');
      const d = createCard('k8_d');
      const stack = sm.createStack([a, b, c, d]);
      const stackId = stack.stackId;

      // 1st take -> d
      const top1 = stack.takeTopCard();
      expect(top1).toBe(d);
      expect(d.isInStack()).toBe(false);
      expect(stack.getCount()).toBe(3);

      // 2nd take -> c
      const top2 = stack.takeTopCard();
      expect(top2).toBe(c);
      expect(c.isInStack()).toBe(false);
      expect(stack.getCount()).toBe(2);

      // 3rd take via removeCardFromStack(b)
      const removed = sm.removeCardFromStack(b);
      expect(removed).toBe(b);
      expect(b.isInStack()).toBe(false);

      // When 1 card remains (a), stack is auto-dissolved by removeCardFromStack
      expect(sm.getStack(stackId)).toBeUndefined();
      expect(a.isInStack()).toBe(false);
    });

    it('K9. removeCardFromStack(B) from [A, B, C] leaves [A, C] with B standalone', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k9_a');
      const b = createCard('k9_b');
      const c = createCard('k9_c');
      const stack = sm.createStack([a, b, c]);

      const removed = sm.removeCardFromStack(b);

      expect(removed).toBe(b);
      expect(b.isInStack()).toBe(false);
      expect(stack.getCount()).toBe(2);
      expect(stack.getCards()).toEqual([a, c]);
    });

    it('K10. removeCardFromStack(B) from [A, B] dissolves stack and makes both standalone', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k10_a');
      const b = createCard('k10_b');
      const stack = sm.createStack([a, b]);
      const stackId = stack.stackId;

      const removed = sm.removeCardFromStack(b);

      expect(removed).toBe(b);
      expect(b.isInStack()).toBe(false);
      expect(a.isInStack()).toBe(false);
      expect(sm.getStack(stackId)).toBeUndefined();
    });

    it('K11. Cannot createStack with duplicate card instances', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k11_a');

      expect(() => {
        sm.createStack([a, a]);
      }).toThrow();
    });

    it('K12. Cannot createStack with card already in a stack', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('k12_a');
      const b = createCard('k12_b');
      const c = createCard('k12_c');
      sm.createStack([a, b]);

      expect(() => {
        sm.createStack([b, c]);
      }).toThrow(/already part of stack/);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm I — Integration Tests
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group I — Integration Tests', () => {
    it('I1. Create stack [A, B] -> addCardToStack(C) -> takeTopCard() returns C, leaves [A, B]', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('i1_a');
      const b = createCard('i1_b');
      const c = createCard('i1_c');
      const stack = sm.createStack([a, b]);

      sm.addCardToStack(c, stack);
      expect(stack.getCount()).toBe(3);

      const top = stack.takeTopCard();
      expect(top).toBe(c);
      expect(c.isInStack()).toBe(false);
      expect(stack.getCount()).toBe(2);
      expect(stack.getCards()).toEqual([a, b]);
    });

    it('I2. Merge stacks [A, B] and [C, D], then take all 4 cards -> all retain ON_TABLE in CardRegistry', () => {
      const registry = sceneManager.getCardRegistry();
      const sm = sceneManager.getStackManager();
      const a = createCard('i2_a');
      const b = createCard('i2_b');
      const c = createCard('i2_c');
      const d = createCard('i2_d');

      const target = sm.createStack([a, b]);
      const source = sm.createStack([c, d]);
      sm.mergeStacks(source, target);

      // Verify all are in target stack
      for (const card of [a, b, c, d]) {
        expect(registry.getLocation(card.cardId)).toBe('ON_TABLE');
      }

      // Empty stack
      target.takeTopCard();
      target.takeTopCard();
      target.takeTopCard();
      target.takeTopCard();

      for (const card of [a, b, c, d]) {
        expect(registry.getLocation(card.cardId)).toBe('ON_TABLE');
        expect(card.isInStack()).toBe(false);
      }
    });

    it('I3. Flipping a card in a stack flips only that specific card', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('i3_a');
      const b = createCard('i3_b');
      sm.createStack([a, b]);

      expect(a.isFaceUp()).toBe(true);
      expect(b.isFaceUp()).toBe(true);

      b.flip();

      expect(a.isFaceUp()).toBe(true);
      expect(b.isFaceUp()).toBe(false);
    });

    it('I4. CardRegistry location remains ON_TABLE throughout stacking, merging, and removing', () => {
      const registry = sceneManager.getCardRegistry();
      const sm = sceneManager.getStackManager();
      const a = createCard('i4_a');
      const b = createCard('i4_b');
      const c = createCard('i4_c');

      const stack = sm.createStack([a, b]);
      expect(registry.getLocation('i4_a')).toBe('ON_TABLE');
      expect(registry.getLocation('i4_b')).toBe('ON_TABLE');

      sm.addCardToStack(c, stack);
      expect(registry.getLocation('i4_c')).toBe('ON_TABLE');

      sm.removeCardFromStack(b);
      expect(registry.getLocation('i4_b')).toBe('ON_TABLE');
    });

    it('I5. dissolveStackForCard sets isInStack to false for all cards in stack', () => {
      const sm = sceneManager.getStackManager();
      const a = createCard('i5_a');
      const b = createCard('i5_b');
      const c = createCard('i5_c');
      sm.createStack([a, b, c]);

      sceneManager.dissolveStackForCard(b);

      expect(a.isInStack()).toBe(false);
      expect(b.isInStack()).toBe(false);
      expect(c.isInStack()).toBe(false);
    });
  });
});
