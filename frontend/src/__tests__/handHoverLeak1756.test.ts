/**
 * handHoverLeak1756.test.ts — M1.7.6: HAND hover presentation must not leak to TABLE
 *
 * Regression suite H1756-01 … H1756-10.
 *
 * Root cause covered here: the hover-expansion controller used the card's
 * `_ownerId` mirror as its only ownership gate. That mirror was set when the
 * card entered a hand and was never cleared on HAND→TABLE, so a just-played
 * TABLE card still looked "owned" and expanded (1.15× scale, +0.5 lift).
 *
 * The tests exercise the real HAND→TABLE lifecycle, including a pointer that
 * never leaves the card and repeated hover/drag cycles — not just the fact that
 * `_clearHandPresentation()` ran.
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
import type { SandboxObject, PlayerInfo } from '@shared/types/room';

const LOCAL_SESSION = 'session_local_1756';
const OBSERVER_SESSION = 'session_observer_1756';
const OWNER_SESSION = 'session_owner_1756';

/** Table positions far from deck (-2.5, 0), discard (2.5, 0) and each other. */
const SAFE_SPOTS = [
  { x: 0, z: 4 },
  { x: 4, z: -2 },
  { x: -4, z: 2 },
  { x: 0, z: -4.5 },
] as const;

// Deterministic rAF for the hover-expansion animation.
let rafCallbacks: (() => void)[] = [];
let rafId = 0;
const mockRaf = (cb: () => void): number => {
  rafCallbacks.push(cb);
  return ++rafId;
};
const mockCancelRaf = (): void => {
  /* no-op */
};

function flushRaf(times = 8): void {
  for (let i = 0; i < times; i++) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach((cb) => cb());
  }
}

/** Puts a card into the HAND hover state and runs the hand layout pass. */
function hoverInHand(sceneManager: SceneManager, card: CardObject3D): void {
  const im = sceneManager.getInteractionManager() as unknown as {
    _hoveredObject: CardObject3D | null;
  };
  im._hoveredObject = card;
  const zone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!);
  zone?.arrangeCards();
}

/** Drops a hand card onto empty felt through the real local drop path. */
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

describe('M1.7.6 — HAND hover must not leak into TABLE cards', () => {
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

  const hoverTable = (card: CardObject3D): void => {
    controller.onTableCardHoverChanged(
      card,
      true,
      sceneManager.getCardRegistry().getCardsOnTable()
    );
    flushRaf();
  };

  // ── H1756-01 ──────────────────────────────────────────────────────────────
  it('H1756-01: hovering a real HAND card still applies HAND scale/lift/layer', () => {
    const card = drawHandCard('h1756_01');
    const zone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

    zone.arrangeCards();
    const baselineY = card.position.y;

    hoverInHand(sceneManager, card);

    expect(card.isInHand()).toBe(true);
    expect(card.getHandZoneId()).toBe(zone.zoneId);
    expect(card.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
    expect(card.position.y).toBeCloseTo(baselineY + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 2);
    expect(card.getLayerIndex()).toBeGreaterThanOrEqual(
      HAND_ZONE_CONFIG.BASE_LAYER_INDEX + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET
    );
  });

  // ── H1756-02 ──────────────────────────────────────────────────────────────
  it('H1756-02: dropping HAND→TABLE clears presentation and stale hand ownership', () => {
    const card = drawHandCard('h1756_02');
    hoverInHand(sceneManager, card);
    expect(card.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);

    dropToTable(sceneManager, card, SAFE_SPOTS[0]!);

    expect(card.isInHand()).toBe(false);
    expect(card.getHandZoneId()).toBeNull();
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');
    expect(card.getOwnerId()).toBeNull();

    // Presentation fully reset.
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.scale.y).toBeCloseTo(1, 6);
    expect(card.scale.z).toBeCloseTo(1, 6);
    expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    expect(card.rotation.order).toBe('XYZ');
    expect(card.rotation.x).toBeCloseTo(0, 6);
    expect(card.rotation.z).toBeCloseTo(0, 6);

    // Hover bookkeeping and layer ownership moved to the table.
    expect(sceneManager.getInteractionManager().getHoveredObject()).toBeNull();
    const layering = (
      sceneManager as unknown as { _layeringManager: { getLayerOf(id: string): number } }
    )._layeringManager;
    expect(card.getLayerIndex()).toBe(layering.getLayerOf(card.cardId));
    expect(card.getLayerIndex()).toBeLessThan(HAND_ZONE_CONFIG.BASE_LAYER_INDEX);
  });

  // ── H1756-03 ──────────────────────────────────────────────────────────────
  it('H1756-03: pointer resting on the card right after drop never re-applies HAND hover', () => {
    const card = drawHandCard('h1756_03');
    hoverInHand(sceneManager, card);

    dropToTable(sceneManager, card, SAFE_SPOTS[0]!);

    const positionAfterDrop = card.position.clone();
    const scaleAfterDrop = card.scale.clone();

    // The pointer never moved: raycast hover re-targets the same card and the
    // table-hover callback fires exactly as it would on the next mousemove.
    hoverInHand(sceneManager, card); // hand layout must ignore a non-member
    hoverTable(card);

    expect(sceneManager.isTableCardOwnedByLocalPlayer(card)).toBe(false);
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');
    expect(card.scale.x).toBeCloseTo(scaleAfterDrop.x, 6);
    expect(card.scale.y).toBeCloseTo(scaleAfterDrop.y, 6);
    expect(card.position.x).toBeCloseTo(positionAfterDrop.x, 6);
    expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    expect(card.position.z).toBeCloseTo(positionAfterDrop.z, 6);
    expect(card.getLayerIndex()).toBeLessThan(HAND_ZONE_CONFIG.BASE_LAYER_INDEX);
  });

  // ── H1756-04 ──────────────────────────────────────────────────────────────
  it('H1756-04: leave and re-hover a TABLE card — no scale/lift/position change', () => {
    const card = drawHandCard('h1756_04');
    dropToTable(sceneManager, card, SAFE_SPOTS[0]!);
    const position = card.position.clone();

    hoverTable(card);
    controller.onTableCardHoverChanged(null, false, []);
    flushRaf();
    hoverTable(card);

    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.scale.y).toBeCloseTo(1, 6);
    expect(card.scale.z).toBeCloseTo(1, 6);
    expect(card.position.x).toBeCloseTo(position.x, 6);
    expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    expect(card.position.z).toBeCloseTo(position.z, 6);
  });

  // ── H1756-05 ──────────────────────────────────────────────────────────────
  it('H1756-05: hovering a TABLE card while another HAND card is hovered leaves it untouched', () => {
    const handCard = drawHandCard('h1756_05_hand');
    const tableCard = drawHandCard('h1756_05_table');
    dropToTable(sceneManager, tableCard, SAFE_SPOTS[1]!);

    hoverInHand(sceneManager, handCard);
    expect(handCard.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);

    const tablePosition = tableCard.position.clone();
    hoverTable(tableCard);

    // Table card untouched; the hand card keeps its own legal hover state.
    expect(tableCard.scale.x).toBeCloseTo(1, 6);
    expect(tableCard.position.x).toBeCloseTo(tablePosition.x, 6);
    expect(tableCard.position.z).toBeCloseTo(tablePosition.z, 6);
    expect(handCard.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
  });

  // ── H1756-06 ──────────────────────────────────────────────────────────────
  it('H1756-06: several consecutive HAND→TABLE drops are all handled correctly', () => {
    const cards = [
      drawHandCard('h1756_06a'),
      drawHandCard('h1756_06b'),
      drawHandCard('h1756_06c'),
    ];

    cards.forEach((card, i) => {
      dropToTable(sceneManager, card, SAFE_SPOTS[i]!);
    });

    for (const card of cards) {
      expect(card.isInHand()).toBe(false);
      expect(card.getOwnerId()).toBeNull();
      expect(sceneManager.isTableCardOwnedByLocalPlayer(card)).toBe(false);
      expect(card.scale.x).toBeCloseTo(1, 6);
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);

      hoverTable(card);
      expect(card.scale.x).toBeCloseTo(1, 6);
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    }
  });

  // ── H1756-07 ──────────────────────────────────────────────────────────────
  it('H1756-07: hover never changes a freely rotated TABLE card', () => {
    const card = drawHandCard('h1756_07');
    dropToTable(sceneManager, card, SAFE_SPOTS[0]!);

    // Player-established rotation (M1.7.5 free rotation).
    card.rotation.set(0, 0.731, 0);
    const position = card.position.clone();

    hoverTable(card);

    expect(card.rotation.y).toBeCloseTo(0.731, 6);
    expect(card.rotation.x).toBeCloseTo(0, 6);
    expect(card.rotation.z).toBeCloseTo(0, 6);
    expect(card.position.x).toBeCloseTo(position.x, 6);
    expect(card.position.z).toBeCloseTo(position.z, 6);
    expect(card.scale.x).toBeCloseTo(1, 6);
  });

  // ── H1756-08 ──────────────────────────────────────────────────────────────
  it('H1756-08: remote client receiving HAND→TABLE gets no HAND hover presentation', () => {
    sceneManager.setLocalSessionId(OBSERVER_SESSION);

    const card = sceneManager.syncDrawnCard('h1756_08', 0, 'attack', true, OWNER_SESSION)!;
    expect(card.isInHand()).toBe(true);

    const players: PlayerInfo[] = [
      { id: OWNER_SESSION, name: 'Owner', isHost: true, isConnected: true, playerIndex: 0 },
      { id: OBSERVER_SESSION, name: 'Observer', isHost: false, isConnected: true, playerIndex: 1 },
    ];
    const objects: SandboxObject[] = [
      {
        id: card.cardId,
        type: 'card',
        position: { x: SAFE_SPOTS[0]!.x, y: 0, z: SAFE_SPOTS[0]!.z },
        rotation: 0.42,
        faceUp: true,
        lockedBy: null,
        ownerId: null,
        location: 'TABLE',
        cardType: 'attack',
      },
    ];

    sceneManager.syncRoomObjects(objects, players);

    expect(card.isInHand()).toBe(false);
    expect(card.getOwnerId()).toBeNull();
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.rotation.y).toBeCloseTo(0.42, 6);

    hoverTable(card);
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    expect(card.rotation.y).toBeCloseTo(0.42, 6);
  });

  // ── H1756-09 ──────────────────────────────────────────────────────────────
  it('H1756-09: TABLE→HAND re-enables the real HAND hover presentation', () => {
    const card = drawHandCard('h1756_09');
    dropToTable(sceneManager, card, SAFE_SPOTS[0]!);
    expect(card.isInHand()).toBe(false);
    expect(card.getOwnerId()).toBeNull();

    const returned = sceneManager.syncTransferredCard(
      card.cardId,
      -1,
      0,
      'attack',
      true,
      1,
      undefined,
      LOCAL_SESSION
    )!;
    sceneManager.flushCardTransfers();

    expect(returned.isInHand()).toBe(true);
    expect(returned.getOwnerId()).toBe(LOCAL_SESSION);

    const zone = sceneManager.getHandZoneManager().getHandZone(returned.getHandZoneId()!)!;
    zone.arrangeCards();
    const baselineY = returned.position.y;
    hoverInHand(sceneManager, returned);

    expect(returned.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
    expect(returned.position.y).toBeCloseTo(baselineY + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 2);
    expect(returned.getLayerIndex()).toBeGreaterThanOrEqual(
      HAND_ZONE_CONFIG.BASE_LAYER_INDEX + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET
    );
  });

  // ── H1756-10 ──────────────────────────────────────────────────────────────
  it('H1756-10: repeated hover/drag cycles leave no stale references or transform leaks', () => {
    const handCard = drawHandCard('h1756_10_hand');
    const tableCard = drawHandCard('h1756_10_table');
    dropToTable(sceneManager, tableCard, SAFE_SPOTS[2]!);

    const position = tableCard.position.clone();
    const zone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

    for (let i = 0; i < 30; i++) {
      // Alternate pointer between the hand and the table card.
      hoverInHand(sceneManager, handCard);
      hoverTable(tableCard);
      hoverInHand(sceneManager, tableCard);
      controller.onTableCardHoverChanged(null, false, []);
      zone.arrangeCards();
    }

    expect(tableCard.isInHand()).toBe(false);
    expect(tableCard.getOwnerId()).toBeNull();
    expect(tableCard.scale.x).toBeCloseTo(1, 6);
    expect(tableCard.scale.y).toBeCloseTo(1, 6);
    expect(tableCard.scale.z).toBeCloseTo(1, 6);
    expect(tableCard.position.x).toBeCloseTo(position.x, 6);
    expect(tableCard.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    expect(tableCard.position.z).toBeCloseTo(position.z, 6);

    // The expansion controller holds no group after the cycle.
    expect(
      (controller as unknown as { _activeGroup: unknown })._activeGroup
    ).toBeNull();

    // The hand card still hovers correctly (M1.7.7 subtle hover).
    hoverInHand(sceneManager, handCard);
    expect(handCard.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
  });
});
