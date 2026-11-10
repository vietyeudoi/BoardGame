/**
 * stackAutoArrangement343.test.ts — Unit & Integration Tests for Milestone M1.3.4.3
 * Stack Interaction, Auto Arrangement & Selection Visual Feedback
 *
 * Verifies:
 * - 4-Way Stacking & Merging (Card → Card, Card → Stack, Stack → Card, Stack → Stack)
 * - Bottom-to-top card ordering invariants and stackId updates
 * - Cascade arrangement & realignCards layout recalculation
 * - Drop Target detection & Drop Preview highlights
 * - Unified Selection Visual Feedback (single, multi, entire stack, clear)
 * - Group stack dragging vs single card extraction
 * - Data integrity in CardRegistry
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { SceneManager } from '../scene/SceneManager';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { INTERACTION_CONFIG } from '../interaction/InteractionConfig';

function getFirstMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats[0] as THREE.MeshStandardMaterial;
}

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

describe('M1.3.4.3 Stack Interaction, Auto Arrangement & Selection Visual Feedback', () => {
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
  // Group 1: 4-Way Merge Operations
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group 1: 4-Way Stacking & Merging Operations', () => {
    it('1.1 Card → Card: creates new Stack with target at bottom, incoming at top', () => {
      const sm = sceneManager.getStackManager();
      const target = createCard('c_target');
      const incoming = createCard('c_incoming');

      const stack = sm.stackCards(target, incoming);

      expect(stack.getCount()).toBe(2);
      expect(stack.getBottomCard()).toBe(target);
      expect(stack.getTopCard()).toBe(incoming);
      expect(target.getStackId()).toBe(stack.stackId);
      expect(incoming.getStackId()).toBe(stack.stackId);
    });

    it('1.2 Card → Stack: adds single card on top of an existing stack', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('cs_1');
      const c2 = createCard('cs_2');
      const incoming = createCard('cs_inc');
      const stack = sm.createStack([c1, c2]);

      sm.addCardToStack(incoming, stack);

      expect(stack.getCount()).toBe(3);
      expect(stack.getTopCard()).toBe(incoming);
      expect(incoming.getStackId()).toBe(stack.stackId);
      expect(stack.getCards()).toEqual([c1, c2, incoming]);
    });

    it('1.3 Stack → Card: merges full stack onto standalone card with card at bottom', () => {
      const sm = sceneManager.getStackManager();
      const s1 = createCard('sc_s1');
      const s2 = createCard('sc_s2');
      const sourceStack = sm.createStack([s1, s2]);
      const oldSourceId = sourceStack.stackId;
      const targetCard = createCard('sc_target');

      const result = sm.mergeStackOntoCard(sourceStack, targetCard);

      expect(result.getCount()).toBe(3);
      expect(result.getBottomCard()).toBe(targetCard);
      expect(result.getCards()).toEqual([targetCard, s1, s2]);
      expect(s1.getStackId()).toBe(result.stackId);
      expect(s2.getStackId()).toBe(result.stackId);
      expect(targetCard.getStackId()).toBe(result.stackId);
      expect(sm.getStack(oldSourceId)).toBeUndefined();
    });

    it('1.4 Stack → Stack: merges source stack on top of target stack, dissolving source', () => {
      const sm = sceneManager.getStackManager();
      const a1 = createCard('ss_a1');
      const a2 = createCard('ss_a2');
      const b1 = createCard('ss_b1');
      const b2 = createCard('ss_b2');

      const targetStack = sm.createStack([a1, a2]);
      const sourceStack = sm.createStack([b1, b2]);
      const sourceId = sourceStack.stackId;

      const merged = sm.mergeStacks(sourceStack, targetStack);

      expect(merged).toBe(targetStack);
      expect(targetStack.getCount()).toBe(4);
      expect(targetStack.getCards()).toEqual([a1, a2, b1, b2]);
      expect(targetStack.getBottomCard()).toBe(a1);
      expect(targetStack.getTopCard()).toBe(b2);
      expect(sm.getStack(sourceId)).toBeUndefined();
    });

    it('1.5 Preserves internal ordering when merging large stacks', () => {
      const sm = sceneManager.getStackManager();
      const bottomCards = [createCard('l_1'), createCard('l_2'), createCard('l_3')];
      const topCards = [createCard('l_4'), createCard('l_5'), createCard('l_6')];

      const stackB = sm.createStack(bottomCards);
      const stackT = sm.createStack(topCards);

      sm.mergeStacks(stackT, stackB);

      expect(stackB.getCount()).toBe(6);
      expect(stackB.getCards().map((c) => c.cardId)).toEqual([
        'l_1', 'l_2', 'l_3', 'l_4', 'l_5', 'l_6'
      ]);
    });

    it('1.6 CardRegistry retains ON_TABLE location for all cards across stack merges', () => {
      const reg = sceneManager.getCardRegistry();
      const sm = sceneManager.getStackManager();
      const c1 = createCard('cr_1');
      const c2 = createCard('cr_2');
      const c3 = createCard('cr_3');

      const s1 = sm.createStack([c1, c2]);
      sm.addCardToStack(c3, s1);

      for (const id of ['cr_1', 'cr_2', 'cr_3']) {
        expect(reg.getLocation(id)).toBe('ON_TABLE');
      }

      s1.takeTopCard();
      expect(reg.getLocation('cr_3')).toBe('ON_TABLE');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Group 2: Auto Arrangement & Cascade Layout
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group 2: Auto Arrangement & Cascade Layout', () => {
    it('2.1 Căn tâm cả phần hiển thị và phần tương tác', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('cas_1', 1.0, 2.0);
      const c2 = createCard('cas_2', 1.0, 2.0);
      const stack = sm.createStack([c1, c2]);

      // Both cards share stack base position
      expect(c1.position.x).toBeCloseTo(1.0, 5);
      expect(c1.position.z).toBeCloseTo(2.0, 5);
      expect(c2.position.x).toBeCloseTo(1.0, 5);
      expect(c2.position.z).toBeCloseTo(2.0, 5);

      // Cả hai mặt lá không dịch khỏi tâm.
      expect(c1.getCascadeOffset().x).toBeCloseTo(0, 5);
      expect(c1.getCascadeOffset().z).toBeCloseTo(0, 5);
      expect(c2.getCascadeOffset().x).toBeCloseTo(0, 5);
      expect(c2.getCascadeOffset().z).toBeCloseTo(0, 5);

      stack.dispose();
    });

    it('2.2 realignCards is triggered on addCard, removeCard, and setPosition', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('re_1', 0, 0);
      const c2 = createCard('re_2', 0, 0);
      const c3 = createCard('re_3', 0, 0);
      const stack = sm.createStack([c1, c2]);

      sm.addCardToStack(c3, stack);
      expect(c3.position.y - c1.position.y).toBeCloseTo(2 * INTERACTION_CONFIG.STACK_OFFSET_Y, 5);

      stack.removeCard('re_2');
      // After removing index 1, c3 is shifted to index 1
      expect(c3.position.y - c1.position.y).toBeCloseTo(INTERACTION_CONFIG.STACK_OFFSET_Y, 5);

      // Moving stack updates world positions for both
      stack.setPosition(4.0, 5.0);
      expect(c1.position.x).toBeCloseTo(4.0, 4);
      expect(c3.position.x).toBeCloseTo(4.0, 4);
    });

    it('2.3 Resets cascade offset to 0 when card leaves stack', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('leave_1');
      const c2 = createCard('leave_2');
      const stack = sm.createStack([c1, c2]);

      expect(c2.position.y - c1.position.y).toBeCloseTo(INTERACTION_CONFIG.STACK_OFFSET_Y);

      const popped = stack.takeTopCard();
      expect(popped).toBe(c2);
      expect(c2.getCascadeOffset().x).toBeCloseTo(0, 5);
      expect(c2.getCascadeOffset().z).toBeCloseTo(0, 5);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Group 3: Drop Target Detection & Drop Preview
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group 3: Drop Target Detection & Drop Preview', () => {
    it('3.1 Finds existing stack within DROP_ZONE_RADIUS', () => {
      const sm = sceneManager.getStackManager();
      const s1 = createCard('dt_s1', 0, 0);
      const s2 = createCard('dt_s2', 0, 0);
      const stack = sm.createStack([s1, s2]);

      const dragged = createCard('dt_drag', 0.8, 0.5); // within 1.5 units
      const target = sm.findNearbyTarget(dragged, [s1, s2, dragged], INTERACTION_CONFIG.DROP_ZONE_RADIUS);

      expect(target).toBe(stack);
    });

    it('3.2 Does not match stack outside DROP_ZONE_RADIUS', () => {
      const sm = sceneManager.getStackManager();
      const s1 = createCard('far_s1', 0, 0);
      const s2 = createCard('far_s2', 0, 0);
      sm.createStack([s1, s2]);

      const dragged = createCard('far_drag', 3.0, 3.0); // > 1.5 units
      const target = sm.findNearbyTarget(dragged, [s1, s2, dragged], INTERACTION_CONFIG.DROP_ZONE_RADIUS);

      expect(target).toBeNull();
    });

    it('3.3 setDropTargetPreview applies cyan highlight and clearDropTargetPreview restores state', () => {
      const im = sceneManager.getInteractionManager();
      const card = createCard('prev_card');
      const mat = getFirstMaterial(card.getMesh());

      im.setDropTargetPreview([card]);
      expect(mat.emissive.getHex()).toBe(INTERACTION_CONFIG.DROP_PREVIEW_EMISSIVE_COLOR);

      im.clearDropTargetPreview();
      expect(mat.emissive.getHex()).toBe(0x000000);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Group 4: Unified Selection Visual Feedback
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group 4: Selection Visual Feedback', () => {
    it('4.1 Selected card emits green highlight, deselect restores pristine base material', () => {
      const im = sceneManager.getInteractionManager();
      const card = createCard('sel_card');
      const mat = getFirstMaterial(card.getMesh());

      im.selectObject(card);
      expect(im.isSelected(card)).toBe(true);
      expect(mat.emissive.getHex()).toBe(INTERACTION_CONFIG.SELECTED_EMISSIVE_COLOR);

      im.deselectObject(card);
      expect(im.isSelected(card)).toBe(false);
      expect(mat.emissive.getHex()).toBe(0x000000);
      expect(mat.emissiveIntensity).toBe(1); // Standard base MeshStandardMaterial default
    });

    it('4.2 Multi-selection highlights all selected cards uniformly', () => {
      const im = sceneManager.getInteractionManager();
      const c1 = createCard('multi_1');
      const c2 = createCard('multi_2');
      const m1 = getFirstMaterial(c1.getMesh());
      const m2 = getFirstMaterial(c2.getMesh());

      im.selectObjects([c1, c2]);
      expect(im.isSelected(c1)).toBe(true);
      expect(im.isSelected(c2)).toBe(true);
      expect(m1.emissive.getHex()).toBe(INTERACTION_CONFIG.SELECTED_EMISSIVE_COLOR);
      expect(m2.emissive.getHex()).toBe(INTERACTION_CONFIG.SELECTED_EMISSIVE_COLOR);

      im.clearSelection();
      expect(m1.emissive.getHex()).toBe(0x000000);
      expect(m2.emissive.getHex()).toBe(0x000000);
    });

    it('4.3 selectStack selects all cards in the stack and highlights all of them', () => {
      const sm = sceneManager.getStackManager();
      const im = sceneManager.getInteractionManager();
      const c1 = createCard('st_sel_1');
      const c2 = createCard('st_sel_2');
      const c3 = createCard('st_sel_3');
      const stack = sm.createStack([c1, c2, c3]);

      sceneManager.selectStack(stack.stackId);

      expect(im.getSelectedCards()).toHaveLength(3);
      for (const c of [c1, c2, c3]) {
        const mat = getFirstMaterial(c.getMesh());
        expect(mat.emissive.getHex()).toBe(INTERACTION_CONFIG.SELECTED_EMISSIVE_COLOR);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Group 5: Stack Movement & Dropping
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Group 5: Stack Movement & Drag Dropping Integration', () => {
    it('5.1 Moving entire stack via drag drop updates stack position and keeps cards layered', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('drag_s1', 0, 0);
      const c2 = createCard('drag_s2', 0, 0);
      const stack = sm.createStack([c1, c2]);

      // Simulate dragging entire stack: card dropped at (-1.5, -3.5) — outside all zones
      c1.position.set(-1.5, TABLE_CONFIG.SURFACE_Y, -3.5);
      c2.position.set(-1.5, TABLE_CONFIG.SURFACE_Y, -3.5);

      (sceneManager as any)._onCardDropped(c1, true, [c2]);

      expect(stack.getPosition().x).toBeCloseTo(-1.5, 3);
      expect(stack.getPosition().z).toBeCloseTo(-3.5, 3);
      expect(c1.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(c2.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.STACK_OFFSET_Y, 4);
    });

    it('5.2 Dragging single card away from stack detaches it without breaking remaining stack', () => {
      const sm = sceneManager.getStackManager();
      const c1 = createCard('detach_1', 0, 0);
      const c2 = createCard('detach_2', 0, 0);
      const c3 = createCard('detach_3', 0, 0);
      const stack = sm.createStack([c1, c2, c3]);

      // Move c3 far away alone (followers = [])
      c3.position.set(5.0, TABLE_CONFIG.SURFACE_Y, 5.0);
      (sceneManager as any)._onCardDropped(c3, false, []);

      expect(c3.isInStack()).toBe(false);
      expect(stack.getCount()).toBe(2);
      expect(stack.getCards()).toEqual([c1, c2]);
    });
  });
});
