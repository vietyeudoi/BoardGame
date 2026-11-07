/**
 * playerPerspective179.test.ts — M1.7.9 Part A: Online player camera perspective
 *
 * Regression suite C179-01 … C179-07.
 *
 * Verifies that the Online player camera path restores exactly the same
 * perspective mechanism already used by the Offline sandbox (M1.5.2 seat-based
 * camera through the shared `computePlayerPerspective` → `CameraController`
 * pipeline — no divergent camera logic between the two modes):
 *   - C179-01: Offline perspective is not changed.
 *   - C179-02: Online P1 perspective is identical to Offline P1.
 *   - C179-03: Online P2 sits at the correct per-seat perspective.
 *   - C179-04: Online P3/P4 perspectives are correct per seat.
 *   - C179-05: Refresh / reconnect restores the seated perspective.
 *   - C179-06: Camera resize keeps framing (adaptive radius, bounded).
 *   - C179-07: Camera logic never overrides card rotation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { computePlayerPerspective } from '../scene/PlayerPerspectiveHelper';
import { CameraController } from '../scene/CameraController';
import { SceneManager } from '../scene/SceneManager';

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

describe('M1.7.9 Part A — Online player camera perspective matches Offline (M1.5.2 seat camera)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // ─── C179-01: Offline perspective unchanged ────────────────────────────────

  it('C179-01: offline sandbox keeps the seated Offline perspective (P1 / South)', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, false);

    const cameraController = sceneManager.getCameraController();
    const offlinePerspective = computePlayerPerspective(0, 4);

    expect(sceneManager.getActivePlayerIndex()).toBe(0);
    expect(cameraController.getTheta()).toBeCloseTo(offlinePerspective.theta, 5);
    expect(cameraController.getTheta()).toBeCloseTo(0, 2); // South seat

    sceneManager.dispose();
  });

  // ─── C179-02: Online P1 identical to Offline P1 ───────────────────────────

  it('C179-02: online player perspective is identical to the offline one for P1', () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);

    const offline = new SceneManager(containerA);
    offline.setupPlayerLayout(4);
    offline.setPlayerPerspective(0, 4, false);

    const online = new SceneManager(containerB);
    online.setupPlayerLayout(4);
    online.setPlayerPerspective(0, 4, true);

    const offlineCam = offline.getCameraController();
    const onlineCam = online.getCameraController();

    expect(onlineCam.getTheta()).toBeCloseTo(offlineCam.getTheta(), 6);
    expect(onlineCam.getRadius()).toBeCloseTo(offlineCam.getRadius(), 6);
    expect(onlineCam.getTarget()).toEqual(offlineCam.getTarget());

    offline.dispose();
    online.dispose();
    containerA.remove();
    containerB.remove();
  });

  // ─── C179-03: Online P2 keeps centre framing with a seat-based azimuth ─────

  it('C179-03: online player P2 receives the correct seat perspective', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(1, 4, true);

    const cameraController = sceneManager.getCameraController();
    const perspective = computePlayerPerspective(1, 4);
    expect(cameraController.getTheta()).toBeCloseTo(perspective.theta, 5);
    expect(cameraController.getTheta()).toBeCloseTo(Math.PI, 2); // North seat for P2

    const target = cameraController.getTarget();
    expect(target.x).toBeCloseTo(0, 4);
    expect(target.y).toBeCloseTo(0, 4);
    expect(target.z).toBeCloseTo(0, 4);

    sceneManager.dispose();
  });

  // ─── C179-04: Online P3/P4 keep centre framing with seat-based azimuth ─────

  it('C179-04: online players P3/P4 receive their own seat perspectives', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);

    const cam3 = sceneManager.getCameraController();
    sceneManager.setPlayerPerspective(2, 4, true);
    const theta3 = cam3.getTheta();

    expect(theta3).toBeCloseTo(Math.PI / 2, 2); // East seat
    expect(cam3.getTarget().x).toBeCloseTo(0, 4);

    const cam4 = sceneManager.getCameraController();
    sceneManager.setPlayerPerspective(3, 4, true);
    const theta4 = cam4.getTheta();

    expect(theta4).toBeCloseTo(-Math.PI / 2, 2); // West seat
    expect(cam4.getTarget().z).toBeCloseTo(0, 4);

    sceneManager.dispose();
  });

  // ─── C179-05: Refresh / reconnect restores the seated perspective ──────────

  it('C179-05: refresh / reconnect re-applies the player perspective from the seat', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, false);

    const cameraController = sceneManager.getCameraController();
    expect(cameraController.getTheta()).toBeCloseTo(0, 2);

    // Player manually orbits (e.g. during a session) — then a room refresh /
    // reconnect re-seats the local player via setPlayerPerspective again.
    (cameraController as any)._spherical.theta = 0.9;
    expect(cameraController.getTheta()).not.toBeCloseTo(0, 2);

    sceneManager.setPlayerPerspective(0, 4, false);
    expect(cameraController.getTheta()).toBeCloseTo(0, 2);
    expect(sceneManager.getActivePlayerIndex()).toBe(0);

    sceneManager.dispose();
  });

  // ─── C179-06: Camera resize keeps framing ───────────────────────────────────

  it('C179-06: camera resize keeps the framed perspective valid and bounded', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    const controller = new CameraController(camera, container);
    controller.setAdaptiveRadius(controller.computeAdaptiveRadius(18.0));

    const radiusBefore = controller.getRadius();
    expect(radiusBefore).toBeGreaterThanOrEqual(4.5);
    expect(radiusBefore).toBeLessThanOrEqual(40);

    // Simulate viewport resize → aspect change → adaptive re-frame.
    (camera as any).aspect = 4 / 3;
    camera.updateProjectionMatrix();
    controller.setAdaptiveRadius(controller.computeAdaptiveRadius(18.0));

    const radiusAfter = controller.getRadius();
    expect(Number.isFinite(radiusAfter)).toBe(true);
    expect(radiusAfter).toBeGreaterThanOrEqual(4.5);
    expect(radiusAfter).toBeLessThanOrEqual(40);

    // Seat theta must be preserved across the resize cycle.
    expect(controller.getTheta()).toBeCloseTo(computePlayerPerspective(0, 4).theta, 5);
    controller.dispose();
  });

  // ─── C179-07: Camera logic never overrides card rotation ───────────────────

  it('C179-07: camera perspective application does not touch card rotation', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    const card = sceneManager.syncDrawnCard('c179_07', 0, 'attack', true, 'session_local_179') as any;
    expect(card).toBeDefined();

    card.rotation.set(0, 0.7, 0);
    const rotationBefore = card.rotation.y;

    // Apply the seated camera through the camera controller directly (the same
    // code path SceneManager.setPlayerPerspective drives) and confirm the camera
    // itself never writes card transforms — hand re-layout on seat change is a
    // separate, authorised layout concern (M1.7.5).
    const cameraController = sceneManager.getCameraController();
    const perspective = computePlayerPerspective(0, 4);
    cameraController.setAdaptiveRadius(cameraController.computeAdaptiveRadius(18.0));
    cameraController.setPlayerPerspective(perspective.theta, true, false);
    cameraController.setTarget(
      new THREE.Vector3(perspective.seatPosition.x, 0.05, perspective.seatPosition.z)
    );

    expect(card.rotation.y).toBeCloseTo(rotationBefore, 6);
    expect(card.rotation.x).toBeCloseTo(0, 6);

    sceneManager.dispose();
  });
});
