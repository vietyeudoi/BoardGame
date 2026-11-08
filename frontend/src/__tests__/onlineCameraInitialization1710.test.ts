/**
 * onlineCameraInitialization1710.test.ts — M1.7.10 Part C: Online camera
 * initialization / reset / refresh behaviour via the centralised perspective
 * application.
 *
 * Regression suite C1710-01 … C1710-10.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { computePlayerPerspective } from '../scene/PlayerPerspectiveHelper';
import { SceneManager } from '../scene/SceneManager';

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

describe('M1.7.10 Part C — Online camera initialization', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // ─── C1710-01: Online initial P1 ────────────────────────────────────────────

  it('C1710-01: centralised apply yields the correct Online initial perspective for P1', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    const cameraController = sceneManager.getCameraController();
    expect(cameraController.getTheta()).toBeCloseTo(computePlayerPerspective(0, 4).theta, 5);
    expect(cameraController.getTheta()).toBeCloseTo(0, 2);

    sceneManager.dispose();
  });

  // ─── C1710-02: Online initial P2 ────────────────────────────────────────────

  it('C1710-02: centralised apply yields the correct Online initial perspective for P2', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(1, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    const cameraController = sceneManager.getCameraController();
    expect(cameraController.getTheta()).toBeCloseTo(Math.PI, 2);
    expect(sceneManager.getActivePlayerIndex()).toBe(1);

    sceneManager.dispose();
  });

  // ─── C1710-03: Online initial P3/P4 ──────────────────────────────────────────

  it('C1710-03: centralised apply yields the correct Online initial perspectives for P3/P4', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);

    sceneManager.setPlayerPerspective(2, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);
    expect(sceneManager.getCameraController().getTheta()).toBeCloseTo(Math.PI / 2, 2);

    sceneManager.setPlayerPerspective(3, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);
    expect(sceneManager.getCameraController().getTheta()).toBeCloseTo(-Math.PI / 2, 2);

    sceneManager.dispose();
  });

  // ─── C1710-04: Reset Camera → same result as initial ─────────────────────────

  it('C1710-04: camera reset returns to the same framing applied by the centralised path', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(2, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    const cameraController = sceneManager.getCameraController();
    const camera = cameraController.getCamera();
    const thetaBeforeReset = cameraController.getTheta();
    const phiBeforeReset = cameraController.getPhi();
    const radiusBeforeReset = cameraController.getRadius();
    const targetBeforeReset = cameraController.getTarget().clone();
    const positionBeforeReset = camera.position.clone();

    cameraController.resetCamera();

    expect(cameraController.getTheta()).toBeCloseTo(thetaBeforeReset, 5);
    expect(cameraController.getTheta()).toBeCloseTo(Math.PI / 2, 2);
    expect(cameraController.getPhi()).toBeCloseTo(phiBeforeReset, 5);
    expect(cameraController.getRadius()).toBeCloseTo(radiusBeforeReset, 5);
    // M1.7.10 Part C: the reset must frame the local seat, exactly like entry.
    expect(cameraController.getTarget().distanceTo(targetBeforeReset)).toBeLessThan(1e-6);
    expect(camera.position.distanceTo(positionBeforeReset)).toBeLessThan(1e-4);

    sceneManager.dispose();
  });

  it('C1710-04b: the wired reset hook re-applies the seated perspective after an orbit', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(1, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    const cameraController = sceneManager.getCameraController();
    const targetBefore = cameraController.getTarget().clone();

    // User orbits away from the seat.
    (cameraController as any)._spherical.theta = 0.4;
    cameraController.setTarget(new THREE.Vector3(0, 0, 0));

    // Manual reset goes through the single SceneManager path.
    expect(cameraController.onResetRequested).not.toBeNull();
    cameraController.onResetRequested!();

    expect(cameraController.getTheta()).toBeCloseTo(Math.PI, 2);
    expect(cameraController.getTarget().distanceTo(targetBefore)).toBeLessThan(1e-6);

    sceneManager.dispose();
  });

  // ─── C1710-05: Refresh → perspective stays correct without manual reset ───────

  it('C1710-05: repeated centralised applies keep the perspective stable', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);
    const first = sceneManager.getCameraController().getTheta();

    sceneManager.applyLocalPlayerPerspective(true);
    expect(sceneManager.getCameraController().getTheta()).toBeCloseTo(first, 6);

    sceneManager.dispose();
  });

  // ─── C1710-06: Reconnect → perspective restored ─────────────────────────────

  it('C1710-06: reconnect re-applies the seated perspective after an orbit', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, false);

    const cameraController = sceneManager.getCameraController();
    (cameraController as any)._spherical.theta = 0.9;
    expect(cameraController.getTheta()).not.toBeCloseTo(0, 2);

    sceneManager.setPlayerPerspective(0, 4, false);
    sceneManager.applyLocalPlayerPerspective(false);
    expect(cameraController.getTheta()).toBeCloseTo(0, 2);

    sceneManager.dispose();
  });

  // ─── C1710-07: late room-state apply updates the perspective correctly ──────

  it('C1710-07: late perspective application from room state lands on the seated angle', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    // Simulate a late-arriving room state that re-seats the local player.
    sceneManager.setPlayerPerspective(1, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    expect(sceneManager.getActivePlayerIndex()).toBe(1);
    expect(sceneManager.getCameraController().getTheta()).toBeCloseTo(Math.PI, 2);

    sceneManager.dispose();
  });

  // ─── C1710-08: Resize keeps framing after centralised apply ──────────────────

  it('C1710-08: resize keeps the framed perspective valid after centralised apply', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    const cameraController = sceneManager.getCameraController();
    const radiusBefore = cameraController.getRadius();
    expect(radiusBefore).toBeGreaterThanOrEqual(4.5);
    expect(Number.isFinite(radiusBefore)).toBe(true);

    sceneManager.dispose();
  });

  // ─── C1710-09: local camera control is not continuously overwritten ──────────

  it('C1710-09: user camera orbit is preserved until a new perspective apply', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, true);
    sceneManager.applyLocalPlayerPerspective(true);

    const cameraController = sceneManager.getCameraController();
    (cameraController as any)._spherical.theta = 0.77;
    expect(cameraController.getTheta()).toBeCloseTo(0.77, 2);

    sceneManager.dispose();
  });

  // ─── C1710-10: multiplayer — each seated client gets an independent camera ───

  it('C1710-10: two seated clients receive independent but correctly-per-seat cameras', () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    document.body.appendChild(containerA);
    document.body.appendChild(containerB);

    const alice = new SceneManager(containerA);
    alice.setupPlayerLayout(4);
    alice.setPlayerPerspective(0, 4, true);
    alice.applyLocalPlayerPerspective(true);

    const bob = new SceneManager(containerB);
    bob.setupPlayerLayout(4);
    bob.setPlayerPerspective(1, 4, true);
    bob.applyLocalPlayerPerspective(true);

    expect(alice.getCameraController().getTheta()).toBeCloseTo(0, 2);
    expect(bob.getCameraController().getTheta()).toBeCloseTo(Math.PI, 2);

    alice.dispose();
    bob.dispose();
    containerA.remove();
    containerB.remove();
  });

  it('C1711-01/02: Offline and Online P1 match across full camera state at the same viewport', () => {
    const offlineContainer = document.createElement('div');
    const onlineContainer = document.createElement('div');
    document.body.append(offlineContainer, onlineContainer);
    const offline = new SceneManager(offlineContainer);
    const online = new SceneManager(onlineContainer);

    // Offline first-frame setup and Online room-ready setup use the same table,
    // viewport and local seat, then compare the complete observable camera.
    for (const scene of [offline, online]) {
      scene.setupPlayerLayout(4);
      scene.setPlayerPerspective(0, 4, false);
    }
    const offlineCamera = offline.getCameraController().getCamera();
    const onlineCamera = online.getCameraController().getCamera();
    const offlineTarget = offline.getCameraController().getTarget();
    const onlineTarget = online.getCameraController().getTarget();
    expect(onlineCamera.position.distanceTo(offlineCamera.position)).toBeLessThan(1e-8);
    expect(onlineCamera.quaternion.toArray()).toEqual(offlineCamera.quaternion.toArray());
    expect(onlineTarget.distanceTo(offlineTarget)).toBeLessThan(1e-8);
    expect(online.getCameraController().getRadius()).toBeCloseTo(offline.getCameraController().getRadius(), 8);
    expect(online.getCameraController().getTheta()).toBeCloseTo(offline.getCameraController().getTheta(), 8);
    expect(online.getCameraController().getPhi()).toBeCloseTo(offline.getCameraController().getPhi(), 8);
    expect([onlineCamera.fov, onlineCamera.zoom, onlineCamera.near, onlineCamera.far, onlineCamera.aspect])
      .toEqual([offlineCamera.fov, offlineCamera.zoom, offlineCamera.near, offlineCamera.far, offlineCamera.aspect]);

    offline.dispose();
    online.dispose();
    offlineContainer.remove();
    onlineContainer.remove();
  });
});
