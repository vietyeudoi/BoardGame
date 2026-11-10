/**
 * deckObject3D.test.ts — Comprehensive Unit Tests for M1.2.2 DeckObject3D
 * Covers Initialization, Card Management, Fisher-Yates Shuffle, Geometry, Dynamic Updates, and Lifecycle.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { DeckObject3D } from '../objects/DeckObject3D';
import { DECK_CONFIG } from '../objects/DeckConfig';
import { TABLE_CONFIG } from '../objects/TableConfig';

describe('DeckObject3D (M1.2.2)', () => {
  let deck: DeckObject3D;
  const initialCards = ['card_1', 'card_2', 'card_3', 'card_4', 'card_5'];

  beforeEach(() => {
    deck = new DeckObject3D({
      id: 'test_deck_1',
      cardIds: initialCards,
    });
  });

  afterEach(() => {
    if (!deck.isDisposed()) {
      deck.dispose();
    }
  });

  // ─── Nhóm 1: Khởi tạo ─────────────────────────────────────────────────────

  describe('Nhóm 1 — Khởi tạo (Initialization)', () => {
    it('creates DeckObject3D instance successfully', () => {
      expect(deck).toBeInstanceOf(DeckObject3D);
      expect(deck).toBeInstanceOf(THREE.Group);
    });

    it('stores ID accurately and matches getId()', () => {
      expect(deck.getId()).toBe('test_deck_1');
      expect(deck.deckId).toBe('test_deck_1');
    });

    it('generates unique auto-id when id option is omitted', () => {
      const autoDeck1 = new DeckObject3D();
      const autoDeck2 = new DeckObject3D();
      expect(autoDeck1.getId()).not.toBe(autoDeck2.getId());
      expect(autoDeck1.getId()).toMatch(/^deck_/);
      autoDeck1.dispose();
      autoDeck2.dispose();
    });

    it('creates empty deck with count = 0 when cardIds is omitted', () => {
      const emptyDeck = new DeckObject3D();
      expect(emptyDeck.getCount()).toBe(0);
      expect(emptyDeck.getCardIds()).toEqual([]);
      expect(emptyDeck.peekTop()).toBeNull();
      emptyDeck.dispose();
    });

    it('initializes with valid cardIds preserving count and order', () => {
      expect(deck.getCount()).toBe(5);
      expect(deck.getCardIds()).toEqual(initialCards);
    });

    it('rejects empty or whitespace-only card IDs during initialization', () => {
      expect(() => {
        new DeckObject3D({ cardIds: ['card_1', '', 'card_3'] });
      }).toThrow(/empty or invalid string/i);

      expect(() => {
        new DeckObject3D({ cardIds: ['card_1', '   '] });
      }).toThrow(/empty or invalid string/i);
    });

    it('rejects duplicate card IDs during initialization', () => {
      expect(() => {
        new DeckObject3D({ cardIds: ['card_1', 'card_2', 'card_1'] });
      }).toThrow(/Duplicate card ID/i);
    });

    it('inherits dimensions from CardConfig via DeckConfig', () => {
      expect(deck.deckWidth).toBe(DECK_CONFIG.WIDTH);
      expect(deck.deckHeight).toBe(DECK_CONFIG.HEIGHT);
      expect(deck.cardThickness).toBe(DECK_CONFIG.CARD_THICKNESS);
      expect(deck.cornerRadius).toBe(DECK_CONFIG.CORNER_RADIUS);
    });
  });

  // ─── Nhóm 2: Quản lý bài ──────────────────────────────────────────────────

  describe('Nhóm 2 — Quản lý bài (Card Collection Management)', () => {
    it('getCount returns exact number of cards', () => {
      expect(deck.getCount()).toBe(5);
    });

    it('getCardIds returns a copy and prevents external mutation of internal state', () => {
      const ids = deck.getCardIds() as string[];
      ids.push('malicious_card');
      ids[0] = 'corrupted_id';

      // Internal deck state must remain intact
      expect(deck.getCount()).toBe(5);
      expect(deck.getCardIds()).toEqual(initialCards);
    });

    it('peekTop returns the top card (last element) without removing it', () => {
      expect(deck.peekTop()).toBe('card_5');
      expect(deck.getCount()).toBe(5);
      expect(deck.peekTop()).toBe('card_5');
    });

    it('peekTop on empty deck returns null', () => {
      const emptyDeck = new DeckObject3D();
      expect(emptyDeck.peekTop()).toBeNull();
      emptyDeck.dispose();
    });

    it('draw removes and returns the top card in LIFO order', () => {
      expect(deck.draw()).toBe('card_5');
      expect(deck.getCount()).toBe(4);
      expect(deck.peekTop()).toBe('card_4');

      expect(deck.draw()).toBe('card_4');
      expect(deck.getCount()).toBe(3);
    });

    it('draw on empty deck returns null without throwing', () => {
      const emptyDeck = new DeckObject3D();
      expect(emptyDeck.draw()).toBeNull();
      expect(emptyDeck.getCount()).toBe(0);
      emptyDeck.dispose();
    });

    it('addCard pushes to the top of the deck', () => {
      deck.addCard('card_6');
      expect(deck.getCount()).toBe(6);
      expect(deck.peekTop()).toBe('card_6');
      expect(deck.getCardIds()[5]).toBe('card_6');
    });

    it('addCard rejects empty strings and duplicates', () => {
      expect(() => deck.addCard('')).toThrow(/empty/i);
      expect(() => deck.addCard('   ')).toThrow(/empty/i);
      expect(() => deck.addCard('card_1')).toThrow(/already exists/i);
      expect(deck.getCount()).toBe(5);
    });

    it('addCards adds multiple cards in specified order to the top', () => {
      deck.addCards(['card_6', 'card_7', 'card_8']);
      expect(deck.getCount()).toBe(8);
      expect(deck.peekTop()).toBe('card_8');
      expect(deck.getCardIds().slice(5)).toEqual(['card_6', 'card_7', 'card_8']);
    });

    it('addCards rejects duplicates and fails atomically', () => {
      // 'card_2' already exists in deck
      expect(() => deck.addCards(['card_6', 'card_2'])).toThrow(/already exists/i);
      // Ensure no cards were partially added
      expect(deck.getCount()).toBe(5);

      // Duplicate within the parameter list
      expect(() => deck.addCards(['card_new_1', 'card_new_1'])).toThrow(/duplicate/i);
      expect(deck.getCount()).toBe(5);
    });
  });

  // ─── Nhóm 3: Shuffle ──────────────────────────────────────────────────────

  describe('Nhóm 3 — Shuffle (Fisher-Yates)', () => {
    it('shuffle maintains exact count', () => {
      deck.shuffle();
      expect(deck.getCount()).toBe(5);
    });

    it('shuffle preserves the exact set of IDs without additions or losses', () => {
      deck.shuffle();
      const currentIds = deck.getCardIds();
      expect(currentIds).toHaveLength(initialCards.length);
      expect(new Set(currentIds)).toEqual(new Set(initialCards));
    });

    it('shuffle operates safely on empty and single-card decks', () => {
      const emptyDeck = new DeckObject3D();
      expect(() => emptyDeck.shuffle()).not.toThrow();
      expect(emptyDeck.getCount()).toBe(0);
      emptyDeck.dispose();

      const singleDeck = new DeckObject3D({ cardIds: ['solo'] });
      expect(() => singleDeck.shuffle()).not.toThrow();
      expect(singleDeck.peekTop()).toBe('solo');
      singleDeck.dispose();
    });

    it('shuffle produces deterministic permutation with controlled RNG', () => {
      const testDeck = new DeckObject3D({
        cardIds: ['A', 'B', 'C', 'D'],
      });

      // Deterministic reverse swap RNG
      // For i = 3: j = 0 -> swap A and D -> [D, B, C, A]
      // For i = 2: j = 1 -> swap B and C -> [D, C, B, A]
      // For i = 1: j = 0 -> swap D and C -> [C, D, B, A]
      const rngSequence = [0, 0.49, 0];
      let callCount = 0;
      const mockRng = (): number => rngSequence[callCount++] ?? 0;

      testDeck.shuffle(mockRng);
      expect(testDeck.getCardIds()).toEqual(['C', 'D', 'B', 'A']);
      testDeck.dispose();
    });
  });

  // ─── Nhóm 4: Hình học ─────────────────────────────────────────────────────

  describe('Nhóm 4 — Hình học (Geometry & Mesh)', () => {
    it('contains a 3D Mesh with 3 discrete material groups', () => {
      const mesh = deck.getMesh();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
      expect(mesh.geometry.groups.length).toBe(3);

      expect(mesh.geometry.groups[0].materialIndex).toBe(0); // Top cap
      expect(mesh.geometry.groups[1].materialIndex).toBe(1); // Bottom cap
      expect(mesh.geometry.groups[2].materialIndex).toBe(2); // Layered sides

      expect(Array.isArray(mesh.material)).toBe(true);
      expect((mesh.material as THREE.Material[]).length).toBe(3);
    });

    it('has width and height matching DeckConfig', () => {
      expect(deck.deckWidth).toBe(DECK_CONFIG.WIDTH);
      expect(deck.deckHeight).toBe(DECK_CONFIG.HEIGHT);
    });

    it('chiều cao hình ảnh luôn bằng một lá', () => {
      const expectedHeight = DECK_CONFIG.CARD_THICKNESS;
      expect(deck.getVisualHeight()).toBeCloseTo(expectedHeight, 4);
    });

    it('bottom surface rests flush on table surface at TABLE_CONFIG.SURFACE_Y', () => {
      deck.setPosition(0, TABLE_CONFIG.SURFACE_Y, 0);
      expect(deck.getBottomY()).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
    });

    it('mặt trên luôn nằm ở độ cao một lá', () => {
      deck.setPosition(0, TABLE_CONFIG.SURFACE_Y, 0);
      const expectedTop = TABLE_CONFIG.SURFACE_Y + DECK_CONFIG.CARD_THICKNESS;
      expect(deck.getTopY()).toBeCloseTo(expectedTop, 4);
    });

    it('boundingBox has correct dimensions and non-negative height', () => {
      deck.setPosition(0, TABLE_CONFIG.SURFACE_Y, 0);
      const box = deck.getBoundingBox();

      expect(box.min.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(box.max.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + DECK_CONFIG.CARD_THICKNESS, 4);
      expect(box.max.y - box.min.y).toBeCloseTo(DECK_CONFIG.CARD_THICKNESS, 4);
    });

    it('cả hai chồng cố định giữ cùng mesh và bề dày khi số lá online đổi', () => {
      for (const id of ['draw-pile', 'discard-pile']) {
        const pile = new DeckObject3D({ id });
        pile.resetLocalCards([], true);
        const mesh = pile.getMesh();
        for (const count of [1, 104, 2]) {
          pile.setOnlineCount(count);
          expect(pile.getMesh()).toBe(mesh);
          expect(pile.children.filter(child => child.type === 'Mesh')).toEqual([mesh]);
          expect(pile.getCount()).toBe(count);
          expect(pile.getVisualHeight()).toBe(DECK_CONFIG.CARD_THICKNESS);
          expect(pile.getTopY() - pile.getBottomY()).toBeCloseTo(DECK_CONFIG.CARD_THICKNESS);
        }
        pile.dispose();
      }
    });

    it('empty deck has zero visual height and does not have negative height', () => {
      const emptyDeck = new DeckObject3D();
      emptyDeck.setPosition(0, TABLE_CONFIG.SURFACE_Y, 0);

      expect(emptyDeck.getVisualHeight()).toBe(0);
      const box = emptyDeck.getBoundingBox();
      expect(box.max.y - box.min.y).toBeGreaterThanOrEqual(0);
      expect(emptyDeck.getBottomY()).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 4);
      expect(emptyDeck.getMesh().visible).toBe(true);

      emptyDeck.dispose();
    });
  });

  // ─── Nhóm 5: Cập nhật dữ liệu và hình học ──────────────────────────────────

  describe('Nhóm 5 — Cập nhật dữ liệu & hình học (Dynamic Updates)', () => {
    it('rút một lá không đổi chiều cao nếu bộ vẫn còn bài', () => {
      const initialHeight = deck.getVisualHeight();
      deck.draw();
      const newHeight = deck.getVisualHeight();
      expect(newHeight).toBe(initialHeight);
    });

    it('thêm một lá không đổi chiều cao', () => {
      const initialHeight = deck.getVisualHeight();
      deck.addCard('card_6');
      const newHeight = deck.getVisualHeight();
      expect(newHeight).toBe(initialHeight);
    });

    it('thêm nhiều lá không đổi chiều cao', () => {
      const initialHeight = deck.getVisualHeight();
      deck.addCards(['c6', 'c7', 'c8']);
      const newHeight = deck.getVisualHeight();
      expect(newHeight).toBe(initialHeight);
    });

    it('shuffle does NOT alter visual height or bounding box', () => {
      const heightBefore = deck.getVisualHeight();
      const boxBefore = deck.getBoundingBox();

      deck.shuffle();

      const heightAfter = deck.getVisualHeight();
      const boxAfter = deck.getBoundingBox();

      expect(heightAfter).toBe(heightBefore);
      expect(boxAfter.min.y).toBeCloseTo(boxBefore.min.y, 4);
      expect(boxAfter.max.y).toBeCloseTo(boxBefore.max.y, 4);
    });

    it('geometry instance is preserved across card draws and additions (zero re-allocation)', () => {
      const mesh = deck.getMesh();
      const initialGeometry = mesh.geometry;
      const initialMaterial = mesh.material;

      deck.draw();
      deck.draw();
      deck.addCard('new_card_x');

      // Geometry and materials must NOT be recreated
      expect(mesh.geometry).toBe(initialGeometry);
      expect(mesh.material).toBe(initialMaterial);
    });
  });

  // ─── Nhóm 6: Lifecycle và độc lập ─────────────────────────────────────────

  describe('Nhóm 6 — Lifecycle & Độc lập (Lifecycle & Independence)', () => {
    it('disposes geometry and materials owned by the deck', () => {
      const mesh = deck.getMesh();
      const geoSpy = vi.spyOn(mesh.geometry, 'dispose');
      const materials = mesh.material as THREE.Material[];
      const matSpies = materials.map((m) => vi.spyOn(m, 'dispose'));

      expect(deck.isDisposed()).toBe(false);
      deck.dispose();

      expect(deck.isDisposed()).toBe(true);
      expect(geoSpy).toHaveBeenCalledTimes(1);
      matSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    });

    it('does NOT dispose externally shared topTexture', () => {
      const sharedTexture = new THREE.Texture();
      const texSpy = vi.spyOn(sharedTexture, 'dispose');

      const deckWithShared = new DeckObject3D({
        topTexture: sharedTexture,
        cardIds: ['a', 'b'],
      });

      deckWithShared.dispose();

      // Shared texture must NOT be disposed by the deck
      expect(texSpy).not.toHaveBeenCalled();

      sharedTexture.dispose();
    });

    it('calling dispose multiple times is safe and does not throw', () => {
      expect(() => {
        deck.dispose();
        deck.dispose();
        deck.dispose();
      }).not.toThrow();
      expect(deck.isDisposed()).toBe(true);
    });

    it('mutations after dispose are safe no-ops and do not leak or throw', () => {
      deck.dispose();

      expect(() => {
        deck.draw();
        deck.addCard('phantom');
        deck.shuffle();
        deck.setPosition(1, 2, 3);
        deck.setRotation(0, 1, 0);
        deck.setScale(2, 2, 2);
      }).not.toThrow();
    });

    it('two DeckObject3D instances operate completely independently', () => {
      const deckA = new DeckObject3D({ id: 'deck_A', cardIds: ['A1', 'A2', 'A3'] });
      const deckB = new DeckObject3D({ id: 'deck_B', cardIds: ['B1', 'B2'] });

      expect(deckA.getCount()).toBe(3);
      expect(deckB.getCount()).toBe(2);

      const drawnA = deckA.draw();
      expect(drawnA).toBe('A3');
      expect(deckA.getCount()).toBe(2);
      expect(deckB.getCount()).toBe(2);

      deckB.addCard('B3');
      expect(deckA.getCount()).toBe(2);
      expect(deckB.getCount()).toBe(3);

      expect(deckA.getVisualHeight()).toBe(deckB.getVisualHeight());

      deckA.dispose();
      deckB.dispose();
    });
  });
});

