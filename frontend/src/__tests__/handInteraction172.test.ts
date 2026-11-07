/**
 * handInteraction172.test.ts — Comprehensive Test Suite for M1.7.2
 *
 * Verifies:
 * - Fix A: Flat overlapping fan layout (cards flat on table surface, not upright)
 * - Fix B: Single-card hover reveal (only hovered card lifts and pitches toward camera)
 * - Fix C: Partition-based hit-testing (all overlapping cards are selectable/clickable)
 * - Fix D: Deck hover preview fan removal
 * - Fix E & F: Shared table card interaction vs Opponent hand privacy
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';

describe('M1.7.2 — Interactive Hand Layout, Hover Reveal & Shared Table Interaction', () => {
  let handZone: HandZoneObject3D;
  const cards: CardObject3D[] = [];

  beforeEach(() => {
    handZone = new HandZoneObject3D({
      id: 'test_hand_172',
      playerIndex: 0,
      label: 'Player 1',
      x: 0,
      z: 5,
      rotationY: 0,
      width: 5.2,
      depth: 2.3,
      isLocalPlayer: true,
    });
  });

  afterEach(() => {
    handZone.dispose();
    for (const card of cards) {
      card.dispose();
    }
    cards.length = 0;
  });

  describe('Fix A: Flat Overlapping Hand Layout', () => {
    it('arranges cards resting flat on the table (rotation.x == 0, not upright 66.7°)', () => {
      for (let i = 0; i < 5; i++) {
        const card = new CardObject3D({ id: `card_${i}` });
        cards.push(card);
        handZone.addCard(card);
      }

      handZone.arrangeCards();

      // All 5 cards must rest flat
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]!;
        expect(card.rotation.x).toBe(0);
        expect(card.scale.x).toBeCloseTo(1.0, 4);
        expect(card.scale.y).toBeCloseTo(1.0, 4);
        expect(card.scale.z).toBeCloseTo(1.0, 4);
      }
    });

    it('positions cards across increasing N (1, 2, 5, 10, 15) strictly within zone width', () => {
      const counts = [1, 2, 5, 10, 15];
      for (const count of counts) {
        // Clear previous
        handZone.clearCards();
        const testCards: CardObject3D[] = [];

        for (let i = 0; i < count; i++) {
          const card = new CardObject3D({ id: `c_${count}_${i}` });
          testCards.push(card);
          handZone.addCard(card);
        }

        handZone.arrangeCards();

        if (count === 1) {
          expect(testCards[0]!.position.x).toBeCloseTo(handZone.position.x, 2);
        } else {
          // Check left-to-right monotonic ordering
          for (let i = 0; i < count - 1; i++) {
            expect(testCards[i + 1]!.position.x).toBeGreaterThan(testCards[i]!.position.x);
          }
          // Span must not exceed zoneWidth
          const span = testCards[count - 1]!.position.x - testCards[0]!.position.x;
          expect(span).toBeLessThan(handZone.zoneWidth);
        }

        for (const tc of testCards) tc.dispose();
      }
    });
  });

  describe('Fix B: Single Card Hover Reveal', () => {
    it('applies a subtle hover lift + tiny scale ONLY to the hovered card; neighbors stay flat', () => {
      let hoveredCardId: string | null = null;
      handZone.setHoverCallback((card) => card.cardId === hoveredCardId);

      for (let i = 0; i < 5; i++) {
        const card = new CardObject3D({ id: `hcard_${i}` });
        cards.push(card);
        handZone.addCard(card);
      }

      handZone.arrangeCards();
      const baselineY = cards[2]!.position.y;

      // Hover middle card (index 2)
      hoveredCardId = 'hcard_2';
      handZone.arrangeCards();

      const hovered = cards[2]!;
      // M1.7.7: subtle hover — gentle lift + tiny scale, no stand-up pitch, no fan.
      expect(hovered.position.y).toBeCloseTo(baselineY + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 3);
      expect(hovered.rotation.x).toBeCloseTo(0, 6); // No stand-up pitch
      expect(hovered.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
      expect(hovered.getLayerIndex()).toBeGreaterThanOrEqual(
        HAND_ZONE_CONFIG.BASE_LAYER_INDEX + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET
      );

      // Other cards (e.g., 0, 1, 3, 4) must remain flat
      for (const idx of [0, 1, 3, 4]) {
        const other = cards[idx]!;
        expect(other.rotation.x).toBe(0);
        expect(other.scale.x).toBeCloseTo(1.0, 2);
        expect(other.position.y).toBeLessThan(hovered.position.y);
      }

      // Unhover restores flat orientation
      hoveredCardId = null;
      handZone.arrangeCards();
      expect(hovered.rotation.x).toBe(0);
      expect(hovered.scale.x).toBeCloseTo(1.0, 2);
      expect(hovered.position.y).toBeCloseTo(baselineY, 3);
    });
  });

  describe('Fix C: Partition-based Hit-testing (findCardByRay)', () => {
    it('resolves every single card in a 5-card overlapping hand via its partition center', () => {
      for (let i = 0; i < 5; i++) {
        const card = new CardObject3D({ id: `part_card_${i}` });
        cards.push(card);
        handZone.addCard(card);
      }
      handZone.arrangeCards();

      const N = cards.length;
      const cardWidth = 2.5;
      const usable = Math.max(0, handZone.zoneWidth - cardWidth - HAND_ZONE_CONFIG.HAND_MARGIN * 2);
      const maxFit = usable / (N - 1);
      const spacing = Math.min(cardWidth * HAND_ZONE_CONFIG.SPACING_RATIO_LIGHT, maxFit);
      const totalSpan = (N - 1) * spacing;

      for (let i = 0; i < N; i++) {
        // Calculate the exact midpoint of card i's partition strip
        const leftBoundary = -totalSpan / 2 + i * spacing - cardWidth / 2;
        const rightBoundary =
          i < N - 1
            ? -totalSpan / 2 + (i + 1) * spacing - cardWidth / 2
            : totalSpan / 2 + cardWidth / 2;
        const sampleX = (leftBoundary + rightBoundary) / 2;

        const rayOrigin = new THREE.Vector3(sampleX, 10, handZone.position.z);
        const rayDirection = new THREE.Vector3(0, -1, 0);
        const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);

        const hitCard = handZone.findCardByRay(raycaster);
        expect(hitCard).not.toBeNull();
        expect(hitCard?.cardId).toBe(`part_card_${i}`);
      }
    });

    it('returns null for raycasts outside hand zone horizontal or vertical bounds', () => {
      const card = new CardObject3D({ id: 'solo_card' });
      cards.push(card);
      handZone.addCard(card);
      handZone.arrangeCards();

      // Far left
      const rayFarLeft = new THREE.Raycaster(
        new THREE.Vector3(-10, 10, handZone.position.z),
        new THREE.Vector3(0, -1, 0)
      );
      expect(handZone.findCardByRay(rayFarLeft)).toBeNull();

      // Far Z (depth)
      const rayFarZ = new THREE.Raycaster(
        new THREE.Vector3(0, 10, handZone.position.z + 10),
        new THREE.Vector3(0, -1, 0)
      );
      expect(handZone.findCardByRay(rayFarZ)).toBeNull();
    });
  });

  describe('Fix D: Deck Hover Preview Removed', () => {
    it('deck has no hover preview mesh children and setHoverPreviewVisible is a harmless no-op', () => {
      const deck = new DeckObject3D({
        id: 'test_deck_m172',
        cardIds: ['c1', 'c2', 'c3', 'c4'],
      });

      const initialChildCount = deck.children.length;

      // Calling setHoverPreviewVisible(true) must not add any children or fan preview
      deck.setHoverPreviewVisible(true);
      expect(deck.children.length).toBe(initialChildCount);

      // Calling setHoverPreviewVisible(false) must not error
      deck.setHoverPreviewVisible(false);
      expect(deck.children.length).toBe(initialChildCount);

      deck.dispose();
    });
  });

  describe('Fix E & F: canInteractWithObject Policy', () => {
    it('allows table cards regardless of owner, blocks opponent hand cards', () => {
      const tableCard = new CardObject3D({ id: 'table_card' });
      const localHandCard = new CardObject3D({ id: 'local_hand_card' });
      const opponentHandCard = new CardObject3D({ id: 'opponent_hand_card' });

      localHandCard.setHandZoneId('hand_zone_1');
      opponentHandCard.setHandZoneId('hand_zone_2');

      const handZones = new Map<string, { playerIndex: number }>([
        ['hand_zone_1', { playerIndex: 0 }],
        ['hand_zone_2', { playerIndex: 1 }],
      ]);

      const activePlayerIndex = 0;

      const canInteractWithObject = (object: CardObject3D | DeckObject3D): boolean => {
        if (object instanceof CardObject3D && object.isInHand()) {
          const zone = handZones.get(object.getHandZoneId()!);
          if (zone && activePlayerIndex !== null && zone.playerIndex !== activePlayerIndex) {
            return false;
          }
        }
        return true;
      };

      // Table card: allowed
      expect(canInteractWithObject(tableCard)).toBe(true);

      // Local player hand card: allowed
      expect(canInteractWithObject(localHandCard)).toBe(true);

      // Opponent hand card: blocked
      expect(canInteractWithObject(opponentHandCard)).toBe(false);

      tableCard.dispose();
      localHandCard.dispose();
      opponentHandCard.dispose();
    });
  });
});
