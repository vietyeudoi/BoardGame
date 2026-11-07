/**
 * wheelRotation1753.test.ts — M1.7.5 Part 3: Mouse-Wheel Free Rotation & Zoom Gating
 *
 * Verifies that:
 * 1. Wheel deltas are normalized into notches across browsers (pixel/line/page).
 * 2. Wheel rotates ONLY the selected TABLE cards: up = CW (+), down = CCW (−),
 *    5°/notch, Shift = 1°/notch. Hand cards and empty selections never rotate.
 * 3. Selection/drag/zoom gating: no camera zoom while rotating, normal zoom
 *    otherwise, wheel ignored during an active drag, page scroll always blocked.
 * 4. Rotation changes (wheel AND R 90°) emit onObjectsRotationChanged with the
 *    final yaw for object:move sync — stacks emit every member once.
 * 5. CameraController.shouldHandleWheel gates the zoom math (hook contract).
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
import { CameraController } from '../scene/CameraController';
import { INTERACTION_CONFIG, normalizeWheelNotches } from '../interaction/InteractionConfig';
import type { CardObject3D } from '../objects/CardObject3D';

const LOCAL_SESSION = 'session_local_1753';
const DEG = Math.PI / 180;

describe('M1.7.5 Part 3 — Mouse-wheel free rotation', () => {
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

  function makeTableCard(id: string, x = 2, z = 2): CardObject3D {
    const card = sceneManager.syncDrawnCard(id, 0, 'attack', true, LOCAL_SESSION)!;
    card.position.set(x, 0, z);
    (sceneManager as unknown as { _onCardDropped: (c: CardObject3D) => void })._onCardDropped(card);
    return card;
  }

  // ─── 1. Wheel delta normalization ─────────────────────────────────────────

  describe('1. normalizeWheelNotches', () => {
    it('pixel deltas (deltaMode 0) map to notches (100px = 1 notch)', () => {
      expect(normalizeWheelNotches(100, 0)).toBeCloseTo(1, 9);
      expect(normalizeWheelNotches(-100, 0)).toBeCloseTo(-1, 9);
      expect(normalizeWheelNotches(50, 0)).toBeCloseTo(0.5, 9);
      expect(normalizeWheelNotches(300, 0)).toBeCloseTo(3, 9);
      // One event is NOT assumed to be one notch.
      expect(normalizeWheelNotches(1, 0)).toBeCloseTo(0.01, 9);
    });

    it('line deltas (deltaMode 1) are already notch-like; pages (2) are scaled', () => {
      expect(normalizeWheelNotches(3, 1)).toBeCloseTo(3, 9);
      expect(normalizeWheelNotches(-2, 1)).toBeCloseTo(-2, 9);
      expect(normalizeWheelNotches(1, 2)).toBeCloseTo(10, 9);
    });

    it('clamps runaway deltas and rejects non-finite input', () => {
      expect(normalizeWheelNotches(5000, 0)).toBe(10);
      expect(normalizeWheelNotches(-5000, 0)).toBe(-10);
      expect(normalizeWheelNotches(NaN, 0)).toBe(0);
      expect(normalizeWheelNotches(Infinity, 0)).toBe(0);
    });
  });

  // ─── 2. Selection / drag gating ───────────────────────────────────────────

  describe('2. canRotateSelectionWithWheel gating', () => {
    it('no selection → wheel zooms (rotation not eligible)', () => {
      expect(sceneManager.canRotateSelectionWithWheel()).toBe(false);
      expect(sceneManager.rotateSelectionByWheel(-1)).toBe(false);
    });

    it('selected HAND card → never eligible, never rotated', () => {
      const handCard = sceneManager.syncDrawnCard('c_hand_only', 0, 'attack', true, LOCAL_SESSION)!;
      sceneManager.getInteractionManager().selectObject(handCard);
      expect(handCard.isInHand()).toBe(true);

      expect(sceneManager.canRotateSelectionWithWheel()).toBe(false);
      const before = handCard.rotation.y;
      expect(sceneManager.rotateSelectionByWheel(-1)).toBe(false);
      expect(handCard.rotation.y).toBe(before);
    });

    it('selected TABLE card → eligible and rotated', () => {
      const card = makeTableCard('c_wheel_gate');
      sceneManager.getInteractionManager().selectObject(card);
      expect(sceneManager.canRotateSelectionWithWheel()).toBe(true);
    });

    it('active drag → wheel ignored (drag-vs-rotation conflict resolved)', () => {
      const card = makeTableCard('c_wheel_drag');
      sceneManager.getInteractionManager().selectObject(card);

      const dragCtrl = sceneManager.getDragController() as unknown as { _dragActive: boolean };
      dragCtrl._dragActive = true;
      try {
        expect(sceneManager.canRotateSelectionWithWheel()).toBe(false);
        expect(sceneManager.rotateSelectionByWheel(-1)).toBe(false);
        expect(card.getRotationY()).toBeCloseTo(0, 6);
      } finally {
        dragCtrl._dragActive = false;
      }
    });

    it('zero/invalid notches are no-ops', () => {
      const card = makeTableCard('c_wheel_zero');
      sceneManager.getInteractionManager().selectObject(card);
      expect(sceneManager.rotateSelectionByWheel(0)).toBe(false);
      expect(sceneManager.rotateSelectionByWheel(NaN)).toBe(false);
      expect(card.getRotationY()).toBeCloseTo(0, 6);
    });
  });

  // ─── 3. Rotation semantics: up = CW, 5°/notch, Shift = 1° ─────────────────

  describe('3. Rotation direction & fine step', () => {
    it('scroll up (negative notches) = clockwise 5°, down = CCW 5°', () => {
      const card = makeTableCard('c_wheel_dir');
      sceneManager.getInteractionManager().selectObject(card);

      expect(sceneManager.rotateSelectionByWheel(-1)).toBe(true);
      expect(card.getRotationY()).toBeCloseTo(5 * DEG, 6);

      expect(sceneManager.rotateSelectionByWheel(1)).toBe(true);
      expect(card.getRotationY()).toBeCloseTo(0, 6);
    });

    it('multi-notch deltas scale linearly (3 notches = 15°)', () => {
      const card = makeTableCard('c_wheel_multi');
      sceneManager.getInteractionManager().selectObject(card);

      sceneManager.rotateSelectionByWheel(-3);
      expect(card.getRotationY()).toBeCloseTo(15 * DEG, 6);
    });

    it('Shift = 1° fine step', () => {
      const card = makeTableCard('c_wheel_fine');
      sceneManager.getInteractionManager().selectObject(card);

      sceneManager.rotateSelectionByWheel(-1, true);
      expect(card.getRotationY()).toBeCloseTo(1 * DEG, 6);
      sceneManager.rotateSelectionByWheel(1, true);
      expect(card.getRotationY()).toBeCloseTo(0, 6);
    });

    it('only the selected card rotates — never all cards at once', () => {
      const selected = makeTableCard('c_wheel_sel', 2, 2);
      const other = makeTableCard('c_wheel_other', -2, 2);
      sceneManager.getInteractionManager().selectObject(selected);

      sceneManager.rotateSelectionByWheel(-1);

      expect(selected.getRotationY()).toBeCloseTo(5 * DEG, 6);
      expect(other.getRotationY()).toBeCloseTo(0, 6);
    });
  });

  // ─── 4. Sync emission (object:move plumbing) ──────────────────────────────

  describe('4. Rotation sync emission', () => {
    it('wheel rotation emits onObjectsRotationChanged with the final yaw', () => {
      const card = makeTableCard('c_wheel_emit');
      sceneManager.getInteractionManager().selectObject(card);

      const updates: Array<{ objectId: string; position: { x: number; y: number; z: number }; rotation: number }> = [];
      sceneManager.onObjectsRotationChanged = (u) => updates.push(...u);

      sceneManager.rotateSelectionByWheel(-1);

      expect(updates).toHaveLength(1);
      expect(updates[0]!.objectId).toBe(card.cardId);
      expect(updates[0]!.rotation).toBeCloseTo(5 * DEG, 6);
      expect(updates[0]!.position.x).toBeCloseTo(2, 5);
    });

    it('R 90° quick-rotate emits the new yaw too (and skips hand cards)', () => {
      const tableCard = makeTableCard('c_r_emit');
      const handCard = sceneManager.syncDrawnCard('c_r_hand', 0, 'defuse', true, LOCAL_SESSION)!;
      const im = sceneManager.getInteractionManager();
      im.selectObject(handCard);
      im.selectObject(tableCard, true);

      const updates: Array<{ objectId: string; rotation: number }> = [];
      sceneManager.onObjectsRotationChanged = (u) => updates.push(...u);

      sceneManager.rotateSelectedCards(1);

      expect(updates.map((u) => u.objectId)).toEqual([tableCard.cardId]);
      expect(updates[0]!.rotation).toBeCloseTo(Math.PI / 2, 6);
    });

    it('stack rotation emits every member once with the shared yaw', () => {
      const c1 = makeTableCard('c_stack_a', 2, 2);
      const c2 = makeTableCard('c_stack_b', 2.1, 2);
      expect(c2.isInStack()).toBe(true); // merged onto c1 by proximity drop
      const stackId = c2.getStackId()!;
      const stack = sceneManager.getStackManager().getStack(stackId)!;

      sceneManager.getInteractionManager().selectObject(c2);

      const updates: Array<{ objectId: string; rotation: number }> = [];
      sceneManager.onObjectsRotationChanged = (u) => updates.push(...u);

      expect(sceneManager.rotateSelectionByWheel(-1)).toBe(true);

      expect(stack.getRotationY()).toBeCloseTo(5 * DEG, 6);
      const ids = updates.map((u) => u.objectId).sort();
      expect(ids).toEqual([c1.cardId, c2.cardId].sort());
      expect(updates[0]!.rotation).toBeCloseTo(5 * DEG, 6);
      expect(updates[1]!.rotation).toBeCloseTo(5 * DEG, 6);
    });
  });

  // ─── 5. Camera zoom gating ────────────────────────────────────────────────

  describe('5. CameraController wheel hook', () => {
    it('zooms normally when the hook allows it, and always blocks page scroll', () => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      const dom = document.createElement('div');
      const cc = new CameraController(camera, dom);

      const before = camera.position.clone();
      const ev = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
      dom.dispatchEvent(ev);

      expect(camera.position.distanceTo(before)).toBeGreaterThan(0.01); // zoom happened
      expect(ev.defaultPrevented).toBe(true); // no page scroll
      cc.dispose();
    });

    it('blocks zoom while rotating (hook false) but still consumes the wheel', () => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      const dom = document.createElement('div');
      const cc = new CameraController(camera, dom);
      cc.shouldHandleWheel = () => false; // a table card is selected → rotating

      const before = camera.position.clone();
      const ev = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
      dom.dispatchEvent(ev);

      expect(camera.position.distanceTo(before)).toBe(0); // no zoom
      expect(ev.defaultPrevented).toBe(true); // no page scroll
      cc.dispose();
    });

    it('App-level contract: eligibility flips exactly with selection state', () => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
      const dom = document.createElement('div');
      const cc = new CameraController(camera, dom);
      // Mirrors the App wiring: shouldHandleWheel = !canRotateSelectionWithWheel
      cc.shouldHandleWheel = () => !sceneManager.canRotateSelectionWithWheel();

      const card = makeTableCard('c_hook_contract');
      sceneManager.getInteractionManager().clearSelection();
      expect(cc.shouldHandleWheel!()).toBe(true); // nothing selected → zoom

      sceneManager.getInteractionManager().selectObject(card);
      expect(cc.shouldHandleWheel!()).toBe(false); // selected → rotate, no zoom

      const before = camera.position.clone();
      const ev = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
      dom.dispatchEvent(ev);
      expect(camera.position.distanceTo(before)).toBe(0);
      expect(ev.defaultPrevented).toBe(true);
      cc.dispose();
    });
  });

  it('6. Wheel step constants are 5° / 1° as specified', () => {
    expect(INTERACTION_CONFIG.WHEEL_ROTATION_STEP_DEG).toBe(5);
    expect(INTERACTION_CONFIG.WHEEL_ROTATION_STEP_FINE_DEG).toBe(1);
    expect(INTERACTION_CONFIG.WHEEL_DELTA_UNITS_PER_LINE).toBe(100);
  });
});
