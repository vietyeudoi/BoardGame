/**
 * opponentHoverDrag1741.test.ts — M1.7.4.1
 *
 * Regression coverage for the two M1.7.4 follow-up bugs:
 *
 * A. Opponent-card hover used to run the local hand hover/reveal branch, which
 *    lifted, pitched and scaled the card. Opponent hands must keep their exact
 *    slot transform; only the raycast highlight may react to hover.
 *
 * B. Opponent-card drag never survived because (1) the server rejects an
 *    opponent hand `object:drag-start`, and that error aborted the visual drag,
 *    and (2) hand `arrangeCards()` overwrote the pointer-driven transform. The
 *    drag must own `layoutControlled` while active, and the visual gesture must
 *    stay independent from gameplay authorization.
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
import { CardObject3D } from '../objects/CardObject3D';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';
import { RaycastInteractionManager } from '../interaction/RaycastInteractionManager';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { INTERACTION_CONFIG } from '../interaction/InteractionConfig';

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOCAL_PLAYER = 0;
const OPPONENT_PLAYER = 1;

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
    toJSON: () => ({}),
  });
  return container;
}

type SceneInternals = {
  _renderer: { getCamera: () => THREE.PerspectiveCamera };
};

function getSceneCamera(sceneManager: SceneManager): THREE.PerspectiveCamera {
  const camera = (sceneManager as unknown as SceneInternals)._renderer.getCamera();
  camera.updateMatrixWorld(true);
  return camera;
}

/** Projects a world point on the drag plane to canvas client coordinates. */
function clientForWorldPoint(
  sceneManager: SceneManager,
  x: number,
  z: number
): { x: number; y: number } {
  const camera = getSceneCamera(sceneManager);
  const world = new THREE.Vector3(x, TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y, z);
  const ndc = world.project(camera);
  return {
    x: ((ndc.x + 1) / 2) * 1024,
    y: ((1 - ndc.y) / 2) * 768,
  };
}

function pointerDown(
  sceneManager: SceneManager,
  card: CardObject3D,
  client: { x: number; y: number }
): void {
  sceneManager.getInteractionManager().onCardMouseDown?.(
    card,
    new MouseEvent('mousedown', { button: 0, clientX: client.x, clientY: client.y })
  );
}

function pointerMove(client: { x: number; y: number }): void {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: client.x, clientY: client.y }));
}

function pointerUp(client: { x: number; y: number }): void {
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: client.x, clientY: client.y }));
}

/** Starts a drag on a hand card and moves its pointer target. */
function dragCardTo(
  sceneManager: SceneManager,
  card: CardObject3D,
  targetX: number,
  targetZ: number
): void {
  const start = clientForWorldPoint(sceneManager, card.position.x, card.position.z);
  pointerDown(sceneManager, card, start);
  pointerMove(clientForWorldPoint(sceneManager, targetX, targetZ));
}

// ─── A. Hover presentation ──────────────────────────────────────────────────

describe('M1.7.4.1 — opponent hand hover presentation', () => {
  function makeZone(
    isLocalPlayer: boolean,
    hoveredRef: { id: string | null }
  ): HandZoneObject3D {
    return new HandZoneObject3D({
      id: isLocalPlayer ? 'local_zone' : 'opponent_zone',
      playerIndex: isLocalPlayer ? LOCAL_PLAYER : OPPONENT_PLAYER,
      x: 0,
      z: 5,
      rotationY: 0,
      label: 'Zone',
      width: 5.2,
      isLocalPlayer,
      isCardHovered: (card) => card.cardId === hoveredRef.id,
    });
  }

  function addCards(zone: HandZoneObject3D, count: number): CardObject3D[] {
    const cards: CardObject3D[] = [];
    for (let i = 0; i < count; i++) {
      const card = new CardObject3D({ id: `card_${i}`, faceUp: true });
      zone.addCard(card);
      cards.push(card);
    }
    return cards;
  }

  function snapshot(
    card: CardObject3D
  ): { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } {
    return {
      position: card.position.clone(),
      rotation: card.rotation.clone(),
      scale: card.scale.clone(),
    };
  }

  it('does not lift, pitch, scale or move an opponent card on hover', () => {
    const hoveredRef: { id: string | null } = { id: null };
    const zone = makeZone(false, hoveredRef);
    const cards = addCards(zone, 3);
    zone.arrangeCards();

    const before = cards.map(snapshot);
    hoveredRef.id = 'card_1';
    zone.arrangeCards();

    cards.forEach((card, i) => {
      expect(card.position.distanceTo(before[i]!.position)).toBeLessThan(1e-9);
      expect(card.rotation.x).toBeCloseTo(before[i]!.rotation.x, 9);
      expect(card.rotation.y).toBeCloseTo(before[i]!.rotation.y, 9);
      expect(card.scale.distanceTo(before[i]!.scale)).toBeLessThan(1e-9);
    });

    // The local reveal branch must not be applied at all.
    expect(cards[1]!.rotation.x).toBe(0);
    expect(cards[1]!.scale.x).toBe(1);
  });

  it('restores the same opponent presentation on hover-out', () => {
    const hoveredRef: { id: string | null } = { id: null };
    const zone = makeZone(false, hoveredRef);
    const cards = addCards(zone, 3);
    zone.arrangeCards();
    const rest = cards.map(snapshot);

    hoveredRef.id = 'card_0';
    zone.arrangeCards();
    hoveredRef.id = null;
    zone.arrangeCards();

    cards.forEach((card, i) => {
      expect(card.position.distanceTo(rest[i]!.position)).toBeLessThan(1e-9);
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.scale.x).toBe(1);
    });
  });

  it('never applies any hand presentation to an opponent hand', () => {
    const hoveredRef: { id: string | null } = { id: 'card_2' };
    const zone = makeZone(false, hoveredRef);
    const cards = addCards(zone, 3);

    zone.arrangeCards();

    for (const card of cards) {
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.scale.x).toBe(1);
    }
  });

  it('keeps the local card hover reveal consistent with the M1.7.7 subtle hover', () => {
    const hoveredRef: { id: string | null } = { id: null };
    const zone = makeZone(true, hoveredRef);
    const cards = addCards(zone, 3);
    zone.arrangeCards();

    const baseElevation = cards[1]!.position.y;
    hoveredRef.id = 'card_1';
    zone.arrangeCards();

    // M1.7.7: hover is a subtle lift + tiny scale; no stand-up pitch, no fan.
    expect(cards[1]!.rotation.x).toBeCloseTo(0, 9);
    expect(cards[1]!.position.y).toBeGreaterThan(baseElevation + HAND_ZONE_CONFIG.HOVER_LIFT_Y / 2);
    expect(cards[1]!.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 9);
  });

  it('keeps the local hand flat and only applies the subtle hover presentation', () => {
    const hoveredRef: { id: string | null } = { id: null };
    const zone = makeZone(true, hoveredRef);
    const cards = addCards(zone, 4);
    zone.arrangeCards();

    // M1.7.7.1: every local hand card is flat.
    for (const card of cards) {
      expect(card.rotation.x).toBeCloseTo(0, 9);
      expect(card.position.y).toBeLessThan(HAND_ZONE_CONFIG.SURFACE_Y + 0.05);
    }

    hoveredRef.id = 'card_0';
    zone.arrangeCards();

    // Hover: gentle lift + tiny scale, still flat, neighbours untouched.
    expect(cards[0]!.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 9);
    expect(cards[0]!.rotation.x).toBeCloseTo(0, 9);
    expect(cards[1]!.scale.x).toBeCloseTo(1, 9);
    expect(cards[1]!.rotation.x).toBeCloseTo(0, 9);
  });

  it('still applies the raycast hover highlight to a masked opponent card', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 8, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const domElement = document.createElement('canvas');
    Object.defineProperty(domElement, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
      configurable: true,
    });

    const manager = new RaycastInteractionManager(camera, domElement, () => {});
    const card = new CardObject3D({ id: 'opponent_highlight', faceUp: true });
    card.setMasked(true);
    manager.registerObject(card.cardId, card);

    const hoveredTarget = manager as unknown as { _hoveredObject: CardObject3D | null };

    const mesh = card.getMesh();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const hoveredMaterials = materials.filter(
      (mat): mat is THREE.MeshStandardMaterial => mat instanceof THREE.MeshStandardMaterial
    );
    expect(hoveredMaterials.length).toBeGreaterThan(0);

    const base = hoveredMaterials.map((mat) => ({
      color: mat.emissive.getHex(),
      intensity: mat.emissiveIntensity,
    }));

    hoveredTarget._hoveredObject = card;
    manager.refreshObjectHighlight(card);

    for (const mat of hoveredMaterials) {
      expect(mat.emissiveIntensity).toBeCloseTo(INTERACTION_CONFIG.HOVER_EMISSIVE_INTENSITY, 9);
      expect(mat.emissive.getHex()).toBe(INTERACTION_CONFIG.HOVER_EMISSIVE_COLOR);
    }

    // Hover-out restores the pristine highlight.
    hoveredTarget._hoveredObject = null;
    manager.refreshObjectHighlight(card);
    hoveredMaterials.forEach((mat, i) => {
      expect(mat.emissive.getHex()).toBe(base[i]!.color);
      expect(mat.emissiveIntensity).toBeCloseTo(base[i]!.intensity, 9);
    });
    expect(hoveredMaterials[0]!.emissive.getHex()).toBe(0x000000);

    manager.dispose();
    card.dispose();
  });
});

// ─── B. Drag pipeline ───────────────────────────────────────────────────────

describe('M1.7.4.1 — opponent card drag pipeline', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = createMockContainer();
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(LOCAL_PLAYER, 4, false);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  function drawOpponentCard(id: string): CardObject3D {
    const card = sceneManager.syncDrawnCard(id, OPPONENT_PLAYER, 'cat-boom', true)!;
    expect(card.isInHand()).toBe(true);
    expect(sceneManager.isCardInOpponentHand(card)).toBe(true);
    return card;
  }

  function drawLocalCard(id: string): CardObject3D {
    const card = sceneManager.syncDrawnCard(id, LOCAL_PLAYER, 'cat-boom', true)!;
    expect(card.isInHand()).toBe(true);
    expect(sceneManager.isCardInOpponentHand(card)).toBe(false);
    return card;
  }

  it('starts a visual drag on an opponent card and follows the pointer', () => {
    const card = drawOpponentCard('m1741-drag-start');
    const drag = sceneManager.getDragController();
    const startX = card.position.x;
    const startZ = card.position.z;

    dragCardTo(sceneManager, card, startX + 2.5, startZ + 1.5);

    expect(drag.isDragging()).toBe(true);
    expect(drag.getDraggedCard()).toBe(card);
    expect(card.isLayoutControlled()).toBe(true);
    expect(card.position.x).not.toBeCloseTo(startX, 3);
    expect(
      Math.hypot(card.position.x - startX, card.position.z - startZ)
    ).toBeGreaterThan(0.5);
  });

  it('keeps the dragged card stable through layout/prview re-arranges', () => {
    const card = drawOpponentCard('m1741-layout-isolation');
    const sourceZone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!)!;

    dragCardTo(sceneManager, card, card.position.x + 2, card.position.z);

    const midDrag = {
      position: card.position.clone(),
      rotation: card.rotation.clone(),
      scale: card.scale.clone(),
    };

    sourceZone.arrangeCards();
    sceneManager.getHandZoneManager().rearrangeAllHands();
    sourceZone.arrangeCards();

    expect(card.position.distanceTo(midDrag.position)).toBeLessThan(1e-9);
    expect(card.rotation.x).toBeCloseTo(midDrag.rotation.x, 9);
    expect(card.scale.distanceTo(midDrag.scale)).toBeLessThan(1e-9);
  });

  it('cancels an opponent drag and restores the exact original slot', () => {
    const card = drawOpponentCard('m1741-cancel');
    const sourceZone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!)!;
    const slot = sourceZone.getCardSlotTransform(card).position.clone();
    const drag = sceneManager.getDragController();

    dragCardTo(sceneManager, card, card.position.x + 2, card.position.z + 1);
    expect(drag.isDragging()).toBe(true);

    drag.cancelDrag();

    expect(drag.isDragging()).toBe(false);
    expect(card.isLayoutControlled()).toBe(false);
    expect(card.getHandZoneId()).toBe(sourceZone.zoneId);
    expect(sourceZone.hasCard(card.cardId)).toBe(true);
    expect(card.position.distanceTo(slot)).toBeLessThan(1e-6);
    // M1.7.4.3: Opponent hand card is masked to local viewer
    expect(card.isMasked()).toBe(true);
    expect(card.isFaceUp()).toBe(true);
  });

  it('moves an opponent card dropped on the table to the table (M1.7.4.2)', () => {
    const card = drawOpponentCard('m1741-invalid-drop');
    const sourceZone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!)!;
    const requestSpy = vi.fn();
    sceneManager.onCardTransferRequested = requestSpy;

    // Drop at the table centre (outside every hand zone).
    dragCardTo(sceneManager, card, 0, 0);
    pointerUp(clientForWorldPoint(sceneManager, 0, 0));

    expect(sceneManager.getDragController().isDragging()).toBe(false);
    expect(card.getHandZoneId()).toBeNull();
    expect(sourceZone.hasCard(card.cardId)).toBe(false);
    expect(card.isFaceUp()).toBe(true);
    expect(card.isLayoutControlled()).toBe(false);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('sends exactly one authorized transfer request for a local hand drop', () => {
    const card = drawLocalCard('m1741-transfer');
    const sourceZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(LOCAL_PLAYER)!;
    const targetZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(2)!;
    const slot = sourceZone.getCardSlotTransform(card).position.clone();
    const requestSpy = vi.fn();
    sceneManager.onCardTransferRequested = requestSpy;

    dragCardTo(sceneManager, card, targetZone.position.x, targetZone.position.z);
    expect(card.position.x).toBeCloseTo(targetZone.position.x, 1);
    expect(card.isLayoutControlled()).toBe(true);

    pointerUp(clientForWorldPoint(sceneManager, targetZone.position.x, targetZone.position.z));

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledWith(card.cardId, 2);
    expect(sceneManager.isCardTransferAnimating(card.cardId)).toBe(true);
    // The pending transfer — not the drag — owns the card now.
    expect(card.isLayoutControlled()).toBe(true);
    // M1.7.4.3: Masked while pending transfer to opponent
    expect(card.isMasked()).toBe(true);

    // Drag cleanup happened without stealing layout ownership from the pending transfer.
    expect(sceneManager.getDragController().isDragging()).toBe(false);

    sceneManager.handleServerRejection(card.cardId, 'TARGET_PLAYER_NOT_FOUND');

    expect(sceneManager.isCardTransferAnimating(card.cardId)).toBe(false);
    expect(card.getHandZoneId()).toBe(sourceZone.zoneId);
    expect(sourceZone.hasCard(card.cardId)).toBe(true);
    expect(card.position.distanceTo(slot)).toBeLessThan(1e-6);
    expect(card.isLayoutControlled()).toBe(false);
    expect(card.isMasked()).toBe(false);
    expect(card.isFaceUp()).toBe(true);

    // A repeated rejection must not duplicate or drop the card.
    sceneManager.handleServerRejection(card.cardId, 'NOT_CARD_OWNER');
    expect(sourceZone.getCards().filter((c) => c.cardId === card.cardId)).toHaveLength(1);
  });

  it('keeps local drag working and drops back into its own hand slot', () => {
    const card = drawLocalCard('m1741-local-drag');
    const localZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(LOCAL_PLAYER)!;
    const slot = localZone.getCardSlotTransform(card).position.clone();
    const requestSpy = vi.fn();
    sceneManager.onCardTransferRequested = requestSpy;

    dragCardTo(sceneManager, card, card.position.x + 1.5, card.position.z + 0.5);
    expect(sceneManager.getDragController().isDragging()).toBe(true);

    // Drop back onto the local hand zone.
    pointerUp(clientForWorldPoint(sceneManager, localZone.position.x, localZone.position.z));

    expect(requestSpy).not.toHaveBeenCalled();
    expect(card.getHandZoneId()).toBe(localZone.zoneId);
    expect(localZone.hasCard(card.cardId)).toBe(true);
    expect(card.position.distanceTo(slot)).toBeLessThan(1e-6);
    expect(card.isLayoutControlled()).toBe(false);
    expect(card.isMasked()).toBe(false);
  });

  it('supports repeated opponent drags without losing or duplicating the card', () => {
    const card = drawOpponentCard('m1741-repeat');
    const sourceZone = sceneManager.getHandZoneManager().getHandZone(card.getHandZoneId()!)!;
    const allBefore = sceneManager.getAllCards().filter((c) => c.cardId === card.cardId).length;
    expect(allBefore).toBe(1);
    const slot = sourceZone.getCardSlotTransform(card).position.clone();

    for (let i = 0; i < 3; i++) {
      dragCardTo(sceneManager, card, card.position.x + 1, card.position.z);
      expect(sceneManager.getDragController().isDragging()).toBe(true);
      expect(card.isLayoutControlled()).toBe(true);

      sceneManager.getDragController().cancelDrag();

      expect(card.isLayoutControlled()).toBe(false);
      expect(card.position.distanceTo(slot)).toBeLessThan(1e-6);
      expect(sourceZone.hasCard(card.cardId)).toBe(true);
    }

    expect(sceneManager.getAllCards().filter((c) => c.cardId === card.cardId)).toHaveLength(1);
  });

  it('does not broadcast private hand drag transforms to peers', () => {
    const card = drawOpponentCard('m1741-privacy');
    const drag = sceneManager.getDragController();
    const startSpy = vi.fn();
    const moveSpy = vi.fn();
    const endSpy = vi.fn();
    drag.onDragStartBroadcast = startSpy;
    drag.onDragMoveBroadcast = moveSpy;
    drag.onDragEndBroadcast = endSpy;

    dragCardTo(sceneManager, card, card.position.x + 2, card.position.z);
    pointerMove(clientForWorldPoint(sceneManager, card.position.x + 3, card.position.z));

    expect(drag.isDragging()).toBe(true);
    expect(startSpy).not.toHaveBeenCalled();
    expect(moveSpy).not.toHaveBeenCalled();

    // Drop is still sent for server authorization (single request path).
    pointerUp(clientForWorldPoint(sceneManager, card.position.x, card.position.z));
    expect(endSpy).toHaveBeenCalledTimes(1);
  });
});
