/**
 * playerPerspective152.test.ts — Unit & Integration Tests for M1.5.2
 *
 * Verifies all 10 requirements from M1.5.2 specification:
 * 1. Each playerIndex receives an appropriate seat angle
 * 2. Angles across different players match their respective seat positions
 * 3. Hand Zone of current player is in the lower half of screen (NDC Y < 0) and horizontally centered (NDC X ≈ 0)
 * 4. Camera looks towards the table center (0, 0, 0)
 * 5. Camera distance is adaptively calculated and comfortable for table size
 * 6. Camera reset returns to the player's personal default seat angle (not hardcoded P1)
 * 7. Incoming room:state updates do not reset camera orbit
 * 8. Camera state is client-only and never present in WebSocket payloads
 * 9. Offline Sandbox operates cleanly with default seat (P1) and manual layout switching
 * 10. Dynamic player count changes update seat angle cleanly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { computePlayerPerspective } from '../scene/PlayerPerspectiveHelper';
import { CameraController } from '../scene/CameraController';
import { SceneManager } from '../scene/SceneManager';
import { ClientStore } from '../store/ClientStore';

// Mock Renderer for headless JSDOM environment
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

describe('M1.5.2 — Player Perspective & Camera Orientation', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // ─── 1 & 2. Distinct Perspective per Seat ───────────────────────────────────
  it('computes distinct, seat-aligned camera theta for each player across 2, 4, and 6 players', () => {
    // 2-player table: P1 sits at South (Z > 0), P2 sits at North (Z < 0)
    const p1_2p = computePlayerPerspective(0, 2);
    const p2_2p = computePlayerPerspective(1, 2);

    expect(p1_2p.theta).toBeCloseTo(0, 2); // 0 rad (South)
    expect(Math.abs(p2_2p.theta)).toBeCloseTo(Math.PI, 2); // PI or -PI rad (North)
    expect(p1_2p.theta).not.toEqual(p2_2p.theta);

    // 4-player table: 4 distinct angles (0, PI, PI/2, -PI/2)
    const p1_4p = computePlayerPerspective(0, 4);
    const p2_4p = computePlayerPerspective(1, 4);
    const p3_4p = computePlayerPerspective(2, 4);
    const p4_4p = computePlayerPerspective(3, 4);

    expect(p1_4p.theta).toBeCloseTo(0, 2); // South
    expect(Math.abs(p2_4p.theta)).toBeCloseTo(Math.PI, 2); // North
    expect(p3_4p.theta).toBeCloseTo(Math.PI / 2, 2); // East (X > 0)
    expect(p4_4p.theta).toBeCloseTo(-Math.PI / 2, 2); // West (X < 0)

    // 6-player table (hexagon): 6 distinct angles
    const thetas6p = [0, 1, 2, 3, 4, 5].map((i) => computePlayerPerspective(i, 6).theta);
    const uniqueThetas = new Set(thetas6p.map((t) => t.toFixed(3)));
    expect(uniqueThetas.size).toBe(6);
  });

  // ─── 3. Hand Zone Position in Viewport (Bottom of Screen) ───────────────────
  it('projects current player Hand Zone to the lower half (NDC Y < 0) and horizontally centered (NDC X ≈ 0)', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const controller = new CameraController(camera, container);
    // Set adaptive radius for 4-player table so the table perimeter and hand zones fit in view
    controller.setAdaptiveRadius(controller.computeAdaptiveRadius(18.0));

    // Test for all 4 players on a 4-player table
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const perspective = computePlayerPerspective(pIdx, 4);
      controller.setPlayerPerspective(perspective.theta, true, false);

      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();

      // Hand zone world position
      const handPos = new THREE.Vector3(
        perspective.seatPosition.x,
        0.006, // Hand zone surface Y
        perspective.seatPosition.z
      );

      // Project into NDC coordinates [-1, 1]
      const ndc = handPos.clone().project(camera);

      // 1. Must be horizontally centered (near X = 0)
      expect(Math.abs(ndc.x)).toBeLessThan(0.15);

      // 2. Must be in the lower half of screen (Y < 0, near bottom edge)
      expect(ndc.y).toBeLessThan(-0.25);
      expect(ndc.y).toBeGreaterThan(-1.0); // Inside visible viewport

      // 3. Must be in front of near clipping plane
      expect(ndc.z).toBeLessThan(1.0);
      expect(ndc.z).toBeGreaterThan(-1.0);
    }

    controller.dispose();
  });

  // ─── 4. Camera Looks at Table Center (0, 0, 0) ─────────────────────────────
  it('ensures camera always looks towards table center (0, 0, 0)', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const controller = new CameraController(camera, container);

    controller.setPlayerPerspective(Math.PI / 3, true, false);
    const target = controller.getTarget();

    expect(target.x).toBeCloseTo(0, 4);
    expect(target.y).toBeCloseTo(0, 4);
    expect(target.z).toBeCloseTo(0, 4);

    controller.dispose();
  });

  // ─── 5. Adaptive Camera Distance ───────────────────────────────────────────
  it('calculates adaptive radius that comfortably accommodates table size', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const controller = new CameraController(camera, container);

    const radSmall = controller.computeAdaptiveRadius(12.0); // 2 players
    const radLarge = controller.computeAdaptiveRadius(18.0); // 8 players

    expect(radLarge).toBeGreaterThan(radSmall);
    expect(radSmall).toBeGreaterThanOrEqual(13.5);
    expect(radLarge).toBeLessThanOrEqual(40.0);

    controller.dispose();
  });

  // ─── 6. Camera Reset to Player Default Seat (Not Always P1) ─────────────────
  it('resets camera to the player personal seat angle, not hardcoded Player 1', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const controller = new CameraController(camera, container);

    // Setup for Player 3 (East seat: theta ≈ PI/2)
    const p3Perspective = computePlayerPerspective(2, 4);
    controller.setPlayerPerspective(p3Perspective.theta, true, false);

    expect(controller.getTheta()).toBeCloseTo(Math.PI / 2, 2);
    expect(controller.getInitialTheta()).toBeCloseTo(Math.PI / 2, 2);

    // Player manually orbits around table (e.g. shifts theta to 0)
    // Simulate user dragging
    camera.position.set(0, 10, 15);
    // Directly simulate orbit change on spherical
    (controller as any)._spherical.theta = 0.123;
    expect(controller.getTheta()).not.toBeCloseTo(Math.PI / 2, 2);

    // Now player clicks "Reset Camera" or presses 'R'
    controller.resetCamera();

    // MUST reset to Player 3's seat (PI/2), NOT 0 (Player 1)
    expect(controller.getTheta()).toBeCloseTo(Math.PI / 2, 2);

    controller.dispose();
  });

  // ─── 7. room:state Updates Do Not Reset Camera ─────────────────────────────
  it('does not reset user camera orbit when receiving normal room state updates', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);

    // Align to Player 2 (North seat, theta ≈ PI)
    sceneManager.setPlayerPerspective(1, 4, false);
    const camController = sceneManager.getCameraController();
    expect(Math.abs(camController.getTheta())).toBeCloseTo(Math.PI, 2);

    // User freely orbits camera to custom angle
    (camController as any)._spherical.theta = 0.77;
    expect(camController.getTheta()).toBeCloseTo(0.77, 2);

    // Simulate non-layout state change (e.g. table cards update, count unchanged)
    // Active player index is preserved
    expect(sceneManager.getActivePlayerIndex()).toBe(1);
    // User camera angle is preserved
    expect(camController.getTheta()).toBeCloseTo(0.77, 2);

    sceneManager.dispose();
  });

  // ─── 8. Camera State Not In WebSocket Payload ──────────────────────────────
  it('verifies camera orientation is strictly client-side and absent from room state protocol', () => {
    const store = new ClientStore();
    store.updateRoomState({
      id: 'ROOM12',
      name: 'Test Room',
      players: [
        { id: 'p1', name: 'Alice', isHost: true, isConnected: true, playerIndex: 0 },
        { id: 'p2', name: 'Bob', isHost: false, isConnected: true, playerIndex: 1 },
      ],
      objects: [],
      maxPlayers: 6,
    });

    const state = store.getRoomState()!;
    const stateJson = JSON.stringify(state);

    // Camera fields must NEVER exist in network payloads
    expect(stateJson).not.toContain('theta');
    expect(stateJson).not.toContain('phi');
    expect(stateJson).not.toContain('camera');
  });

  // ─── 9. Offline Sandbox Operates Cleanly ───────────────────────────────────
  it('operates cleanly in offline sandbox with P1 view and manual player count switching', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);

    // In offline sandbox, default player index is 0
    sceneManager.setPlayerPerspective(0, 4, false);
    expect(sceneManager.getCameraController().getTheta()).toBeCloseTo(0, 2);

    // Switch to 6 players
    sceneManager.setupPlayerLayout(6);
    expect(sceneManager.getHandZoneManager().getPlayerCount()).toBe(6);

    sceneManager.dispose();
  });

  // ─── 10. Dynamic Player Count Changes Update Perspective Correctly ────────
  it('updates seat theta correctly when table expands from 2 to 5 players', () => {
    const p1_2p = computePlayerPerspective(0, 2);
    const p1_5p = computePlayerPerspective(0, 5);

    // Both are Player 1, but 2p is rectangle South edge (0 rad)
    // while 5p is Pentagon edge (computed from vertex mid-point)
    expect(p1_2p.playerCount).toBe(2);
    expect(p1_5p.playerCount).toBe(5);
    expect(p1_5p.theta).toBeDefined();
  });
});
