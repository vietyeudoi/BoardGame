/**
 * handTableHoverReset1751.test.ts — M1.7.5 Part 1: HAND→TABLE Hover/Presentation Reset
 *
 * Verifies that once a card leaves a Hand Zone for the table:
 * 1. Hover presentation is cleared: subtle hover scale, elevated hand layer
 *    (BASE + idx + HOVER_LAYER_OFFSET), flat orientation, hover lift elevation.
 * 2. The raycast hover no longer points at the card (HandZone stops controlling it).
 * 3. The local hand fan preview collapses.
 * 4. Layer index is re-synced through the table LayeringManager.
 * 5. Remote room:state transitions (HAND → TABLE on observers) apply the same reset.
 * 6. TABLE select / drag / rotate / highlight keep working after the reset.
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
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';
import { TABLE_CONFIG } from '../objects/TableConfig';
import type { CardObject3D } from '../objects/CardObject3D';
import type { SandboxObject, PlayerInfo } from '@shared/types/room';

const LOCAL_SESSION = 'session_local_1751';

describe('M1.7.5 Part 1 — HAND→TABLE hover & presentation reset', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, false);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  /** Puts `card` into the local hand hover state and runs the layout pass. */
  function applyHoverPresentation(card: CardObject3D): void {
    const im = sceneManager.getInteractionManager() as unknown as { _hoveredObject: CardObject3D | null };
    im._hoveredObject = card;
    const zone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
    zone.arrangeCards();
  }

  it('1. Drop clears hover scale, hand layer, pitch and YXZ order', () => {
    const card = sceneManager.syncDrawnCard('c_hover_reset', 0, 'attack', true, LOCAL_SESSION)!;
    const zone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
    expect(zone.hasCard(card.cardId)).toBe(true);

    applyHoverPresentation(card);
    // Sanity: hand hover presentation is active (subtle hover scale + small layer bump).
    expect(card.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
    expect(card.getLayerIndex()).toBeGreaterThanOrEqual(
      HAND_ZONE_CONFIG.BASE_LAYER_INDEX + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET
    );
    expect(card.isInHand()).toBe(true);

    // Drop onto empty felt (outside all hand / deck / discard zones).
    card.position.set(2, 0, 2);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D, g?: boolean, f?: CardObject3D[]) => void })
      ._onCardDropped(card, false, []);

    expect(card.isInHand()).toBe(false);
    expect(card.getHandZoneId()).toBeNull();
    expect(zone.hasCard(card.cardId)).toBe(false);
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');

    // Scale boost gone.
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.scale.y).toBeCloseTo(1, 6);
    expect(card.scale.z).toBeCloseTo(1, 6);

    // Flat canonical table transform (no pitch, no hand yaw order).
    expect(card.rotation.order).toBe('XYZ');
    expect(card.rotation.x).toBeCloseTo(0, 6);
    expect(card.rotation.z).toBeCloseTo(0, 6);
    expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);

    // Hover bookkeeping cleared — the HandZone no longer controls the card.
    expect(sceneManager.getInteractionManager().getHoveredObject()).toBeNull();

    // Layer re-synced through the table LayeringManager (hand boost gone).
    const layering = (sceneManager as unknown as { _layeringManager: { getLayerOf(id: string): number } })
      ._layeringManager;
    expect(card.getLayerIndex()).toBe(layering.getLayerOf(card.cardId));
    expect(card.getLayerIndex()).toBeLessThan(HAND_ZONE_CONFIG.BASE_LAYER_INDEX);
  });

  it('2. A hand card that leaves for the table carries no hand presentation', () => {
    const card = sceneManager.syncDrawnCard('c_preview_collapse', 0, 'defuse', true, LOCAL_SESSION)!;
    const zone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

    // M1.7.7.1: the hand is always flat; hovering only produces a subtle lift.
    applyHoverPresentation(card);
    expect(card.rotation.x).toBeCloseTo(0, 9);
    expect(card.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 6);

    card.position.set(2, 0, 2);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(card);

    expect(card.isInHand()).toBe(false);
    expect(zone.hasCard(card.cardId)).toBe(false);
    expect(card.rotation.x).toBeCloseTo(0, 9);
    expect(card.scale.x).toBeCloseTo(1, 6);
  });

  it('3. Group followers leaving the hand are reset too', () => {
    const c1 = sceneManager.syncDrawnCard('c_group_leader', 0, 'attack', true, LOCAL_SESSION)!;
    const c2 = sceneManager.syncDrawnCard('c_group_follower', 0, 'favor', true, LOCAL_SESSION)!;
    applyHoverPresentation(c1);
    expect(c1.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);

    c1.position.set(2, 0, 2);
    c2.position.set(2.3, 0, 2);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D, g?: boolean, f?: CardObject3D[]) => void })
      ._onCardDropped(c1, true, [c2]);

    for (const c of [c1, c2]) {
      expect(c.isInHand()).toBe(false);
      expect(c.scale.x).toBeCloseTo(1, 6);
      expect(c.rotation.order).toBe('XYZ');
      expect(c.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
      const layering = (sceneManager as unknown as { _layeringManager: { getLayerOf(id: string): number } })
        ._layeringManager;
      expect(c.getLayerIndex()).toBe(layering.getLayerOf(c.cardId));
    }
  });

  it('4. Remote room:state HAND→TABLE transition applies the same reset and stored rotation', () => {
    const card = sceneManager.syncDrawnCard('c_remote_transition', 0, 'shuffle', true, LOCAL_SESSION)!;
    const zone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
    applyHoverPresentation(card);
    expect(card.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);

    const players: PlayerInfo[] = [
      { id: LOCAL_SESSION, name: 'Alice', isHost: true, isConnected: true, playerIndex: 0 },
    ];
    const objects: SandboxObject[] = [
      {
        id: card.cardId,
        type: 'card',
        position: { x: 1, y: 0, z: -1 },
        rotation: 0.7,
        faceUp: true,
        lockedBy: null,
        ownerId: null,
        location: 'TABLE',
        cardType: 'shuffle',
      },
    ];

    sceneManager.syncRoomObjects(objects, players);

    expect(card.isInHand()).toBe(false);
    expect(zone.hasCard(card.cardId)).toBe(false);
    expect(card.scale.x).toBeCloseTo(1, 6);
    expect(card.rotation.order).toBe('XYZ');
    // Authoritative first landing adopts the stored seat yaw (Part 2/3).
    expect(card.rotation.y).toBeCloseTo(0.7, 6);
    // Position comes from the snapshot.
    expect(card.position.x).toBeCloseTo(1, 5);
    expect(card.position.z).toBeCloseTo(-1, 5);
  });

  it('5. TABLE interactions keep working after the reset (select, drag eligibility, rotate)', () => {
    const card = sceneManager.syncDrawnCard('c_table_still_live', 0, 'attack', true, LOCAL_SESSION)!;
    card.position.set(2, 0, 2);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(card);

    const im = sceneManager.getInteractionManager();
    const dragCtrl = sceneManager.getDragController();

    // Select works on the table card.
    im.selectObject(card);
    expect(im.isSelected(card)).toBe(true);
    expect(im.getSelectedCards()).toContain(card);

    // Drag eligibility intact (selection highlight path intact).
    expect(dragCtrl.canDragCard!(card)).toBe(true);

    // Rotate works (selection is live; no hand layout fights the transform).
    const before = card.getRotationY();
    sceneManager.rotateSelectedCards(1);
    expect(card.getRotationY()).toBeCloseTo((before + Math.PI / 2) % (Math.PI * 2), 5);
  });

  it('6. Hand card R-rotation is local-only — never emitted for sync (privacy)', () => {
    const handCard = sceneManager.syncDrawnCard('c_hand_rot', 0, 'attack', true, LOCAL_SESSION)!;
    const tableCard = sceneManager.syncDrawnCard('c_table_rot', 0, 'favor', true, LOCAL_SESSION)!;
    tableCard.position.set(2, 0, 2);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(tableCard);

    const im = sceneManager.getInteractionManager();
    im.selectObject(handCard);
    im.selectObject(tableCard, true);

    const updates: Array<{ objectId: string }> = [];
    sceneManager.onObjectsRotationChanged = (u) => updates.push(...u);

    sceneManager.rotateSelectedCards(1);

    const ids = updates.map((u) => u.objectId);
    expect(ids).toContain(tableCard.cardId);
    expect(ids).not.toContain(handCard.cardId);
  });
});
