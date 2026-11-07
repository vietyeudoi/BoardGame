/**
 * seatOrientation1752.test.ts — M1.7.5 Part 2: Per-seat Default Card Orientation
 *
 * Verifies that the default HAND→TABLE rotation is:
 * 1. Derived from the ACTING player's seat (atan2(seat.x, seat.z)) for every
 *    seat of every 2–8 player table — no camera, no hardcoding.
 * 2. Deterministic across clients (pure function of seat + count).
 * 3. Computed ONCE at the HAND→TABLE transition — room:state snapshots never
 *    recompute it and never overwrite a manual TABLE rotation.
 * 4. Carried by the object:drag-end broadcast so all clients see the same yaw.
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
import { computeTableZones } from '../objects/TableZonesConfig';
import type { CardObject3D } from '../objects/CardObject3D';
import type { PlayerCount } from '../objects/TableShapeConfig';
import type { SandboxObject, PlayerInfo } from '@shared/types/room';

const LOCAL_SESSION = 'session_local_1752';

describe('M1.7.5 Part 2 — Seat-based default TABLE orientation', () => {
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

  function dropToTable(card: CardObject3D, x = 2, z = 2): void {
    card.position.set(x, 0, z);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(card);
  }

  it('1. yaw equals atan2(seat.x, seat.z) for every seat of 2–8 player tables', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8] as PlayerCount[]) {
      const zones = computeTableZones(count);
      for (let i = 0; i < count; i++) {
        const seat = zones.playerAreas[i]!;
        const expected = Math.atan2(seat.x, seat.z);
        expect(sceneManager.getDefaultTableRotationForSeat(i, count)).toBeCloseTo(expected, 9);
      }
    }
  });

  it('2. Out-of-range seat indexes wrap safely (never NaN, never hardcoded)', () => {
    expect(sceneManager.getDefaultTableRotationForSeat(7, 4)).toBeCloseTo(
      sceneManager.getDefaultTableRotationForSeat(3, 4),
      9
    );
    expect(sceneManager.getDefaultTableRotationForSeat(-1, 4)).toBeCloseTo(
      sceneManager.getDefaultTableRotationForSeat(3, 4),
      9
    );
    // Defensive clamp for degenerate counts (single-player / offline sandbox).
    const one = sceneManager.getDefaultTableRotationForSeat(0, 1 as PlayerCount);
    expect(Number.isFinite(one)).toBe(true);
    expect(one).toBeCloseTo(sceneManager.getDefaultTableRotationForSeat(0, 2), 9);
  });

  it('3. HAND→TABLE drop applies the acting seat yaw (differs per seat)', () => {
    // Player 0 acts (4 seats).
    sceneManager.setPlayerPerspective(0, 4, false);
    const cardA = sceneManager.syncDrawnCard('c_seat0', 0, 'attack', true, LOCAL_SESSION)!;
    dropToTable(cardA);

    const seat0 = computeTableZones(4).playerAreas[0]!;
    expect(cardA.rotation.y).toBeCloseTo(Math.atan2(seat0.x, seat0.z), 9);

    // Player 1 acts (same table).
    sceneManager.setPlayerPerspective(1, 4, false);
    const cardB = sceneManager.syncDrawnCard('c_seat1', 1, 'favor', true, LOCAL_SESSION)!;
    dropToTable(cardB, -2, 2);

    const seat1 = computeTableZones(4).playerAreas[1]!;
    expect(cardB.rotation.y).toBeCloseTo(Math.atan2(seat1.x, seat1.z), 9);
    expect(cardB.isInStack()).toBe(false);
    expect(cardA.isInStack()).toBe(false);

    // Opposite seats differ by ~π — proves it is seat-derived, not constant.
    const diff = Math.abs(cardA.rotation.y - cardB.rotation.y);
    const wrapped = Math.min(diff, Math.PI * 2 - diff);
    expect(wrapped).toBeCloseTo(Math.PI, 5);
  });

  it('4. Orientation is computed once — room:state never recomputes or overwrites it', () => {
    sceneManager.setPlayerPerspective(2, 6, false);
    const card = sceneManager.syncDrawnCard('c_once', 2, 'defuse', true, LOCAL_SESSION)!;
    dropToTable(card);

    const seat2 = computeTableZones(6).playerAreas[2]!;
    const seatYaw = Math.atan2(seat2.x, seat2.z);
    expect(card.rotation.y).toBeCloseTo(seatYaw, 9);

    const players: PlayerInfo[] = [
      { id: LOCAL_SESSION, name: 'Alice', isHost: true, isConnected: true, playerIndex: 0 },
    ];
    const snapshot = (rotation: number): SandboxObject[] => [
      {
        id: card.cardId,
        type: 'card',
        position: { x: 2, y: 0, z: 2 },
        rotation,
        faceUp: true,
        lockedBy: null,
        ownerId: null,
        location: 'TABLE',
        cardType: 'defuse',
      },
    ];

    // A snapshot carrying the same stored yaw is a no-op (still the seat yaw).
    sceneManager.syncRoomObjects(snapshot(seatYaw), players);
    expect(card.rotation.y).toBeCloseTo(seatYaw, 9);

    // Manual TABLE rotation: snapshots must NEVER reset it (spec 2.3).
    card.rotation.y = 1.234;
    sceneManager.syncRoomObjects(snapshot(seatYaw), players);
    sceneManager.syncRoomObjects(snapshot(0), players);
    expect(card.rotation.y).toBeCloseTo(1.234, 6);
  });

  it('5. object:drag-end broadcast carries the current table yaw (Part 2 plumbing)', () => {
    sceneManager.setPlayerPerspective(0, 4, false);
    const card = sceneManager.syncDrawnCard('c_broadcast_yaw', 0, 'shuffle', true, LOCAL_SESSION)!;
    dropToTable(card);

    const dragCtrl = sceneManager.getDragController();
    const calls: Array<{ objectId: string; rotation?: number }> = [];
    dragCtrl.onDragEndBroadcast = (objectId, _pos, _faceUp, _target, rotation) => {
      calls.push({ objectId, rotation });
    };

    (dragCtrl as unknown as { _broadcastDragEnd: (c: CardObject3D) => void })._broadcastDragEnd(card);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.objectId).toBe(card.cardId);
    const seat0 = computeTableZones(4).playerAreas[0]!;
    expect(calls[0]!.rotation).toBeCloseTo(Math.atan2(seat0.x, seat0.z), 9);
  });

  it('6. Seat yaw differs across table sizes for the same seat index (no 4-seat hardcode)', () => {
    const yaw4 = sceneManager.getDefaultTableRotationForSeat(1, 4);
    const yaw8 = sceneManager.getDefaultTableRotationForSeat(1, 8);
    const yaw3 = sceneManager.getDefaultTableRotationForSeat(1, 3);
    const seat1of4 = computeTableZones(4).playerAreas[1]!;
    const seat1of8 = computeTableZones(8).playerAreas[1]!;
    expect(yaw4).toBeCloseTo(Math.atan2(seat1of4.x, seat1of4.z), 9);
    expect(yaw8).toBeCloseTo(Math.atan2(seat1of8.x, seat1of8.z), 9);
    expect(Math.abs(yaw4 - yaw8)).toBeGreaterThan(1e-6);
    expect(Math.abs(yaw3 - yaw4)).toBeGreaterThan(1e-6);
  });
});
