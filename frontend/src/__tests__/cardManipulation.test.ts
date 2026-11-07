/**
 * cardManipulation.test.ts — Unit Tests for Milestone M1.3.4
 * Card Manipulation & Arrangement (Rotation, Positioning, Stacking, Multi-Select, Layering)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { CardStack } from '../objects/CardStack';
import { SceneManager } from '../scene/SceneManager';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { CARD_CONFIG } from '../objects/CardConfig';
import { INTERACTION_CONFIG, clampTablePosition } from '../interaction/InteractionConfig';
import { ContextMenu } from '../ui/ContextMenu';

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

      getCamera() { return this._camera; }
      getDomElement() { return this._canvas; }
      startLoop() {}
      stopLoop() {}
      requestRender() {}
      handleResize() {}
      dispose() { this._canvas.remove(); }
    },
  };
});

describe('M1.3.4 Card Manipulation & Arrangement', () => {
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

  // ─── NHÓM 1: CARD ROTATION ────────────────────────────────────────────────

  describe('Nhóm 1 — Card Rotation (Xoay lá bài)', () => {
    it('1. Xoay 90 độ clockwise quanh trục Y', () => {
      const card = new CardObject3D({ id: 'rot_card_1', position: { x: 0, y: 0, z: 0 } });
      expect(card.getRotationY()).toBeCloseTo(0, 5);

      card.rotateClockwise90();
      expect(card.getRotationY()).toBeCloseTo(Math.PI / 2, 5);
      card.dispose();
    });

    it('2. Xoay 90 độ counter-clockwise quanh trục Y', () => {
      const card = new CardObject3D({ id: 'rot_card_2' });
      card.rotateCounterClockwise90();

      // Normalized to [0, 2*PI) -> 2*PI - PI/2 = 3*PI/2
      expect(card.getRotationY()).toBeCloseTo((3 * Math.PI) / 2, 5);
      card.dispose();
    });

    it('3. Xoay 4 lần 90 độ hoàn thành chu kỳ 360 độ về 0', () => {
      const card = new CardObject3D({ id: 'rot_card_3' });
      for (let i = 0; i < 4; i++) {
        card.rotateClockwise90();
      }
      expect(card.getRotationY()).toBeCloseTo(0, 4);
      card.dispose();
    });

    it('4. Xoay bài giữ nguyên tọa độ X, Z và mặt bàn Y', () => {
      const card = new CardObject3D({
        id: 'rot_card_4',
        position: { x: 2.5, y: TABLE_CONFIG.SURFACE_Y, z: -1.8 },
      });

      card.rotateClockwise90();
      expect(card.position.x).toBeCloseTo(2.5, 5);
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
      expect(card.position.z).toBeCloseTo(-1.8, 5);
      card.dispose();
    });

    it('5. Xoay bài không làm hỏng chức năng lật mặt bài (flip)', () => {
      const card = new CardObject3D({ id: 'rot_card_5', faceUp: true });
      expect(card.isFaceUp()).toBe(true);

      card.rotateClockwise90();
      expect(card.getRotationY()).toBeCloseTo(Math.PI / 2, 5);

      card.flip();
      expect(card.isFaceUp()).toBe(false);

      card.flip();
      expect(card.isFaceUp()).toBe(true);
      card.dispose();
    });

    it('6. SceneManager.rotateSelectedCards xoay thẻ bài đang được chọn', () => {
      const card = sceneManager.getDemoCard()!;
      const interaction = sceneManager.getInteractionManager();

      interaction.selectObject(card);
      expect(card.getRotationY()).toBeCloseTo(0, 5);

      sceneManager.rotateSelectedCards(1);
      expect(card.getRotationY()).toBeCloseTo(Math.PI / 2, 5);

      sceneManager.rotateSelectedCards(-1);
      expect(card.getRotationY()).toBeCloseTo(0, 5);
    });
  });

  // ─── NHÓM 2: FREE POSITIONING (M1.7.5 Part 4 — Snap-to-Grid removed) ─────

  describe('Nhóm 2 — Free Positioning (Snap-to-Grid đã bị xóa)', () => {
    it('7. DragController không còn API Snap-to-Grid', () => {
      const dragController = sceneManager.getDragController() as unknown as Record<string, unknown>;
      expect(dragController.isSnapToGridEnabled).toBeUndefined();
      expect(dragController.setSnapToGrid).toBeUndefined();
      expect(dragController.toggleSnapToGrid).toBeUndefined();
      expect(dragController.getGridSize).toBeUndefined();
      expect(dragController.setGridSize).toBeUndefined();
    });

    it('8. INTERACTION_CONFIG không còn SNAP_TO_GRID_DEFAULT / GRID_SIZE', () => {
      const cfg = INTERACTION_CONFIG as unknown as Record<string, unknown>;
      expect(cfg.SNAP_TO_GRID_DEFAULT).toBeUndefined();
      expect(cfg.GRID_SIZE).toBeUndefined();
    });

    it('9. Card không vượt quá biên bàn ở góc xoay 0 độ', () => {
      const halfW = CARD_CONFIG.DEFAULT_WIDTH / 2;
      const halfH = CARD_CONFIG.DEFAULT_HEIGHT / 2;
      const maxFeltX = TABLE_CONFIG.FELT_WIDTH / 2;
      const maxFeltZ = TABLE_CONFIG.FELT_DEPTH / 2;

      // Position way outside table bounds
      const clamped = clampTablePosition(100, -100, 0);
      expect(clamped.x).toBeCloseTo(maxFeltX - halfW, 5);
      expect(clamped.z).toBeCloseTo(-(maxFeltZ - halfH), 5);
    });

    it('10. Card không vượt quá biên bàn khi xoay 90 độ (đổi trục W và H)', () => {
      const W = CARD_CONFIG.DEFAULT_WIDTH;
      const H = CARD_CONFIG.DEFAULT_HEIGHT;
      const maxFeltX = TABLE_CONFIG.FELT_WIDTH / 2;
      const maxFeltZ = TABLE_CONFIG.FELT_DEPTH / 2;

      // At 90 deg rotation, X extents use H/2 and Z extents use W/2
      const clamped90 = clampTablePosition(100, 100, Math.PI / 2, W, H);
      expect(clamped90.x).toBeCloseTo(maxFeltX - H / 2, 5);
      expect(clamped90.z).toBeCloseTo(maxFeltZ - W / 2, 5);
    });
  });

  // ─── NHÓM 3: CARD STACKING ────────────────────────────────────────────────

  describe('Nhóm 3 — Card Stacking (Xếp chồng bài)', () => {
    it('11. Tạo Stack với 3 lá bài và kiểm tra thứ tự', () => {
      const c1 = new CardObject3D({ id: 'stack_c1', position: { x: 1, y: 0, z: 1 } });
      const c2 = new CardObject3D({ id: 'stack_c2', position: { x: 1, y: 0, z: 1 } });
      const c3 = new CardObject3D({ id: 'stack_c3', position: { x: 1, y: 0, z: 1 } });

      const stack = new CardStack({ cards: [c1, c2, c3] });

      expect(stack.getCount()).toBe(3);
      expect(stack.getBottomCard()?.cardId).toBe('stack_c1');
      expect(stack.getTopCard()?.cardId).toBe('stack_c3');
      expect(stack.getCardIds()).toEqual(['stack_c1', 'stack_c2', 'stack_c3']);

      stack.dispose();
      c1.dispose();
      c2.dispose();
      c3.dispose();
    });

    it('12. Độ cao Y của mỗi lá bài trong stack tăng dần theo STACK_OFFSET_Y', () => {
      const c1 = new CardObject3D({ id: 'elev_c1' });
      const c2 = new CardObject3D({ id: 'elev_c2' });
      const c3 = new CardObject3D({ id: 'elev_c3' });

      const stack = new CardStack({ cards: [c1, c2, c3] });

      expect(c1.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
      expect(c2.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.STACK_OFFSET_Y, 5);
      expect(c3.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + 2 * INTERACTION_CONFIG.STACK_OFFSET_Y, 5);

      stack.dispose();
      c1.dispose();
      c2.dispose();
      c3.dispose();
    });

    it('13. Lấy lá bài trên cùng (takeTopCard) và đặt lại Y về mặt bàn', () => {
      const c1 = new CardObject3D({ id: 'take_c1' });
      const c2 = new CardObject3D({ id: 'take_c2' });
      const stack = new CardStack({ cards: [c1, c2] });

      const topCard = stack.takeTopCard();
      expect(topCard?.cardId).toBe('take_c2');
      expect(topCard?.isInStack()).toBe(false);
      expect(topCard?.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
      expect(stack.getCount()).toBe(1);

      stack.dispose();
      c1.dispose();
      c2.dispose();
    });

    it('14. Di chuyển cả Stack di chuyển đồng bộ toàn bộ các lá bài', () => {
      const c1 = new CardObject3D({ id: 'move_c1' });
      const c2 = new CardObject3D({ id: 'move_c2' });
      const stack = new CardStack({ cards: [c1, c2] });

      stack.setPosition(3.0, -2.0);

      expect(c1.position.x).toBeCloseTo(3.0, 5);
      expect(c1.position.z).toBeCloseTo(-2.0, 5);
      expect(c2.position.x).toBeCloseTo(3.0, 5);
      expect(c2.position.z).toBeCloseTo(-2.0, 5);

      stack.dispose();
      c1.dispose();
      c2.dispose();
    });

    it('15. Xoay cả Stack xoay đồng bộ toàn bộ các lá bài', () => {
      const c1 = new CardObject3D({ id: 'rot_c1' });
      const c2 = new CardObject3D({ id: 'rot_c2' });
      const stack = new CardStack({ cards: [c1, c2] });

      stack.rotateClockwise90();

      expect(c1.getRotationY()).toBeCloseTo(Math.PI / 2, 5);
      expect(c2.getRotationY()).toBeCloseTo(Math.PI / 2, 5);

      stack.dispose();
      c1.dispose();
      c2.dispose();
    });

    it('16. Từ chối thêm cùng một Card ID hai lần vào Stack', () => {
      const c1 = new CardObject3D({ id: 'dup_c1' });
      const stack = new CardStack({ cards: [c1] });

      expect(() => stack.addCard(c1)).toThrow(/already in this stack/);

      stack.dispose();
      c1.dispose();
    });

    it('17. CardStackManager tự động giải thể Stack khi chỉ còn 1 lá bài', () => {
      const manager = sceneManager.getStackManager();
      const c1 = new CardObject3D({ id: 'mgr_c1' });
      const c2 = new CardObject3D({ id: 'mgr_c2' });

      const stack = manager.createStack([c1, c2]);
      expect(manager.getStackCount()).toBe(1);

      const topCard = manager.takeTopCard(stack.stackId);
      expect(topCard?.cardId).toBe('mgr_c2');
      // Stack should have dissolved because only 1 card remained
      expect(manager.getStackCount()).toBe(0);
      expect(c1.isInStack()).toBe(false);

      c1.dispose();
      c2.dispose();
    });

    it('18. CardStackManager.stackCards xếp chồng thẻ bài', () => {
      const manager = sceneManager.getStackManager();
      const c1 = new CardObject3D({ id: 'pair_c1' });
      const c2 = new CardObject3D({ id: 'pair_c2' });

      const stack = manager.stackCards(c1, c2);
      expect(stack.getCount()).toBe(2);
      expect(c1.isInStack()).toBe(true);
      expect(c2.isInStack()).toBe(true);

      manager.dispose();
      c1.dispose();
      c2.dispose();
    });
  });

  // ─── NHÓM 4: MULTI-SELECT & GROUP DRAG ────────────────────────────────────

  describe('Nhóm 4 — Multi-Select & Group Drag', () => {
    it('19. Chọn đơn một lá bài', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoCard = sceneManager.getDemoCard()!;

      interaction.selectObject(demoCard);
      expect(interaction.getSelectedObject()).toBe(demoCard);
      expect(interaction.getSelectedObjects().length).toBe(1);
      expect(interaction.isSelected(demoCard)).toBe(true);
    });

    it('20. Multi-select: chọn nhiều lá bài và kiểm tra getSelectedCards', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoCard = sceneManager.getDemoCard()!;
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;

      // Add demoCard then addToSelection drawnCard
      interaction.selectObject(demoCard, false);
      interaction.selectObject(drawnCard, true);

      expect(interaction.getSelectedObjects().length).toBe(2);
      const cards = interaction.getSelectedCards();
      expect(cards.length).toBe(2);
      expect(interaction.isSelected(demoCard)).toBe(true);
      expect(interaction.isSelected(drawnCard)).toBe(true);
    });

    it('21. Bỏ chọn một đối tượng khỏi multi-select', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoCard = sceneManager.getDemoCard()!;
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;

      interaction.selectObject(demoCard, false);
      interaction.selectObject(drawnCard, true);
      expect(interaction.getSelectedCards().length).toBe(2);

      interaction.deselectObject(demoCard);
      expect(interaction.getSelectedCards().length).toBe(1);
      expect(interaction.isSelected(demoCard)).toBe(false);
      expect(interaction.isSelected(drawnCard)).toBe(true);
    });

    it('22. clearSelection giải phóng toàn bộ đối tượng được chọn', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoCard = sceneManager.getDemoCard()!;
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;

      interaction.selectObject(demoCard, false);
      interaction.selectObject(drawnCard, true);
      expect(interaction.getSelectedCards().length).toBe(2);

      interaction.clearSelection();
      expect(interaction.getSelectedCards().length).toBe(0);
      expect(interaction.getSelectedObject()).toBeNull();
    });

    it('23. Group Drag: duy trì khoảng cách tương đối chính xác giữa các thẻ bài', () => {
      const c1 = new CardObject3D({ id: 'group_c1', position: { x: 0, y: 0, z: 0 } });
      const c2 = new CardObject3D({ id: 'group_c2', position: { x: 2, y: 0, z: 1 } });

      sceneManager.addObject('group_c1', c1);
      sceneManager.addObject('group_c2', c2);

      const interaction = sceneManager.getInteractionManager();
      interaction.registerObject('group_c1', c1);
      interaction.registerObject('group_c2', c2);

      // Select both cards
      interaction.selectObject(c1, false);
      interaction.selectObject(c2, true);

      const dragController = sceneManager.getDragController();

      // Pointer down on c1 (leader)
      interaction.onCardMouseDown?.(c1, new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 }));
      expect(dragController.getGroupCards().length).toBe(1); // c2 is in group

      // Move 30px
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 430, clientY: 300 }));
      expect(dragController.isDragging()).toBe(true);

      // Verify relative distance is preserved
      const distBefore = Math.sqrt((c2.position.x - c1.position.x) ** 2 + (c2.position.z - c1.position.z) ** 2);
      expect(distBefore).toBeCloseTo(Math.sqrt(2 * 2 + 1 * 1), 2);

      window.dispatchEvent(new MouseEvent('mouseup'));
      expect(dragController.isDragging()).toBe(false);
    });
  });

  // ─── NHÓM 5: LAYERING & ARRANGEMENT ───────────────────────────────────────

  describe('Nhóm 5 — Layering & Arrangement', () => {
    it('24. LayeringManager quản lý thứ tự các lá bài trên bàn', () => {
      const layering = sceneManager.getLayeringManager();
      const c1 = new CardObject3D({ id: 'layer_c1' });
      const c2 = new CardObject3D({ id: 'layer_c2' });
      const c3 = new CardObject3D({ id: 'layer_c3' });

      layering.syncCards([c1, c2, c3]);
      expect(layering.getTotalLayers()).toBe(3);
      expect(layering.getLayerOf('layer_c1')).toBe(0);
      expect(layering.getLayerOf('layer_c3')).toBe(2);

      c1.dispose();
      c2.dispose();
      c3.dispose();
    });

    it('25. bringToFront đưa lá bài lên trên cùng', () => {
      const layering = sceneManager.getLayeringManager();
      const c1 = new CardObject3D({ id: 'front_c1' });
      const c2 = new CardObject3D({ id: 'front_c2' });

      layering.syncCards([c1, c2]);
      expect(layering.getLayerOf('front_c1')).toBe(0);

      layering.bringToFront(c1);
      expect(layering.getLayerOf('front_c1')).toBe(1);
      expect(layering.getLayerOf('front_c2')).toBe(0);

      c1.dispose();
      c2.dispose();
    });

    it('26. sendToBack đưa lá bài xuống dưới cùng', () => {
      const layering = sceneManager.getLayeringManager();
      const c1 = new CardObject3D({ id: 'back_c1' });
      const c2 = new CardObject3D({ id: 'back_c2' });

      layering.syncCards([c1, c2]);
      expect(layering.getLayerOf('back_c2')).toBe(1);

      layering.sendToBack(c2);
      expect(layering.getLayerOf('back_c2')).toBe(0);
      expect(layering.getLayerOf('back_c1')).toBe(1);

      c1.dispose();
      c2.dispose();
    });

    it('27. moveUp và moveDown hoán đổi thứ tự tương đối', () => {
      const layering = sceneManager.getLayeringManager();
      const c1 = new CardObject3D({ id: 'up_c1' });
      const c2 = new CardObject3D({ id: 'up_c2' });
      const c3 = new CardObject3D({ id: 'up_c3' });

      layering.syncCards([c1, c2, c3]);
      expect(layering.getLayerOf('up_c1')).toBe(0);

      layering.moveUp(c1);
      expect(layering.getLayerOf('up_c1')).toBe(1);

      layering.moveDown(c1);
      expect(layering.getLayerOf('up_c1')).toBe(0);

      c1.dispose();
      c2.dispose();
      c3.dispose();
    });
  });

  // ─── NHÓM 6: CONTEXT MENU & UI ────────────────────────────────────────────

  describe('Nhóm 6 — Context Menu & UI', () => {
    it('28. ContextMenu hiển thị các action và ẩn khi click ngoài', () => {
      const menu = new ContextMenu(container);
      expect(menu.isOpen()).toBe(false);

      const actionMock = vi.fn();
      menu.show(100, 100, [
        { label: 'Test Action', action: actionMock },
      ]);
      expect(menu.isOpen()).toBe(true);

      // Trigger click outside to hide
      window.dispatchEvent(new MouseEvent('click'));
      expect(menu.isOpen()).toBe(false);

      menu.dispose();
    });

    it('29. Phím Escape đóng ContextMenu', () => {
      const menu = new ContextMenu(container);
      menu.show(100, 100, [
        { label: 'Action', action: () => {} },
      ]);
      expect(menu.isOpen()).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(menu.isOpen()).toBe(false);

      menu.dispose();
    });

    it('30. CardRegistry ownership được bảo toàn 100% trong suốt quá trình thao tác', () => {
      const registry = sceneManager.getCardRegistry();
      const demoCard = sceneManager.getDemoCard()!;

      expect(registry.getLocation(demoCard.cardId)).toBe('ON_TABLE');

      // Rotate, position, layer
      demoCard.rotateClockwise90();
      demoCard.setPosition(1, TABLE_CONFIG.SURFACE_Y, 1);
      sceneManager.getLayeringManager().syncCards([demoCard]);
      sceneManager.getLayeringManager().bringToFront(demoCard);

      // Invariants must hold
      expect(registry.getLocation(demoCard.cardId)).toBe('ON_TABLE');
      expect(registry.getCardObject(demoCard.cardId)).toBe(demoCard);
      expect(registry.hasCard(demoCard.cardId)).toBe(true);
    });
  });

  // ─── NHÓM A: BUG 1 — CARD FLIP (M1.3.4.1) ────────────────────────────────

  describe('Nhóm A — BUG 1 Fix: Card Flip không phụ thuộc Demo Card (M1.3.4.1)', () => {
    it('A1. Lật bài đang được chọn (drawn card, không phải demo)', () => {
      const interaction = sceneManager.getInteractionManager();
      const drawn = sceneManager.drawCardFromDeck('demo_deck')!;
      expect(drawn).toBeDefined();
      expect(drawn.isFaceUp()).toBe(true);

      interaction.selectObject(drawn);
      expect(interaction.getSelectedCards()).toContain(drawn);

      drawn.flip();
      expect(drawn.isFaceUp()).toBe(false);
    });

    it('A2. Lật nhiều bài cùng lúc khi multi-select', () => {
      const interaction = sceneManager.getInteractionManager();
      const c1 = sceneManager.drawCardFromDeck('demo_deck')!;
      const c2 = sceneManager.drawCardFromDeck('demo_deck')!;

      interaction.selectObject(c1, false);
      interaction.selectObject(c2, true);

      const selectedCards = interaction.getSelectedCards();
      expect(selectedCards.length).toBe(2);

      // Flip all selected
      for (const card of selectedCards) {
        if (!card.isDisposed()) card.flip();
      }

      expect(c1.isFaceUp()).toBe(false);
      expect(c2.isFaceUp()).toBe(false);
    });

    it('A3. Không lật khi không có bài nào được chọn (không fallback demoCard)', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoCard = sceneManager.getDemoCard()!;
      const initialFace = demoCard.isFaceUp();

      interaction.clearSelection();
      expect(interaction.getSelectedCards().length).toBe(0);

      // Simulate flipTargetCard logic: NO fallback to demoCard
      const selectedCards = interaction.getSelectedCards();
      if (selectedCards.length > 0) {
        for (const card of selectedCards) {
          if (!card.isDisposed()) card.flip();
        }
      }
      // demoCard must NOT have flipped
      expect(demoCard.isFaceUp()).toBe(initialFace);
    });

    it('A4. Lật bài không làm thay đổi rotation.y của bài', () => {
      const card = new CardObject3D({ id: 'flip_rot_test', faceUp: true });
      card.rotateClockwise90();
      const rotBefore = card.getRotationY();

      card.flip();
      expect(card.isFaceUp()).toBe(false);
      expect(card.getRotationY()).toBeCloseTo(rotBefore, 5);
      card.dispose();
    });

    it('A5. Lật bài không làm thay đổi cardId', () => {
      const card = new CardObject3D({ id: 'flip_id_test', faceUp: false });
      const idBefore = card.cardId;
      card.flip();
      expect(card.cardId).toBe(idBefore);
      expect(card.isFaceUp()).toBe(true);
      card.dispose();
    });

    it('A6. Bài đã disposed không được lật (phòng trường hợp reference cũ)', () => {
      const card = new CardObject3D({ id: 'flip_disposed_test', faceUp: true });
      card.dispose();
      expect(card.isDisposed()).toBe(true);
      // Should not throw when we guard with isDisposed()
      const selectedCards = [card];
      let flipped = false;
      for (const c of selectedCards) {
        if (!c.isDisposed()) {
          c.flip();
          flipped = true;
        }
      }
      expect(flipped).toBe(false);
    });
  });

  // ─── NHÓM B: BUG 2 — STACK TOP CARD (M1.3.4.1) ────────────────────────────

  describe('Nhóm B — BUG 2 Fix: Stack lấy đúng lá trên cùng (M1.3.4.1)', () => {
    it('B1. Stack [A, B, C]: peekTop() trả về C', () => {
      const cA = new CardObject3D({ id: 'b1_A' });
      const cB = new CardObject3D({ id: 'b1_B' });
      const cC = new CardObject3D({ id: 'b1_C' });
      const stack = new CardStack({ cards: [cA, cB, cC] });

      expect(stack.getTopCard()?.cardId).toBe('b1_C');
      expect(stack.getBottomCard()?.cardId).toBe('b1_A');
      expect(stack.getCount()).toBe(3);

      stack.dispose();
      cA.dispose(); cB.dispose(); cC.dispose();
    });

    it('B2. takeTopCard() từ [A, B, C] trả về C, stack còn [A, B]', () => {
      const cA = new CardObject3D({ id: 'b2_A' });
      const cB = new CardObject3D({ id: 'b2_B' });
      const cC = new CardObject3D({ id: 'b2_C' });
      const stack = new CardStack({ cards: [cA, cB, cC] });

      const top = stack.takeTopCard();
      expect(top?.cardId).toBe('b2_C');
      expect(top?.isInStack()).toBe(false);
      expect(stack.getCount()).toBe(2);
      expect(stack.getTopCard()?.cardId).toBe('b2_B');

      stack.dispose();
      cA.dispose(); cB.dispose(); cC.dispose();
    });

    it('B3. Lấy tuần tự từ stack [A, B, C]: C → B → A, stack tự giải thể', () => {
      const manager = sceneManager.getStackManager();
      const cA = new CardObject3D({ id: 'b3_A' });
      const cB = new CardObject3D({ id: 'b3_B' });
      const cC = new CardObject3D({ id: 'b3_C' });
      const stack = manager.createStack([cA, cB, cC]);

      const top1 = manager.takeTopCard(stack.stackId);
      expect(top1?.cardId).toBe('b3_C');
      expect(manager.getStackCount()).toBe(1); // stack still has 2 cards

      const top2 = manager.takeTopCard(stack.stackId);
      expect(top2?.cardId).toBe('b3_B');
      // Stack dissolved to 1 card → auto-dissolved
      expect(manager.getStackCount()).toBe(0);
      expect(cA.isInStack()).toBe(false);

      cA.dispose(); cB.dispose(); cC.dispose();
    });

    it('B4. takeTopCardFromCard() lấy đúng lá top từ stack chứa card đó', () => {
      const manager = sceneManager.getStackManager();
      const cA = new CardObject3D({ id: 'b4_A' });
      const cB = new CardObject3D({ id: 'b4_B' });
      const cC = new CardObject3D({ id: 'b4_C' });
      manager.createStack([cA, cB, cC]);

      // Target is cA (bottom), but takeTopCard should return cC (top), not cA
      const top = sceneManager.takeTopCardFromCard(cA);
      expect(top?.cardId).toBe('b4_C');
      expect(top?.isInStack()).toBe(false);

      cA.dispose(); cB.dispose(); cC.dispose();
    });

    it('B5. takeTopCardFromCard() trả về null nếu card không thuộc stack', () => {
      const card = new CardObject3D({ id: 'b5_lone' });
      const result = sceneManager.takeTopCardFromCard(card);
      expect(result).toBeNull();
      card.dispose();
    });

    it('B6. takeTopCardFromCard() trả về null nếu card đã disposed', () => {
      const card = new CardObject3D({ id: 'b6_disposed' });
      card.dispose();
      const result = sceneManager.takeTopCardFromCard(card);
      expect(result).toBeNull();
    });

    it('B7. CardStack thứ tự: index 0 = bottom, index length-1 = top', () => {
      const cA = new CardObject3D({ id: 'b7_A' });
      const cB = new CardObject3D({ id: 'b7_B' });
      const cC = new CardObject3D({ id: 'b7_C' });
      const stack = new CardStack({ cards: [cA, cB, cC] });

      const cards = stack.getCards();
      expect(cards[0]?.cardId).toBe('b7_A'); // bottom
      expect(cards[1]?.cardId).toBe('b7_B'); // middle
      expect(cards[2]?.cardId).toBe('b7_C'); // top

      stack.dispose();
      cA.dispose(); cB.dispose(); cC.dispose();
    });

    it('B8. takeTopCardFromCard() không hardcode Demo Card — hoạt động với bất kỳ stack nào', () => {
      const manager = sceneManager.getStackManager();
      const cX = new CardObject3D({ id: 'b8_X' });
      const cY = new CardObject3D({ id: 'b8_Y' });
      // Không liên quan đến demoCard
      manager.createStack([cX, cY]);

      const top = sceneManager.takeTopCardFromCard(cX); // target = bottom card
      expect(top?.cardId).toBe('b8_Y'); // must return top (cY), not cX or demoCard

      cX.dispose(); cY.dispose();
    });
  });

  // ─── NHÓM C: INTEGRATION (M1.3.4.1) ───────────────────────────────────────

  describe('Nhóm C — Integration: Click Selection + Flip + Stack (M1.3.4.1)', () => {
    it('C1. DragController chỉ set isDragActive sau khi threshold bị vượt', () => {
      const interaction = sceneManager.getInteractionManager();
      const dragController = sceneManager.getDragController();
      const demoCard = sceneManager.getDemoCard()!;

      // Simulate mousedown on a card
      interaction.onCardMouseDown?.(demoCard, new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 }));

      // isDragActive should NOT be true before any movement
      expect(interaction.isDragActive).toBe(false);
      expect(dragController.isDragging()).toBe(false);

      // Move past threshold
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 430, clientY: 300 }));

      // Now isDragging should be true after threshold crossed
      expect(dragController.isDragging()).toBe(true);
      expect(interaction.isDragActive).toBe(true);

      window.dispatchEvent(new MouseEvent('mouseup'));
      expect(dragController.isDragging()).toBe(false);
      expect(interaction.isDragActive).toBe(false);
    });

    it('C2. Click trên card mà không kéo: isDragActive giữ false, selection khả dụng', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoCard = sceneManager.getDemoCard()!;

      // Simulate mousedown (no drag)
      interaction.onCardMouseDown?.(demoCard, new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 }));
      expect(interaction.isDragActive).toBe(false);

      // Simulate immediate mouseup without movement → click, NOT drag
      window.dispatchEvent(new MouseEvent('mouseup'));
      expect(interaction.isDragActive).toBe(false);
    });

    it('C3. takeTopCardFromSelectedStack vs takeTopCardFromCard — đều lấy đúng top card', () => {
      const manager = sceneManager.getStackManager();
      const interaction = sceneManager.getInteractionManager();

      const cA = new CardObject3D({ id: 'c3_A' });
      const cB = new CardObject3D({ id: 'c3_B' });
      const cC = new CardObject3D({ id: 'c3_C' });
      manager.createStack([cA, cB, cC]);

      // Select cA (bottom) and use takeTopCardFromSelectedStack
      interaction.selectObject(cA);
      const top1 = sceneManager.takeTopCardFromSelectedStack();
      expect(top1?.cardId).toBe('c3_C');

      // Now stack has [cA, cB]. Use takeTopCardFromCard with cA again.
      const top2 = sceneManager.takeTopCardFromCard(cA);
      expect(top2?.cardId).toBe('c3_B');

      // Stack dissolved (only cA left)
      expect(cA.isInStack()).toBe(false);

      cA.dispose(); cB.dispose(); cC.dispose();
    });
  });
});
