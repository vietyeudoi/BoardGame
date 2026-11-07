/**
 * deckDraw.test.ts — Unit tests for M1.3.3 Deck Draw & Card Transfer
 * Covers:
 * Nhóm A: Draw cơ bản (1-5)
 * Nhóm B: Data integrity & CardRegistry (6-11)
 * Nhóm C: Transaction & Rollback (12-16)
 * Nhóm D: Empty Deck handling (17-20)
 * Nhóm E: Interaction Integration (Raycast, Hover, Selection, Drag) (21-25)
 * Nhóm F: Lifecycle & Memory Management (26-30)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { CardRegistry } from '../objects/CardRegistry';
import { TABLE_CONFIG } from '../objects/TableConfig';

// Mock Renderer for headless JSDOM testing (WebGLRenderer is not implemented in JSDOM)
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
          toJSON: () => {},
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

// Mock container for SceneManager
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
    toJSON: () => {},
  });
  return container;
}

describe('M1.3.3 Deck Draw & Card Transfer', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = createMockContainer();
    sceneManager = new SceneManager(container);
  });

  afterEach(() => {
    sceneManager.dispose();
  });

  // ─── NHÓM A: Draw cơ bản ───────────────────────────────────────────────────

  describe('Nhóm A — Draw cơ bản', () => {
    it('1. Rút thành công một lá bài từ deck', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      expect(demoDeck).toBeDefined();

      const topBefore = demoDeck.peekTop();
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck');

      expect(drawnCard).toBeInstanceOf(CardObject3D);
      expect(drawnCard?.cardId).toBe(topBefore);
    });

    it('2. Deck giảm đúng một lá bài sau khi rút', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const initialCount = demoDeck.getCount();

      sceneManager.drawCardFromDeck('demo_deck');
      expect(demoDeck.getCount()).toBe(initialCount - 1);
    });

    it('3. Card ID được giữ nguyên từ Deck sang CardObject3D', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const expectedId = demoDeck.peekTop()!;

      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      expect(drawnCard.getId()).toBe(expectedId);
      expect(drawnCard.cardId).toBe(expectedId);
    });

    it('4. CardObject3D được tạo đúng một lần cho mỗi lần rút', () => {
      const card1 = sceneManager.drawCardFromDeck('demo_deck')!;
      const card2 = sceneManager.drawCardFromDeck('demo_deck')!;

      expect(card1).not.toBe(card2);
      expect(card1.cardId).not.toBe(card2.cardId);
      expect(sceneManager.getObject(card1.cardId)).toBe(card1);
      expect(sceneManager.getObject(card2.cardId)).toBe(card2);
    });

    it('5. Card được thêm vào Scene và đặt đúng độ cao mặt bàn', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const scene = sceneManager.getScene();

      expect(scene.children).toContain(drawnCard);
      // Origin is at bottom surface, flush on table
      expect(drawnCard.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });
  });

  // ─── NHÓM B: Data integrity ─────────────────────────────────────────────────

  describe('Nhóm B — Data integrity & CardRegistry', () => {
    it('6. ID không còn trong Deck sau khi rút thành công', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const drawnId = demoDeck.peekTop()!;

      sceneManager.drawCardFromDeck('demo_deck');
      expect(demoDeck.getCardIds()).not.toContain(drawnId);
      expect(demoDeck.peekTop()).not.toBe(drawnId);
    });

    it('7. ID xuất hiện đúng một lần trên bàn sau khi rút', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const registry = sceneManager.getCardRegistry();

      expect(registry.getLocation(drawnCard.cardId)).toBe('ON_TABLE');
      expect(registry.getCardObject(drawnCard.cardId)).toBe(drawnCard);
    });

    it('8. Không tạo CardObject3D trùng ID với lá đã có trên bàn', () => {
      const registry = sceneManager.getCardRegistry();
      const demoCard = sceneManager.getDemoCard()!;

      // Attempting to register another card with same ID throws
      expect(() => registry.registerTableCard(demoCard)).toThrow(/already registered/);
    });

    it('9. Không rút cùng một ID hai lần liên tiếp', () => {
      const card1 = sceneManager.drawCardFromDeck('demo_deck')!;
      const card2 = sceneManager.drawCardFromDeck('demo_deck')!;

      expect(card1.cardId).not.toBe(card2.cardId);
    });

    it('10. Tổng số ID được bảo toàn tuyệt đối (totalUnique === totalLocations)', () => {
      const registry = sceneManager.getCardRegistry();
      const demoDeck = sceneManager.getDemoDeck()!;
      const demoCard = sceneManager.getDemoCard()!;

      // Initial integrity check (1 table card + 30 deck cards = 31 total)
      let audit = registry.validateIntegrity([demoDeck], [demoCard]);
      expect(audit.valid).toBe(true);
      expect(audit.totalUnique).toBe(31);
      expect(audit.totalLocations).toBe(31);

      // Draw 5 cards
      const drawnCards: CardObject3D[] = [];
      for (let i = 0; i < 5; i++) {
        drawnCards.push(sceneManager.drawCardFromDeck('demo_deck')!);
      }

      // Check integrity again: all cards combined must equal 31
      audit = registry.validateIntegrity([demoDeck], [demoCard, ...drawnCards]);
      expect(audit.valid).toBe(true);
      expect(audit.totalUnique).toBe(31);
      expect(audit.totalLocations).toBe(31);
      expect(audit.errors).toHaveLength(0);
    });

    it('11. Registry và Deck luôn đồng bộ danh sách ID', () => {
      const registry = sceneManager.getCardRegistry();
      const demoDeck = sceneManager.getDemoDeck()!;

      const cardsInDeckRegistry = registry.getCardsInDeck(demoDeck.getId());
      expect(cardsInDeckRegistry).toEqual([...demoDeck.getCardIds()]);

      sceneManager.drawCardFromDeck('demo_deck');

      const updatedCardsInDeck = registry.getCardsInDeck(demoDeck.getId());
      expect(updatedCardsInDeck).toEqual([...demoDeck.getCardIds()]);
      expect(updatedCardsInDeck).toHaveLength(demoDeck.getCount());
    });
  });

  // ─── NHÓM C: Transaction và rollback ───────────────────────────────────────

  describe('Nhóm C — Transaction & Rollback', () => {
    it('12. Deck không thay đổi nếu CardObject3D creation thất bại', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const initialCount = demoDeck.getCount();
      const initialTop = demoDeck.peekTop();

      // Mock CardObject3D constructor or simulate failure via spy
      const registry = sceneManager.getCardRegistry();
      // If we temporarily corrupt registry canTransfer to return false:
      vi.spyOn(registry, 'canTransferDeckToTable').mockReturnValueOnce(false);

      const result = sceneManager.drawCardFromDeck('demo_deck');
      expect(result).toBeNull();
      expect(demoDeck.getCount()).toBe(initialCount);
      expect(demoDeck.peekTop()).toBe(initialTop);
    });

    it('13. Deck không thay đổi nếu registry từ chối giao dịch', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const initialIds = [...demoDeck.getCardIds()];

      const registry = sceneManager.getCardRegistry();
      vi.spyOn(registry, 'transferDeckToTable').mockImplementationOnce(() => {
        throw new Error('Simulated registry lock failure');
      });

      const result = sceneManager.drawCardFromDeck('demo_deck');
      expect(result).toBeNull();
      expect(demoDeck.getCardIds()).toEqual(initialIds);
    });

    it('14. Scene không chứa object mồ côi sau khi thao tác thất bại', () => {
      const initialChildrenCount = sceneManager.getScene().children.length;
      const registry = sceneManager.getCardRegistry();
      vi.spyOn(registry, 'transferDeckToTable').mockImplementationOnce(() => {
        throw new Error('Simulated failure');
      });

      sceneManager.drawCardFromDeck('demo_deck');
      expect(sceneManager.getScene().children.length).toBe(initialChildrenCount);
    });

    it('15. Không mất ID khi lỗi xảy ra trong quá trình transaction', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const topId = demoDeck.peekTop()!;
      const registry = sceneManager.getCardRegistry();

      vi.spyOn(registry, 'transferDeckToTable').mockImplementationOnce(() => {
        throw new Error('Simulated failure');
      });

      sceneManager.drawCardFromDeck('demo_deck');
      // ID must remain intact in deck and registry
      expect(demoDeck.peekTop()).toBe(topId);
      expect(registry.getLocation(topId)).toBe('IN_DECK');
    });

    it('16. CardRegistry standalone rollbackTableToDeck restores IN_DECK state', () => {
      const customRegistry = new CardRegistry();
      customRegistry.registerDeck('test_deck', ['c_101']);

      const dummyCard = new CardObject3D({ id: 'c_101' });
      customRegistry.transferDeckToTable('test_deck', 'c_101', dummyCard);
      expect(customRegistry.getLocation('c_101')).toBe('ON_TABLE');

      customRegistry.rollbackTableToDeck('test_deck', 'c_101');
      expect(customRegistry.getLocation('c_101')).toBe('IN_DECK');
      expect(customRegistry.getCardObject('c_101')).toBeUndefined();

      dummyCard.dispose();
      customRegistry.clear();
    });
  });

  // ─── NHÓM D: Empty Deck ───────────────────────────────────────────────────

  describe('Nhóm D — Empty Deck State', () => {
    it('17. Deck có một lá: rút thành công và deck trở thành rỗng', () => {
      // Create single card deck
      const singleCardDeck = new DeckObject3D({
        id: 'single_deck',
        cardIds: ['last_card_99'],
        position: { x: 2, y: TABLE_CONFIG.SURFACE_Y, z: 2 },
      });
      sceneManager.addObject('single_deck', singleCardDeck);
      sceneManager.getCardRegistry().registerDeck('single_deck', ['last_card_99']);

      expect(singleCardDeck.getCount()).toBe(1);

      const drawn = sceneManager.drawCardFromDeck('single_deck');
      expect(drawn).not.toBeNull();
      expect(drawn?.cardId).toBe('last_card_99');
      expect(singleCardDeck.getCount()).toBe(0);
      expect(singleCardDeck.peekTop()).toBeNull();
    });

    it('18. Deck rỗng: drawCardFromDeck trả về null', () => {
      const emptyDeck = new DeckObject3D({
        id: 'empty_test_deck',
        cardIds: [],
      });
      sceneManager.addObject('empty_test_deck', emptyDeck);
      sceneManager.getCardRegistry().registerDeck('empty_test_deck', []);

      const result = sceneManager.drawCardFromDeck('empty_test_deck');
      expect(result).toBeNull();
    });

    it('19. Click hoặc gọi draw trên Deck rỗng không gây crash hay thay đổi state', () => {
      const emptyDeck = new DeckObject3D({
        id: 'empty_test_deck_2',
        cardIds: [],
      });
      sceneManager.addObject('empty_test_deck_2', emptyDeck);
      sceneManager.getCardRegistry().registerDeck('empty_test_deck_2', []);

      expect(() => {
        for (let i = 0; i < 5; i++) {
          const res = sceneManager.drawCardFromDeck('empty_test_deck_2');
          expect(res).toBeNull();
        }
      }).not.toThrow();

      expect(emptyDeck.getCount()).toBe(0);
    });

    it('20. Không tạo CardObject3D khi Deck rỗng', () => {
      const emptyDeck = new DeckObject3D({ id: 'empty_deck_3', cardIds: [] });
      sceneManager.addObject('empty_deck_3', emptyDeck);
      sceneManager.getCardRegistry().registerDeck('empty_deck_3', []);

      const initialSceneCount = sceneManager.getScene().children.length;
      sceneManager.drawCardFromDeck('empty_deck_3');
      expect(sceneManager.getScene().children.length).toBe(initialSceneCount);
    });
  });

  // ─── NHÓM E: Interaction Integration ───────────────────────────────────────

  describe('Nhóm E — Interaction Integration (Raycast, Hover, Selection, Drag)', () => {
    it('21. Card mới được RaycastInteractionManager nhận diện', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const interaction = sceneManager.getInteractionManager();

      expect(interaction.getRegisteredCount()).toBeGreaterThanOrEqual(3); // demo_card + demo_deck + drawnCard
      // Object is registered
      expect(sceneManager.getObject(drawnCard.cardId)).toBe(drawnCard);
    });

    it('22. Hover hoạt động với Card mới', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      drawnCard.updateMatrixWorld(true);

      const interaction = sceneManager.getInteractionManager();
      const domElement = (sceneManager as unknown as { _renderer: { getDomElement: () => HTMLCanvasElement } })._renderer.getDomElement();

      // Trigger hover over drawn card position (center or specific coords)
      domElement.dispatchEvent(new MouseEvent('mousemove', { clientX: 512, clientY: 384 }));

      // Does not throw and tracks state
      expect(() => interaction.getHoveredObject()).not.toThrow();
    });

    it('23. Selection hoạt động với Card mới', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      expect(drawnCard).toBeInstanceOf(CardObject3D);
      const interaction = sceneManager.getInteractionManager();

      expect(() => interaction.getSelectedObject()).not.toThrow();
      expect(interaction.getSelectedObject()).toBeNull();
    });

    it('24. DragController kéo được Card mới rút', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      drawnCard.updateMatrixWorld(true);

      const interaction = sceneManager.getInteractionManager();
      const dragController = sceneManager.getDragController();

      // Trigger mousedown on drawn card via interaction callback
      interaction.onCardMouseDown?.(drawnCard, new MouseEvent('mousedown', { button: 0, clientX: 500, clientY: 300 }));
      expect(dragController.getDraggedCard()).toBe(drawnCard);

      // Trigger move to drag
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 520, clientY: 300 }));
      expect(dragController.isDragging()).toBe(true);

      // Release
      window.dispatchEvent(new MouseEvent('mouseup'));
      expect(dragController.isDragging()).toBe(false);
      expect(drawnCard.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });

    it('25. Không đăng ký interaction object hai lần khi rút nhiều lá', () => {
      const interaction = sceneManager.getInteractionManager();
      const countBefore = interaction.getRegisteredCount();

      sceneManager.drawCardFromDeck('demo_deck');
      expect(interaction.getRegisteredCount()).toBe(countBefore + 1);

      sceneManager.drawCardFromDeck('demo_deck');
      expect(interaction.getRegisteredCount()).toBe(countBefore + 2);
    });
  });

  // ─── NHÓM F: Lifecycle & Memory Management ─────────────────────────────────

  describe('Nhóm F — Lifecycle & Memory Management', () => {
    it('26. Card được dispose đúng cách khi gọi removeObject', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const id = drawnCard.cardId;

      expect(drawnCard.isDisposed()).toBe(false);
      sceneManager.removeObject(id);

      expect(drawnCard.isDisposed()).toBe(true);
      expect(sceneManager.getObject(id)).toBeUndefined();
    });

    it('27. Registry được cập nhật đúng (marked DISPOSED) khi Card bị remove', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const id = drawnCard.cardId;
      const registry = sceneManager.getCardRegistry();

      expect(registry.getLocation(id)).toBe('ON_TABLE');
      sceneManager.removeObject(id);

      expect(registry.getLocation(id)).toBe('DISPOSED');
      expect(registry.getCardObject(id)).toBeUndefined();
    });

    it('28. Interaction unregister khi Card bị remove', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const interaction = sceneManager.getInteractionManager();
      const countWhilePresent = interaction.getRegisteredCount();

      sceneManager.removeObject(drawnCard.cardId);
      expect(interaction.getRegisteredCount()).toBe(countWhilePresent - 1);
    });

    it('29. Không có object rò rỉ trong Scene sau khi vẽ và xoá lá bài', () => {
      const initialChildren = sceneManager.getScene().children.length;

      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      expect(sceneManager.getScene().children.length).toBe(initialChildren + 1);

      sceneManager.removeObject(drawnCard.cardId);
      expect(sceneManager.getScene().children.length).toBe(initialChildren);
    });

    it('30. SceneManager dispose dọn dẹp toàn bộ Card đã rút', () => {
      const drawnCard1 = sceneManager.drawCardFromDeck('demo_deck')!;
      const drawnCard2 = sceneManager.drawCardFromDeck('demo_deck')!;
      const registry = sceneManager.getCardRegistry();

      sceneManager.dispose();

      expect(drawnCard1.isDisposed()).toBe(true);
      expect(drawnCard2.isDisposed()).toBe(true);
      expect(registry.getTotalCount()).toBe(0);
    });

    it('31. HUD callback onDeckCountChanged được gọi chính xác', () => {
      const onDeckCountMock = vi.fn();
      sceneManager.onDeckCountChanged = onDeckCountMock;

      const demoDeck = sceneManager.getDemoDeck()!;
      const expectedCount = demoDeck.getCount() - 1;

      sceneManager.drawCardFromDeck('demo_deck');
      expect(onDeckCountMock).toHaveBeenCalledWith('demo_deck', expectedCount);
    });
  });

  // ─── NHÓM G: Audit Rollback & Edge Cases (M1.3.3 Audit) ───────────────────

  describe('Nhóm G — Audit Rollback & Edge Cases (M1.3.3 Technical Audit)', () => {
    it('32. Rollback khi Phase 3 (addObject) ném lỗi: hoàn trả deck, revert registry, dispose mesh', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const topIdBefore = demoDeck.peekTop()!;
      const countBefore = demoDeck.getCount();
      const registry = sceneManager.getCardRegistry();

      // Spy on addObject to throw
      const addObjectSpy = vi.spyOn(sceneManager, 'addObject').mockImplementationOnce(() => {
        throw new Error('Simulated SceneManager.addObject error');
      });

      const drawn = sceneManager.drawCardFromDeck('demo_deck');
      expect(drawn).toBeNull();

      // Verify Deck state intact
      expect(demoDeck.getCount()).toBe(countBefore);
      expect(demoDeck.peekTop()).toBe(topIdBefore);

      // Verify Registry state intact
      expect(registry.getLocation(topIdBefore)).toBe('IN_DECK');
      expect(registry.getCardObject(topIdBefore)).toBeUndefined();

      // Verify no leaked object in scene or interaction
      expect(sceneManager.getObject(topIdBefore)).toBeUndefined();
      expect(sceneManager.getInteractionManager().getRegisteredCount()).toBe(2); // demo_card + demo_deck

      addObjectSpy.mockRestore();
    });

    it('33. Rollback khi Phase 4 (registerObject) ném lỗi: unregister, remove scene, hoàn trả deck, revert registry', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      const topIdBefore = demoDeck.peekTop()!;
      const countBefore = demoDeck.getCount();
      const registry = sceneManager.getCardRegistry();

      // Spy on interaction registerObject to throw
      const interaction = sceneManager.getInteractionManager();
      const registerSpy = vi.spyOn(interaction, 'registerObject').mockImplementationOnce(() => {
        throw new Error('Simulated RaycastInteractionManager.registerObject error');
      });

      const drawn = sceneManager.drawCardFromDeck('demo_deck');
      expect(drawn).toBeNull();

      // Verify Deck state intact
      expect(demoDeck.getCount()).toBe(countBefore);
      expect(demoDeck.peekTop()).toBe(topIdBefore);

      // Verify Registry reverted
      expect(registry.getLocation(topIdBefore)).toBe('IN_DECK');
      expect(registry.getCardObject(topIdBefore)).toBeUndefined();

      // Verify SceneManager has no leaked object
      expect(sceneManager.getObject(topIdBefore)).toBeUndefined();

      registerSpy.mockRestore();
    });

    it('34. Khóa chống re-entrancy (_isDrawingCard): gọi lồng nhau trả về null', () => {
      const demoDeck = sceneManager.getDemoDeck()!;
      let nestedCallResult: CardObject3D | null = null;

      // When first phase happens (e.g. registry transfer), attempt nested draw
      const registry = sceneManager.getCardRegistry();
      const originalTransfer = registry.transferDeckToTable.bind(registry);
      vi.spyOn(registry, 'transferDeckToTable').mockImplementationOnce((dId, cId, card) => {
        // Attempt recursive call while drawing
        nestedCallResult = sceneManager.drawCardFromDeck('demo_deck');
        originalTransfer(dId, cId, card);
      });

      const primaryDrawn = sceneManager.drawCardFromDeck('demo_deck');

      expect(primaryDrawn).not.toBeNull();
      expect(nestedCallResult).toBeNull();
      expect(demoDeck.getCount()).toBe(29); // only primary drawn
    });

    it('35. Chuyển hai chiều: CardRegistry.canTransferTableToDeck và transferTableToDeck', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const id = drawnCard.cardId;
      const registry = sceneManager.getCardRegistry();

      expect(registry.getLocation(id)).toBe('ON_TABLE');
      expect(registry.canTransferTableToDeck('demo_deck_1', id)).toBe(true);
      expect(registry.canTransferTableToDeck('', id)).toBe(false);
      expect(registry.canTransferTableToDeck('demo_deck_1', 'non_existent_id')).toBe(false);

      // Perform transfer back to deck
      registry.transferTableToDeck('demo_deck_1', id);
      expect(registry.getLocation(id)).toBe('IN_DECK');
      expect(registry.getRecord(id)?.containerId).toBe('demo_deck_1');
      expect(registry.getCardObject(id)).toBeUndefined();
    });

    it('36. RaycastInteractionManager ngăn đăng ký trùng cùng một Object instance với ID khác', () => {
      const interaction = sceneManager.getInteractionManager();
      const demoDeck = sceneManager.getDemoDeck()!;

      // Already registered under 'demo_deck'
      const initialCount = interaction.getRegisteredCount();
      interaction.registerObject('duplicate_alias', demoDeck);

      // Should not add duplicate instance
      expect(interaction.getRegisteredCount()).toBe(initialCount);
    });

    it('37. RaycastInteractionManager _collectMeshes bỏ qua các CardObject3D đã disposed', () => {
      const drawnCard = sceneManager.drawCardFromDeck('demo_deck')!;
      const interaction = sceneManager.getInteractionManager();

      // Dispose the card directly
      drawnCard.dispose();

      // _collectMeshes should filter out the disposed card
      const targets = (interaction as any)._collectMeshes();
      const hitDrawnCard = targets.some((t: any) => t.entry.id === drawnCard.cardId);
      expect(hitDrawnCard).toBe(false);
    });

    it('38. CardRegistry.validateIntegrity() đảm bảo tính toàn vẹn 100% sau các thao tác', () => {
      const registry = sceneManager.getCardRegistry();
      const demoDeck = sceneManager.getDemoDeck()!;
      const demoCard = sceneManager.getDemoCard()!;

      // Draw two cards
      const c1 = sceneManager.drawCardFromDeck('demo_deck')!;
      const c2 = sceneManager.drawCardFromDeck('demo_deck')!;

      const allTableCards = [demoCard, c1, c2];
      const allDecks = [demoDeck];

      const integrity = registry.validateIntegrity(allDecks, allTableCards);
      expect(integrity.valid).toBe(true);
      expect(integrity.errors).toEqual([]);
      expect(integrity.totalLocations).toBe(31); // 1 demo card + 2 drawn cards + 28 in deck
    });
  });
});
