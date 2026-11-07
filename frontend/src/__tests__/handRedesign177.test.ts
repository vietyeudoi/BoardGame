/**
 * handRedesign177.test.ts — M1.7.7: Table Visibility & Hand Card UX Redesign
 *
 * Regression suite H177-01 … H177-12 + seated camera framing checks.
 *
 * Part 2 (Hand redesign): the old hand hover presentation (lift +0.20, pitch π/3,
 * scale 1.08, fan rotation, elevated hand layer) is replaced by a modern
 * battler-style overlapping hand row with a *subtle* hover (lift +0.05, scale 1.05,
 * no stand-up, no fan, no neighbour displacement, tiny render-order offset).
 *
 * Part 1 (Table visibility): seated camera re-applies adaptive framing for the
 * current table shape and keeps the Offline table-centre framing.
 *
 * Part 3: M1.7.5 / M1.7.6 behaviour (seat orientation, wheel rotation, rotation sync,
 * ownership handling, TABLE hover eligibility) must remain intact.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

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
          toJSON: () => ({}),
        });
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 1000);
        this._camera.position.set(0, 8, 10);
        this._camera.lookAt(0, 0, 0);
        this._camera.updateProjectionMatrix();
      }

      startLoop(): void {}
      stopLoop(): void {}
      requestRender(): void {}
      handleResize(): void {}
      getCamera(): THREE.PerspectiveCamera {
        return this._camera;
      }
      getDomElement(): HTMLCanvasElement {
        return this._canvas;
      }
      dispose(): void {
        this._canvas.remove();
      }
    },
  };
});

import { SceneManager } from '../scene/SceneManager';
import { HoverExpansionController } from '../interaction/HoverExpansionController';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';
import { TABLE_CONFIG } from '../objects/TableConfig';
import type { CardObject3D } from '../objects/CardObject3D';

const LOCAL_SESSION = 'session_local_177';

const SAFE_SPOTS = [
  { x: 0, z: 4 },
  { x: 4, z: -2 },
  { x: -4, z: 2 },
  { x: 0, z: -4.5 },
] as const;

let rafCallbacks: (() => void)[] = [];
let rafId = 0;
const mockRaf = (cb: () => void): number => {
  rafCallbacks.push(cb);
  return ++rafId;
};
const mockCancelRaf = (): void => {
  /* no-op */
};

function hoverInHand(sceneManager: SceneManager, card: CardObject3D): void {
  const im = sceneManager.getInteractionManager() as unknown as {
    _hoveredObject: CardObject3D | null;
  };
  im._hoveredObject = card;
  const zone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!);
  zone?.arrangeCards();
}

function leaveHand(sceneManager: SceneManager, card: CardObject3D): void {
  const im = sceneManager.getInteractionManager() as unknown as {
    _hoveredObject: CardObject3D | null;
  };
  im._hoveredObject = null;
  const zone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!);
  zone?.arrangeCards();
}

function dropToTable(
  sceneManager: SceneManager,
  card: CardObject3D,
  spot: { x: number; z: number }
): void {
  card.position.set(spot.x, TABLE_CONFIG.SURFACE_Y, spot.z);
  (
    sceneManager as unknown as {
      _onCardDropped: (c: CardObject3D, g?: boolean, f?: CardObject3D[]) => void;
    }
  )._onCardDropped(card, false, []);
}

describe('M1.7.7 — Table visibility & Hand card UX redesign', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;
  let controller: HoverExpansionController;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);

    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
    document.body.appendChild(container);

    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setLocalSessionId(LOCAL_SESSION);
    sceneManager.setPlayerPerspective(0, 4, false);

    controller = new HoverExpansionController(() => {
      /* render request */
    });
    controller.setLocalPlayerId(LOCAL_SESSION);
    controller.setEligibilityCheck((card) =>
      sceneManager.isTableCardOwnedByLocalPlayer(card)
    );
  });

  afterEach(() => {
    controller.dispose();
    sceneManager.dispose();
    container.remove();
    vi.unstubAllGlobals();
  });

  const drawHandCard = (id: string, type = 'attack'): CardObject3D =>
    sceneManager.syncDrawnCard(id, 0, type, true, LOCAL_SESSION)!;

  const handZoneOf = (card: CardObject3D) =>
    sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!)!;

  // ── H177-01 ──────────────────────────────────────────────────────────────
  it('H177-01: hand with a single card is centered and unscaled', () => {
    const card = drawHandCard('h177_01');
    const z = handZoneOf(card);
    z.arrangeCards();

    expect(z.getCardCount()).toBe(1);
    expect(card.position.x).toBeCloseTo(z.position.x, 5);
    expect(card.position.z).toBeCloseTo(z.position.z, 5);
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.position.y).toBeCloseTo(HAND_ZONE_CONFIG.SURFACE_Y, 5);
  });

  // ── H177-02 ──────────────────────────────────────────────────────────────
  it('H177-02: hand with 3 cards lays out a centered overlapping row within zone bounds', () => {
    const cards = ['h177_02_a', 'h177_02_b', 'h177_02_c'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();

    const spacing = Math.abs(cards[1]!.position.x - cards[0]!.position.x);
    expect(spacing).toBeGreaterThan(0);
    expect(cards[0]!.position.x).toBeLessThan(z.position.x);
    expect(cards[2]!.position.x).toBeGreaterThan(z.position.x);
    for (const c of cards) {
      expect(Math.abs(c.position.x - z.position.x)).toBeLessThan(z.zoneWidth / 2);
      expect(Math.abs(c.position.z - z.position.z)).toBeLessThan(z.zoneDepth / 2);
    }
  });

  // ── H177-03 ──────────────────────────────────────────────────────────────
  it('H177-03: hand with several cards overlaps neighbours but keeps recognisability', () => {
    const cards = [
      'h177_03_a',
      'h177_03_b',
      'h177_03_c',
      'h177_03_d',
      'h177_03_e',
    ].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();

    const cardWidth = cards[0]!.cardWidth;
    const spacing = Math.abs(cards[1]!.position.x - cards[0]!.position.x);
    expect(spacing).toBeGreaterThan(0);
    expect(spacing).toBeLessThan(cardWidth);
    expect(cardWidth - spacing).toBeGreaterThan(cardWidth * 0.5);
    const span = (cards.length - 1) * spacing;
    expect(Math.abs(cards[cards.length - 1]!.position.x - cards[0]!.position.x)).toBeCloseTo(
      span,
      5
    );
    expect(Math.abs(cards[0]!.position.x - z.position.x) + cardWidth).toBeLessThanOrEqual(
      z.zoneWidth + 0.2
    );
  });

  // ── H177-04 ──────────────────────────────────────────────────────────────
  it('H177-04: hand with many cards still overlaps and stays within bounds', () => {
    const cards = [
      'h177_04_a',
      'h177_04_b',
      'h177_04_c',
      'h177_04_d',
      'h177_04_e',
      'h177_04_f',
      'h177_04_g',
      'h177_04_h',
    ].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();

    const spacing = Math.abs(cards[1]!.position.x - cards[0]!.position.x);
    expect(spacing).toBeGreaterThan(0);
    expect(
      Math.abs(cards[0]!.position.x - z.position.x) + cards[0]!.cardWidth
    ).toBeLessThanOrEqual(z.zoneWidth + 0.2);
  });

  // ── H177-05 ──────────────────────────────────────────────────────────────
  it('H177-05: hand with 15+ cards auto-reduces spacing to fit the hand zone', () => {
    const cards = Array.from({ length: 16 }, (_, i) => drawHandCard(`h177_05_${i}`));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();

    const spacing = cards.length > 1 ? Math.abs(cards[1]!.position.x - cards[0]!.position.x) : 0;
    const maxAllowedSpan = Math.max(0, z.zoneWidth - cards[0]!.cardWidth - 0.2);
    const span = (cards.length - 1) * spacing;
    expect(span).toBeLessThanOrEqual(maxAllowedSpan + 1e-6);
  });

  // ── H177-06 ──────────────────────────────────────────────────────────────
  it('H177-06: hover applies gentle lift + tiny scale, no stand-up pitch, no fan, neighbours untouched', () => {
    const cards = ['h177_06_a', 'h177_06_b', 'h177_06_c'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();
    const hovered = cards[1]!;

    const baselinePos = hovered.position.clone();
    const neighbourPos = cards[0]!.position.clone();

    hoverInHand(sceneManager, hovered);
    z.arrangeCards();

    expect(hovered.position.y).toBeCloseTo(baselinePos.y + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 5);
    expect(hovered.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 5);
    expect(hovered.scale.z).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 5);
    expect(hovered.rotation.x).toBeCloseTo(0, 6);
    expect(hovered.rotation.y).toBeCloseTo(z.rotation.y, 6);
    expect(hovered.getLayerIndex()).toBe(
      HAND_ZONE_CONFIG.BASE_LAYER_INDEX + 1 + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET
    );
    expect(cards[0]!.position.x).toBeCloseTo(neighbourPos.x, 6);
    expect(cards[0]!.position.y).toBeCloseTo(neighbourPos.y, 6);
  });

  // ── H177-07 ──────────────────────────────────────────────────────────────
  it('H177-07: pointer leave restores exact baseline transform', () => {
    const cards = ['h177_07_a', 'h177_07_b'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();
    const hovered = cards[1]!;

    const baselinePos = hovered.position.clone();
    const baselineLayer = hovered.getLayerIndex();

    hoverInHand(sceneManager, hovered);
    z.arrangeCards();

    leaveHand(sceneManager, hovered);
    z.arrangeCards();

    expect(hovered.scale.x).toBeCloseTo(1, 6);
    expect(hovered.scale.y).toBeCloseTo(1, 6);
    expect(hovered.scale.z).toBeCloseTo(1, 6);
    expect(hovered.position.y).toBeCloseTo(baselinePos.y, 6);
    expect(hovered.position.x).toBeCloseTo(baselinePos.x, 6);
    expect(hovered.position.z).toBeCloseTo(baselinePos.z, 6);
    expect(hovered.getLayerIndex()).toBe(baselineLayer);
  });

  // ── H177-08 ──────────────────────────────────────────────────────────────
  it('H177-08: selected vs hover — selection keeps its highlight; hover does not displace', () => {
    const cards = ['h177_08_a', 'h177_08_b'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    const im = sceneManager.getInteractionManager();
    z.arrangeCards();

    im.selectObject(cards[1]!, false);
    z.arrangeCards();
    const selectedElev = cards[1]!.position.y;
    const selectedLayer = cards[1]!.getLayerIndex();

    hoverInHand(sceneManager, cards[1]!);
    z.arrangeCards();

    expect(cards[1]!.position.y).toBeCloseTo(selectedElev, 6);
    expect(cards[1]!.getLayerIndex()).toBe(selectedLayer);
    expect(cards[0]!.scale.x).toBeCloseTo(1, 6);
    expect(cards[0]!.position.y).toBeCloseTo(HAND_ZONE_CONFIG.SURFACE_Y, 6);
  });

  // ── H177-09 ──────────────────────────────────────────────────────────────
  it('H177-09: dragging a card out of hand leaves remaining cards re-arranged, dragged card untouched', () => {
    const cards = ['h177_09_a', 'h177_09_b', 'h177_09_c'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();
    const dragged = cards[1]!;
    const draggedBefore = dragged.position.clone();

    dragged.setLayoutControlled(true); // DragController sets this while dragging
    z.arrangeCards();

    expect(dragged.position.x).toBeCloseTo(draggedBefore.x, 6);
    expect(dragged.position.z).toBeCloseTo(draggedBefore.z, 6);
    for (const c of [cards[0]!, cards[2]!]) {
      expect(Math.abs(c.position.x - z.position.x)).toBeLessThan(z.zoneWidth / 2);
      expect(Math.abs(c.position.z - z.position.z)).toBeLessThan(z.zoneDepth / 2);
    }
  });

  // ── H177-10 ──────────────────────────────────────────────────────────────
  it('H177-10: multi-selection hover independence', () => {
    const cards = ['h177_10_a', 'h177_10_b', 'h177_10_c'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    const im = sceneManager.getInteractionManager();
    z.arrangeCards();

    im.selectObjects(cards.slice(0, 2));
    z.arrangeCards();
    const secondSelectedElev = cards[1]!.position.y;

    hoverInHand(sceneManager, cards[0]!);
    z.arrangeCards();

    expect(cards[0]!.getLayerIndex()).toBe(HAND_ZONE_CONFIG.BASE_LAYER_INDEX + 0 + 100);
    expect(cards[1]!.getLayerIndex()).toBe(HAND_ZONE_CONFIG.BASE_LAYER_INDEX + 1 + 100);
    expect(cards[1]!.position.y).toBeCloseTo(secondSelectedElev, 6);
    expect(cards[2]!.scale.x).toBeCloseTo(1, 6);
  });

  // ── H177-11 ──────────────────────────────────────────────────────────────
  it('H177-11: responsive hand layout adapts spacing to card count', () => {
    const three = ['h177_11_a', 'h177_11_b', 'h177_11_c'].map((id) => drawHandCard(id));
    const z3 = handZoneOf(three[0]!);
    z3.arrangeCards();
    const spacing3 = Math.abs(three[1]!.position.x - three[0]!.position.x);

    const eight = Array.from({ length: 8 }, (_, i) => drawHandCard(`h177_11_d${i}`));
    const z8 = handZoneOf(eight[0]!);
    z8.arrangeCards();
    const spacing8 = Math.abs(eight[1]!.position.x - eight[0]!.position.x);

    expect(spacing8).toBeLessThan(spacing3);
    const maxAllowedSpan = Math.max(0, z8.zoneWidth - eight[0]!.cardWidth - 0.2);
    expect((eight.length - 1) * spacing8).toBeLessThanOrEqual(maxAllowedSpan + 1e-6);
  });

  // ── H177-12 ──────────────────────────────────────────────────────────────
  it('H177-12: HAND → TABLE keeps no HAND presentation and M1.7.6 eligibility holds', () => {
    const card = drawHandCard('h177_12');
    hoverInHand(sceneManager, card);
    expect(card.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 5);

    dropToTable(sceneManager, card, SAFE_SPOTS[0]!);

    expect(card.isInHand()).toBe(false);
    expect(card.getHandZoneId()).toBeNull();
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');
    expect(card.getOwnerId()).toBeNull();
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    expect(card.rotation.x).toBeCloseTo(0, 6);

    const im = sceneManager.getInteractionManager() as unknown as {
      _hoveredObject: CardObject3D | null;
    };
    expect(im._hoveredObject).toBeNull();

    const layering = (
      sceneManager as unknown as { _layeringManager: { getLayerOf(id: string): number } }
    )._layeringManager;
    expect(card.getLayerIndex()).toBe(layering.getLayerOf(card.cardId));
    expect(card.getLayerIndex()).toBeLessThan(HAND_ZONE_CONFIG.BASE_LAYER_INDEX);

    expect(sceneManager.isTableCardOwnedByLocalPlayer(card)).toBe(false);

    const tableController = new HoverExpansionController(() => {});
    tableController.setLocalPlayerId(LOCAL_SESSION);
    tableController.setEligibilityCheck((c) => sceneManager.isTableCardOwnedByLocalPlayer(c));
    tableController.onTableCardHoverChanged(
      card,
      true,
      sceneManager.getCardRegistry().getCardsOnTable()
    );
    expect(card.scale.x).toBeCloseTo(1, 6);
    tableController.dispose();
  });

  // ── H177-13 (M1.7.7.1): the real hover path must not re-trigger the old fan ──
  it('H177-13: real pointer-enter hover path keeps every hand card flat', () => {
    const cards = ['h177_13_a', 'h177_13_b', 'h177_13_c', 'h177_13_d', 'h177_13_e'].map((id) =>
      drawHandCard(id)
    );
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();

    const im = sceneManager.getInteractionManager() as unknown as {
      _hoveredObject: CardObject3D | null;
      onHoverChanged:
        | ((curr: CardObject3D | null, prev: CardObject3D | null) => void)
        | null;
    };

    // Move the pointer from nothing onto the middle card — the exact browser path
    // that used to activate the M1.7.3 fan preview and pitch all cards upright.
    im._hoveredObject = cards[2]!;
    im.onHoverChanged?.(cards[2]!, null);

    for (const card of cards) {
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.rotation.z).toBeCloseTo(0, 9);
    }
    // Only the hovered card is lifted/scaled, and only subtly.
    expect(cards[2]!.position.y).toBeGreaterThan(HAND_ZONE_CONFIG.SURFACE_Y);
    expect(cards[2]!.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 5);
    for (const i of [0, 1, 3, 4]) {
      expect(cards[i]!.scale.x).toBeCloseTo(1, 9);
      expect(cards[i]!.position.y).toBeLessThan(HAND_ZONE_CONFIG.SURFACE_Y + 0.05);
    }
  });

  // ── H177-14 (M1.7.7.1): moving across the row leaves no residual hover ──────
  it('H177-14: sweeping hover across all cards restores each previous card exactly', () => {
    const cards = ['h177_14_a', 'h177_14_b', 'h177_14_c'].map((id) => drawHandCard(id));
    const z = handZoneOf(cards[0]!);
    z.arrangeCards();

    const baselines = cards.map((c) => ({
      position: c.position.clone(),
      scale: c.scale.clone(),
      layer: c.getLayerIndex(),
    }));

    const im = sceneManager.getInteractionManager() as unknown as {
      _hoveredObject: CardObject3D | null;
      onHoverChanged:
        | ((curr: CardObject3D | null, prev: CardObject3D | null) => void)
        | null;
    };

    let prev: CardObject3D | null = null;
    for (const card of cards) {
      im._hoveredObject = card;
      im.onHoverChanged?.(card, prev);
      prev = card;
    }
    // Leave the hand entirely.
    im._hoveredObject = null;
    im.onHoverChanged?.(null, prev);

    cards.forEach((card, i) => {
      expect(card.position.x).toBeCloseTo(baselines[i]!.position.x, 6);
      expect(card.position.y).toBeCloseTo(baselines[i]!.position.y, 6);
      expect(card.position.z).toBeCloseTo(baselines[i]!.position.z, 6);
      expect(card.scale.x).toBeCloseTo(1, 6);
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.getLayerIndex()).toBe(baselines[i]!.layer);
    });
  });

  // ── M1.7.7 Part 1: seated camera framing ───────────────────────────────────
  it('M1.7.7 camera: seated player camera re-applies adaptive radius and frames the felt', () => {
    const camController = sceneManager.getCameraController();
    const before = camController.getRadius();
    sceneManager.setPlayerPerspective(1, 4, false);
    const after = camController.getRadius();

    // Adaptive radius re-applied on seat change (felt framing incl. short sides).
    expect(after).toBeGreaterThan(0);
    expect(after).toBeCloseTo(before, 5);

    // Offline and Online share the table-centre target; only azimuth follows the seat.
    const target = camController.getTarget();
    expect(target.x).toBeCloseTo(0, 5);
    expect(target.z).toBeCloseTo(0, 5);
  });
});
