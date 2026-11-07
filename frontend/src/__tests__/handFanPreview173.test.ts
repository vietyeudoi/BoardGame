/**
 * handFanPreview173.test.ts — Hand presentation tests (originally M1.7.3 fan preview)
 *
 * M1.7.7.1 REMOVES the fan/preview "stand cards upright" presentation. This file
 * is kept (not deleted) and now asserts the replacement contract:
 *   D1 — every hand card is always flat on one horizontal plane
 *   D2 — hover is a subtle lift + tiny scale, never a pitch/fan
 *   D3 — selection keeps priority without altering hover semantics
 *   D4 — adaptive flat-row spacing for different card counts
 *   D5 — deterministic raycast partitions on the flat row
 *   D6 — HandZoneManager re-arranges flat and keeps opponent hands untouched
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import { HandZoneManager } from '../objects/HandZoneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeZone(opts?: {
  isLocalPlayer?: boolean;
  width?: number;
  playerIndex?: number;
  isCardHovered?: (card: CardObject3D) => boolean;
}): HandZoneObject3D {
  return new HandZoneObject3D({
    id: 'test_zone',
    playerIndex: opts?.playerIndex ?? 0,
    x: 0,
    z: 5,
    rotationY: 0,
    label: 'Test Zone',
    width: opts?.width ?? 5.2,
    isLocalPlayer: opts?.isLocalPlayer ?? true,
    isCardHovered: opts?.isCardHovered,
  });
}

function makeCard(id: string): CardObject3D {
  return new CardObject3D({ id, faceUp: true });
}

function addCards(zone: HandZoneObject3D, count: number): CardObject3D[] {
  const cards: CardObject3D[] = [];
  for (let i = 0; i < count; i++) {
    const card = makeCard(`card_${i}`);
    zone.addCard(card);
    cards.push(card);
  }
  return cards;
}

function spacingOf(cards: CardObject3D[]): number {
  return cards.length > 1 ? Math.abs(cards[1]!.position.x - cards[0]!.position.x) : 0;
}

// ── D1: flat horizontal row ───────────────────────────────────────────────────

describe('D1 — Hand cards always lie flat in one horizontal row', () => {
  it('never pitches cards upright (rotation.x === 0) regardless of hover state', () => {
    let hovered: CardObject3D | null = null;
    const zone = makeZone({ isLocalPlayer: true, isCardHovered: (c) => c === hovered });
    const cards = addCards(zone, 5);

    zone.arrangeCards();
    hovered = cards[2]!;
    zone.arrangeCards();

    for (const card of cards) {
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.rotation.z).toBeCloseTo(0, 9);
      expect(card.rotation.y).toBeCloseTo(zone.rotation.y, 9);
    }
  });

  it('keeps all cards on the same horizontal plane (only the z-fight step differs)', () => {
    const zone = makeZone({ isLocalPlayer: true });
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    const maxDelta =
      (cards.length - 1) * HAND_ZONE_CONFIG.ELEVATION_STEP + HAND_ZONE_CONFIG.HOVER_LIFT_Y;
    for (const card of cards) {
      expect(card.position.y).toBeGreaterThanOrEqual(HAND_ZONE_CONFIG.SURFACE_Y - 1e-9);
      expect(card.position.y).toBeLessThanOrEqual(HAND_ZONE_CONFIG.SURFACE_Y + maxDelta + 1e-9);
    }
  });

  it('lays the row out horizontally and centres it on the zone', () => {
    const zone = makeZone({ isLocalPlayer: true });
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    // Strictly increasing X order, no fan offsets in Z.
    for (let i = 0; i < cards.length - 1; i++) {
      expect(cards[i + 1]!.position.x).toBeGreaterThan(cards[i]!.position.x);
      expect(cards[i + 1]!.position.z).toBeCloseTo(cards[i]!.position.z, 9);
    }
    const centre = cards.reduce((sum, c) => sum + c.position.x, 0) / cards.length;
    expect(centre).toBeCloseTo(zone.position.x, 6);
  });

  it('opponent hand also stays flat (no local-only presentation leakage)', () => {
    const zone = makeZone({ isLocalPlayer: false });
    const cards = addCards(zone, 4);
    zone.arrangeCards();

    for (const card of cards) {
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.scale.x).toBeCloseTo(1, 9);
    }
  });
});

// ── D2: subtle hover only ────────────────────────────────────────────────────

describe('D2 — Hover is a subtle lift, never a stand-up animation', () => {
  it('lifts the hovered card by HOVER_LIFT_Y and scales it to HOVER_SCALE', () => {
    let hovered: CardObject3D | null = null;
    const zone = makeZone({ isLocalPlayer: true, isCardHovered: (c) => c === hovered });
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    const baseY = cards[2]!.position.y;
    hovered = cards[2]!;
    zone.arrangeCards();

    expect(cards[2]!.position.y).toBeCloseTo(baseY + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 6);
    expect(cards[2]!.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 6);
    expect(cards[2]!.scale.x).toBeGreaterThanOrEqual(1.03);
    expect(cards[2]!.scale.x).toBeLessThanOrEqual(1.05);
    expect(cards[2]!.rotation.x).toBeCloseTo(0, 9);
  });

  it('puts the hovered card above neighbours without moving them', () => {
    let hovered: CardObject3D | null = null;
    const zone = makeZone({ isLocalPlayer: true, isCardHovered: (c) => c === hovered });
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    const neighbourSnapshots = cards.map((c) => ({
      position: c.position.clone(),
      rotation: c.rotation.clone(),
      scale: c.scale.clone(),
    }));

    hovered = cards[2]!;
    zone.arrangeCards();

    expect(cards[2]!.getLayerIndex()).toBeGreaterThan(cards[1]!.getLayerIndex());
    expect(cards[2]!.getLayerIndex()).toBeGreaterThan(cards[3]!.getLayerIndex());

    for (const i of [0, 1, 3, 4]) {
      expect(cards[i]!.position.x).toBeCloseTo(neighbourSnapshots[i]!.position.x, 9);
      expect(cards[i]!.position.y).toBeCloseTo(neighbourSnapshots[i]!.position.y, 9);
      expect(cards[i]!.rotation.x).toBeCloseTo(neighbourSnapshots[i]!.rotation.x, 9);
      expect(cards[i]!.scale.x).toBeCloseTo(neighbourSnapshots[i]!.scale.x, 9);
    }
  });

  it('restores the exact baseline transform on hover-out', () => {
    let hovered: CardObject3D | null = null;
    const zone = makeZone({ isLocalPlayer: true, isCardHovered: (c) => c === hovered });
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    const baseline = {
      position: cards[2]!.position.clone(),
      layer: cards[2]!.getLayerIndex(),
    };

    hovered = cards[2]!;
    zone.arrangeCards();
    hovered = null;
    zone.arrangeCards();

    expect(cards[2]!.position.x).toBeCloseTo(baseline.position.x, 9);
    expect(cards[2]!.position.y).toBeCloseTo(baseline.position.y, 9);
    expect(cards[2]!.position.z).toBeCloseTo(baseline.position.z, 9);
    expect(cards[2]!.scale.x).toBeCloseTo(1, 9);
    expect(cards[2]!.rotation.x).toBeCloseTo(0, 9);
    expect(cards[2]!.getLayerIndex()).toBe(baseline.layer);
  });

  it('does not apply hover transforms to an opponent hand', () => {
    const opponentCard = makeCard('opponent_card');
    const zone = makeZone({
      isLocalPlayer: false,
      isCardHovered: (c) => c === opponentCard,
    });
    zone.addCard(opponentCard);
    zone.arrangeCards();
    const baseY = opponentCard.position.y;

    zone.arrangeCards();

    expect(opponentCard.position.y).toBeCloseTo(baseY, 9);
    expect(opponentCard.scale.x).toBeCloseTo(1, 9);
    expect(opponentCard.rotation.x).toBeCloseTo(0, 9);
  });
});

// ── D3: selection keeps priority ─────────────────────────────────────────────

describe('D3 — Selection and hover do not fight', () => {
  it('selected card keeps its elevation and top layer while hovered', () => {
    const selected = makeCard('selected');
    const zone = new HandZoneObject3D({
      id: 'test_zone_selection',
      playerIndex: 0,
      x: 0,
      z: 5,
      rotationY: 0,
      label: 'Test',
      isLocalPlayer: true,
      isCardSelected: (c) => c === selected,
      isCardHovered: (c) => c === selected,
    });
    zone.addCard(selected);
    zone.addCard(makeCard('other'));
    zone.arrangeCards();

    expect(selected.position.y).toBeCloseTo(
      HAND_ZONE_CONFIG.SURFACE_Y + HAND_ZONE_CONFIG.SELECTED_ELEVATION,
      6
    );
    expect(selected.getLayerIndex()).toBe(
      HAND_ZONE_CONFIG.BASE_LAYER_INDEX + HAND_ZONE_CONFIG.SELECTION_LAYER_OFFSET
    );
    expect(selected.rotation.x).toBeCloseTo(0, 9);
  });
});

// ── D4: adaptive flat-row spacing ────────────────────────────────────────────

describe('D4 — Adaptive flat-row spacing for different card counts', () => {
  it.each([1, 2, 5, 10, 15, 20])('N=%i: every card stays inside the hand zone', (N) => {
    const zone = makeZone({ isLocalPlayer: true, width: 5.2 });
    const cards = addCards(zone, N);
    zone.arrangeCards();

    for (const card of cards) {
      expect(zone.containsPoint(card.position.x, card.position.z, 0.15)).toBe(true);
    }
  });

  it('spacing shrinks as the hand grows (1–3 wide → 11+ heavy overlap)', () => {
    const zone3 = makeZone({ isLocalPlayer: true, width: 5.2 });
    const zone5 = makeZone({ isLocalPlayer: true, width: 5.2 });
    const zone10 = makeZone({ isLocalPlayer: true, width: 5.2 });
    const zone15 = makeZone({ isLocalPlayer: true, width: 5.2 });
    addCards(zone3, 3);
    zone3.arrangeCards();
    const sp3 = spacingOf(zone3.getCards());
    addCards(zone5, 5);
    zone5.arrangeCards();
    const sp5 = spacingOf(zone5.getCards());
    addCards(zone10, 10);
    zone10.arrangeCards();
    const sp10 = spacingOf(zone10.getCards());
    addCards(zone15, 15);
    zone15.arrangeCards();
    const sp15 = spacingOf(zone15.getCards());

    expect(sp3).toBeGreaterThan(sp5);
    expect(sp5).toBeGreaterThan(sp10);
    expect(sp10).toBeGreaterThan(sp15);
  });

  it('keeps a visible strip of every card in a 15-card hand', () => {
    const zone = makeZone({ isLocalPlayer: true, width: 5.2 });
    const cards = addCards(zone, 15);
    zone.arrangeCards();

    const spacing = spacingOf(cards);
    expect(spacing).toBeGreaterThan(0);
    // The exposed strip is the spacing; it must remain a recognisable sliver.
    expect(spacing / cards[0]!.cardWidth).toBeGreaterThan(0.05);
  });
});

// ── D5: deterministic raycast partitions ────────────────────────────────────

describe('D5 — findCardByRay hits the correct flat-row partition', () => {
  it('hit-tests the rightmost card at its centre', () => {
    const zone = makeZone({ isLocalPlayer: true, width: 5.2 });
    zone.position.set(0, 0, 5);
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    const lastCard = cards[cards.length - 1]!;
    const raycaster = new THREE.Raycaster();
    raycaster.set(
      new THREE.Vector3(lastCard.position.x + 0.05, 10, zone.position.z),
      new THREE.Vector3(0, -1, 0)
    );

    expect(zone.findCardByRay(raycaster)).toBe(lastCard);
  });

  it('hit-tests every partition centre', () => {
    const zone = makeZone({ isLocalPlayer: true, width: 5.2 });
    zone.position.set(0, 0, 5);
    const cards = addCards(zone, 5);
    zone.arrangeCards();

    const N = cards.length;
    const cardWidth = cards[0]!.cardWidth;
    const spacing = Math.abs(cards[1]!.position.x - cards[0]!.position.x);
    const totalSpan = (N - 1) * spacing;

    for (let i = 0; i < N; i++) {
      const leftBoundary = -totalSpan / 2 + i * spacing - cardWidth / 2;
      const rightBoundary =
        i < N - 1
          ? -totalSpan / 2 + (i + 1) * spacing - cardWidth / 2
          : totalSpan / 2 + cardWidth / 2;
      const sampleX = zone.position.x + (leftBoundary + rightBoundary) / 2;

      const raycaster = new THREE.Raycaster();
      raycaster.set(new THREE.Vector3(sampleX, 10, zone.position.z), new THREE.Vector3(0, -1, 0));
      expect(zone.findCardByRay(raycaster)).toBe(cards[i]);
    }
  });

  it('returns null for a ray outside the hand bounds', () => {
    const zone = makeZone({ isLocalPlayer: true, width: 5.2 });
    zone.position.set(0, 0, 5);
    addCards(zone, 5);
    zone.arrangeCards();

    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(100, 10, 5), new THREE.Vector3(0, -1, 0));
    expect(zone.findCardByRay(raycaster)).toBeNull();
  });
});

// ── D6: manager re-arranges flat ─────────────────────────────────────────────

describe('D6 — HandZoneManager keeps every hand flat', () => {
  it('rearrangeAllHands leaves all zones flat (no fan/preview state)', () => {
    const scene = new THREE.Scene();
    const manager = new HandZoneManager(scene, vi.fn());
    manager.setupLayout(4);

    const cards: CardObject3D[] = [];
    for (const zone of manager.getAllHandZones()) {
      const card = makeCard(`mgr_${zone.playerIndex}`);
      zone.addCard(card);
      cards.push(card);
    }

    manager.rearrangeAllHands();

    for (const card of cards) {
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.rotation.z).toBeCloseTo(0, 9);
      expect(card.scale.x).toBeCloseTo(1, 9);
    }

    manager.dispose();
  });

  it('manager hover callback only affects the local player card presentation', () => {
    const scene = new THREE.Scene();
    let hoveredId: string | null = null;
    const manager = new HandZoneManager(
      scene,
      vi.fn(),
      undefined,
      (c) => c.cardId === hoveredId
    );
    manager.setupLayout(4);
    manager.setLocalPlayerIndex(0);

    const localZone = manager.getHandZoneForPlayer(0)!;
    const opponentZone = manager.getHandZoneForPlayer(1)!;
    const localCard = makeCard('local_card');
    const opponentCard = makeCard('opponent_card');
    localZone.addCard(localCard);
    opponentZone.addCard(opponentCard);

    hoveredId = 'local_card';
    manager.rearrangeAllHands();

    expect(localCard.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 6);
    expect(opponentCard.scale.x).toBeCloseTo(1, 9);

    manager.dispose();
  });
});
