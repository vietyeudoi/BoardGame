/**
 * handZone150.test.ts — Comprehensive Test Suite for Milestone M1.5.0
 * Private Hand Zone & Card Arrangement System
 *
 * Verifies:
 * - Group A: Hand Zone Geometry & Positioning across 2–8 Players
 * - Group B: Card Ownership & CardRegistry Single Source of Truth
 * - Group C: Adaptive Card Arrangement (1, 2, 5, 10, 20 cards) & Elevation
 * - Group D: Drag & Drop Interactions (Table ↔ Hand, Reordering, Multi-Drag)
 * - Group E: Dynamic Table Adaptation (2 -> 8 -> 2 Player Cycle) & Card Preservation
 * - Group F: Integration Invariants & Regression Safety
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';
import { getTableShape, isPointInsideTable, PlayerCount } from '../objects/TableShapeConfig';
import { TABLE_CONFIG } from '../objects/TableConfig';

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

describe('M1.5.0 — Private Hand Zone & Card Arrangement', () => {
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

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm A: Hand Zone Geometry & Positioning (2–8 Players)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm A — Hand Zone Geometry & Table Layout (2 to 8 Players)', () => {
    const playerCounts: PlayerCount[] = [2, 3, 4, 5, 6, 7, 8];

    it.each(playerCounts)('creates exactly %i hand zones matching player count', (count) => {
      sceneManager.rebuildTable(count);
      const hzm = sceneManager.getHandZoneManager();
      const zones = hzm.getAllHandZones();

      expect(zones).toHaveLength(count);
      expect(hzm.getPlayerCount()).toBe(count);

      for (let i = 0; i < count; i++) {
        const zone = hzm.getHandZoneForPlayer(i);
        expect(zone).toBeDefined();
        expect(zone?.zoneId).toBe(`hand_zone_${i + 1}`);
      }
    });

    it.each(playerCounts)('all hand zone corners remain inside table felt for %i players', (count) => {
      sceneManager.rebuildTable(count);
      const params = getTableShape(count);
      const zones = sceneManager.getHandZoneManager().getAllHandZones();

      for (const zone of zones) {
        const hw = zone.zoneWidth / 2;
        const hd = zone.zoneDepth / 2;
        const rotY = zone.rotation.y;
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);

        // Check all 4 corners of the hand zone
        const localCorners = [
          { x: -hw, z: -hd },
          { x: hw, z: -hd },
          { x: hw, z: hd },
          { x: -hw, z: hd },
        ];

        for (const corner of localCorners) {
          const worldX = zone.position.x + corner.x * cos + corner.z * sin;
          const worldZ = zone.position.z - corner.x * sin + corner.z * cos;
          expect(isPointInsideTable({ x: worldX, z: worldZ }, params, 0)).toBe(true);
        }
      }
    });

    it.each(playerCounts)('hand zones do not overlap with Deck Zone or Discard Zone for %i players', (count) => {
      sceneManager.rebuildTable(count);
      const tzm = sceneManager.getTableZoneManager();
      const deckPos = tzm.getDeckPosition();
      const discardPos = tzm.getDiscardPosition();
      const zones = sceneManager.getHandZoneManager().getAllHandZones();

      for (const zone of zones) {
        // Distance from HandZone center to DeckZone center must be safe
        const distToDeck = Math.hypot(zone.position.x - deckPos.x, zone.position.z - deckPos.z);
        const distToDiscard = Math.hypot(zone.position.x - discardPos.x, zone.position.z - discardPos.z);

        expect(distToDeck).toBeGreaterThan(3.5);
        expect(distToDiscard).toBeGreaterThan(3.5);

        // Deck/Discard center must never be inside any HandZone
        expect(zone.containsPoint(deckPos.x, deckPos.z)).toBe(false);
        expect(zone.containsPoint(discardPos.x, discardPos.z)).toBe(false);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm B: Card Ownership & CardRegistry Single Source of Truth
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm B — Card Ownership & CardRegistry Integrity', () => {
    it('adding a table card to HandZone sets location to IN_HAND and attaches handZoneId', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const hzm = sceneManager.getHandZoneManager();
      const hand1 = hzm.getHandZoneForPlayer(0)!;
      const registry = sceneManager.getCardRegistry();

      expect(registry.getLocation(demoCard.cardId)).toBe('ON_TABLE');
      expect(demoCard.isInHand()).toBe(false);

      // Add to hand
      registry.transferTableToHand(demoCard.cardId, hand1.zoneId);
      hand1.addCard(demoCard);

      expect(demoCard.isInHand()).toBe(true);
      expect(demoCard.getHandZoneId()).toBe(hand1.zoneId);
      expect(registry.getLocation(demoCard.cardId)).toBe('IN_HAND');
      expect(registry.getRecord(demoCard.cardId)?.containerId).toBe(hand1.zoneId);

      // Card cannot be in a stack while in hand
      expect(demoCard.isInStack()).toBe(false);

      // Registry integrity remains valid
      const regCheck = registry.validateIntegrity(sceneManager.getAllDecks(), sceneManager.getAllCards());
      expect(regCheck.valid).toBe(true);
      expect(regCheck.errors).toEqual([]);
    });

    it('removing a card from HandZone does not dispose it and restores ON_TABLE state', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const hzm = sceneManager.getHandZoneManager();
      const hand1 = hzm.getHandZoneForPlayer(0)!;
      const registry = sceneManager.getCardRegistry();

      registry.transferTableToHand(demoCard.cardId, hand1.zoneId);
      hand1.addCard(demoCard);

      // Remove from hand
      const removed = hand1.removeCard(demoCard.cardId);
      registry.transferHandToTable(demoCard.cardId);

      expect(removed).toBe(demoCard);
      expect(demoCard.isDisposed()).toBe(false);
      expect(demoCard.isInHand()).toBe(false);
      expect(demoCard.getHandZoneId()).toBeNull();
      expect(registry.getLocation(demoCard.cardId)).toBe('ON_TABLE');
      expect(registry.getRecord(demoCard.cardId)?.containerId).toBe('table');
    });

    it('transferring card from HandZone to Deck updates CardRegistry atomically', () => {
      const deck = sceneManager.getDemoDeck()!;
      const demoCard = sceneManager.getDemoCard()!;
      const hzm = sceneManager.getHandZoneManager();
      const hand1 = hzm.getHandZoneForPlayer(0)!;
      const registry = sceneManager.getCardRegistry();

      registry.transferTableToHand(demoCard.cardId, hand1.zoneId);
      hand1.addCard(demoCard);

      // Transfer directly from hand to deck
      hand1.removeCard(demoCard.cardId);
      registry.transferHandToDeck(deck.getId(), demoCard.cardId);
      deck.addCard(demoCard.cardId);

      expect(registry.getLocation(demoCard.cardId)).toBe('IN_DECK');
      expect(registry.getRecord(demoCard.cardId)?.containerId).toBe(deck.getId());
      expect(deck.getCardIds()).toContain(demoCard.cardId);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm C: Adaptive Card Arrangement (1, 2, 5, 10, 20 cards)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm C — Adaptive Card Arrangement in HandZone', () => {
    it('1 Card: centered at local origin facing player', () => {
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      const c1 = new CardObject3D({ id: 'c_one' });
      sceneManager.addObject('c_one', c1);
      sceneManager.getCardRegistry().registerTableCard(c1);

      hand.addCard(c1);

      expect(hand.getCardCount()).toBe(1);
      expect(c1.position.x).toBeCloseTo(hand.position.x, 3);
      expect(c1.position.z).toBeCloseTo(hand.position.z, 3);
      expect(c1.rotation.y).toBeCloseTo(hand.rotation.y, 3);
    });

    it('2 Cards: neat side-by-side spacing with no total occlusion', () => {
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      const c1 = new CardObject3D({ id: 'c_2_1' });
      const c2 = new CardObject3D({ id: 'c_2_2' });
      sceneManager.addObject('c_2_1', c1);
      sceneManager.addObject('c_2_2', c2);
      sceneManager.getCardRegistry().registerTableCard(c1);
      sceneManager.getCardRegistry().registerTableCard(c2);

      hand.addCard(c1);
      hand.addCard(c2);

      expect(hand.getCardCount()).toBe(2);
      // Separation between the two cards (1-3 cards: natural width + small gap,
      // clamped to the usable hand width).
      const usable = Math.max(
        0,
        hand.zoneWidth - c1.cardWidth - HAND_ZONE_CONFIG.HAND_MARGIN * 2
      );
      const expectedSpacing = Math.min(
        c1.cardWidth + HAND_ZONE_CONFIG.NATURAL_GAP,
        usable
      );
      const dist = Math.hypot(c2.position.x - c1.position.x, c2.position.z - c1.position.z);
      expect(dist).toBeCloseTo(expectedSpacing, 2);
      // Vertical elevation step prevents Z-fighting
      expect(c2.position.y).toBeGreaterThan(c1.position.y);
    });

    it.each([5, 10, 20])('scales spacing adaptively for %i cards staying within hand bounds', (count) => {
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      const cards: CardObject3D[] = [];

      for (let i = 0; i < count; i++) {
        const c = new CardObject3D({ id: `c_scale_${count}_${i}` });
        sceneManager.addObject(`c_scale_${count}_${i}`, c);
        sceneManager.getCardRegistry().registerTableCard(c);
        cards.push(c);
        hand.addCard(c);
      }

      expect(hand.getCardCount()).toBe(count);

      // Verify that all cards remain strictly inside the HandZone bounding box
      for (const c of cards) {
        expect(hand.containsPoint(c.position.x, c.position.z, 0.1)).toBe(true);
      }

      // First and last card span must not exceed the usable hand width
      const first = cards[0]!;
      const last = cards[cards.length - 1]!;
      const totalSpan = Math.hypot(last.position.x - first.position.x, last.position.z - first.position.z);
      expect(totalSpan).toBeLessThanOrEqual(
        Math.max(0, hand.zoneWidth - first.cardWidth - HAND_ZONE_CONFIG.HAND_MARGIN * 2) + 0.05
      );

      // Layers increase monotonically in elevation
      for (let i = 0; i < cards.length - 1; i++) {
        expect(cards[i + 1]!.position.y).toBeGreaterThan(cards[i]!.position.y);
      }
    });

    it('selected card in hand is elevated and rendered on top', () => {
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      const c1 = new CardObject3D({ id: 'sel_c1' });
      const c2 = new CardObject3D({ id: 'sel_c2' });
      sceneManager.addObject('sel_c1', c1);
      sceneManager.addObject('sel_c2', c2);
      sceneManager.getCardRegistry().registerTableCard(c1);
      sceneManager.getCardRegistry().registerTableCard(c2);

      hand.addCard(c1);
      hand.addCard(c2);

      const unselectedElevationC1 = c1.position.y;

      // Select c1
      sceneManager.getInteractionManager().selectObject(c1);
      hand.arrangeCards();

      expect(c1.position.y).toBeCloseTo(unselectedElevationC1 + HAND_ZONE_CONFIG.SELECTED_ELEVATION, 2);
      expect(c1.getLayerIndex()).toBeGreaterThan(c2.getLayerIndex());

      // Deselect c1
      sceneManager.getInteractionManager().deselectObject(c1);
      hand.arrangeCards();

      expect(c1.position.y).toBeCloseTo(unselectedElevationC1, 3);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm D: Drag & Drop Interactions (Table ↔ Hand, Reordering, Multi-Drag)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm D — Drag & Drop Interactions', () => {
    it('dropping card from table into HandZone adds it to hand and updates CardRegistry', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

      // Move demoCard over HandZone 1 and trigger drop
      demoCard.position.set(hand.position.x, TABLE_CONFIG.SURFACE_Y, hand.position.z);
      sceneManager.getDragController().onCardDropped?.(demoCard, false, []);

      expect(demoCard.isInHand()).toBe(true);
      expect(demoCard.getHandZoneId()).toBe(hand.zoneId);
      expect(hand.hasCard(demoCard.cardId)).toBe(true);
      expect(sceneManager.getCardRegistry().getLocation(demoCard.cardId)).toBe('IN_HAND');
    });

    it('dropping card from HandZone onto table surface removes it from hand', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

      // Put in hand
      demoCard.position.set(hand.position.x, TABLE_CONFIG.SURFACE_Y, hand.position.z);
      sceneManager.getDragController().onCardDropped?.(demoCard, false, []);
      expect(demoCard.isInHand()).toBe(true);

      // Drag out to table center
      demoCard.position.set(0, TABLE_CONFIG.SURFACE_Y, 0);
      sceneManager.getDragController().onCardDropped?.(demoCard, false, []);

      expect(demoCard.isInHand()).toBe(false);
      expect(demoCard.getHandZoneId()).toBeNull();
      expect(hand.hasCard(demoCard.cardId)).toBe(false);
      expect(sceneManager.getCardRegistry().getLocation(demoCard.cardId)).toBe('ON_TABLE');
    });

    it('dragging card within the same HandZone reorders the cards', () => {
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      const c1 = new CardObject3D({ id: 'reorder_1' });
      const c2 = new CardObject3D({ id: 'reorder_2' });
      const c3 = new CardObject3D({ id: 'reorder_3' });
      sceneManager.addObject('reorder_1', c1);
      sceneManager.addObject('reorder_2', c2);
      sceneManager.addObject('reorder_3', c3);
      sceneManager.getCardRegistry().registerTableCard(c1);
      sceneManager.getCardRegistry().registerTableCard(c2);
      sceneManager.getCardRegistry().registerTableCard(c3);

      hand.addCard(c1);
      hand.addCard(c2);
      hand.addCard(c3);

      expect(hand.getCardIds()).toEqual(['reorder_1', 'reorder_2', 'reorder_3']);

      // Drag c3 to the far left (position before c1)
      const leftPos = { x: hand.position.x - 2.0, z: hand.position.z };
      c3.position.set(leftPos.x, TABLE_CONFIG.SURFACE_Y, leftPos.z);
      sceneManager.getDragController().onCardDropped?.(c3, false, []);

      // c3 should now be at the front
      expect(hand.getCardIds()).toEqual(['reorder_3', 'reorder_1', 'reorder_2']);
    });

    it('dropping an entire table stack into a HandZone unfolds and adds all cards to hand', () => {
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      const c1 = new CardObject3D({ id: 'stk_h1' });
      const c2 = new CardObject3D({ id: 'stk_h2' });
      sceneManager.addObject('stk_h1', c1);
      sceneManager.addObject('stk_h2', c2);
      sceneManager.getCardRegistry().registerTableCard(c1);
      sceneManager.getCardRegistry().registerTableCard(c2);

      const stack = sceneManager.getStackManager().createStack([c1, c2]);
      expect(stack.getCount()).toBe(2);

      // Drop entire stack onto HandZone
      c1.position.set(hand.position.x, TABLE_CONFIG.SURFACE_Y, hand.position.z);
      sceneManager.getDragController().onCardDropped?.(c1, true, [c2]);

      expect(hand.hasCard('stk_h1')).toBe(true);
      expect(hand.hasCard('stk_h2')).toBe(true);
      expect(c1.isInStack()).toBe(false);
      expect(c2.isInStack()).toBe(false);
      expect(c1.isInHand()).toBe(true);
      expect(c2.isInHand()).toBe(true);
      // Stack was dissolved
      expect(sceneManager.getStackManager().getStack(stack.stackId)).toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm E: Dynamic Table Cycle (2 -> 8 -> 2) & Card Preservation
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm E — Dynamic Table Adaptation & Card Preservation', () => {
    it('migrates cards seamlessly through full cycle 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 2', () => {
      // Start at 2 players
      sceneManager.rebuildTable(2);
      const hzm = sceneManager.getHandZoneManager();
      const handP1 = hzm.getHandZoneForPlayer(0)!;
      const handP2 = hzm.getHandZoneForPlayer(1)!;

      const c1 = new CardObject3D({ id: 'dyn_card_p1' });
      const c2 = new CardObject3D({ id: 'dyn_card_p2' });
      sceneManager.addObject('dyn_card_p1', c1);
      sceneManager.addObject('dyn_card_p2', c2);
      sceneManager.getCardRegistry().registerTableCard(c1);
      sceneManager.getCardRegistry().registerTableCard(c2);

      handP1.addCard(c1);
      sceneManager.getCardRegistry().transferTableToHand(c1.cardId, handP1.zoneId);

      handP2.addCard(c2);
      sceneManager.getCardRegistry().transferTableToHand(c2.cardId, handP2.zoneId);

      const cycle: PlayerCount[] = [3, 4, 5, 6, 7, 8, 2];

      for (const count of cycle) {
        sceneManager.rebuildTable(count);

        // Cards must still exist and be in hand
        expect(c1.isDisposed()).toBe(false);
        expect(c2.isDisposed()).toBe(false);
        expect(c1.isInHand()).toBe(true);
        expect(c2.isInHand()).toBe(true);

        // Registry integrity must remain valid
        const regCheck = sceneManager.getCardRegistry().validateIntegrity(
          sceneManager.getAllDecks(),
          sceneManager.getAllCards()
        );
        expect(regCheck.valid).toBe(true);
        expect(regCheck.errors).toEqual([]);
      }

      // Returned to 2 players: P1 still holds dyn_card_p1, P2 still holds dyn_card_p2
      const finalHandP1 = hzm.getHandZoneForPlayer(0)!;
      const finalHandP2 = hzm.getHandZoneForPlayer(1)!;
      expect(finalHandP1.hasCard('dyn_card_p1')).toBe(true);
      expect(finalHandP2.hasCard('dyn_card_p2')).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // Nhóm F: Regression & Invariant Verification
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Nhóm F — Regression & Invariant Verification', () => {
    it('card in hand can be flipped (F) preserving face state during re-arrangement', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      demoCard.position.set(hand.position.x, TABLE_CONFIG.SURFACE_Y, hand.position.z);
      sceneManager.getDragController().onCardDropped?.(demoCard, false, []);

      expect(demoCard.isFaceUp()).toBe(true);

      // Flip card
      demoCard.flip();
      expect(demoCard.isFaceUp()).toBe(false);

      // Rearrange hand
      hand.arrangeCards();
      // Face-down state (mesh rotation.z === Math.PI) is preserved
      expect(demoCard.isFaceUp()).toBe(false);
      expect(demoCard.getMesh().rotation.z).toBeCloseTo(Math.PI, 3);
    });

    it('card in hand can be rotated (R / Shift+R)', () => {
      const demoCard = sceneManager.getDemoCard()!;
      const hand = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
      demoCard.position.set(hand.position.x, TABLE_CONFIG.SURFACE_Y, hand.position.z);
      sceneManager.getDragController().onCardDropped?.(demoCard, false, []);

      sceneManager.getInteractionManager().selectObject(demoCard);
      const rotBefore = demoCard.rotation.y;

      // Rotate clockwise
      sceneManager.rotateSelectedCards(1);
      expect(demoCard.rotation.y).toBeCloseTo(rotBefore + Math.PI / 2, 3);

      // Rotate counter-clockwise
      sceneManager.rotateSelectedCards(-1);
      expect(demoCard.rotation.y).toBeCloseTo(rotBefore, 3);
    });
  });
});
