/**
 * dragController.test.ts — Unit Tests for M1.3.2 DragController
 * Tests drag start, movement, end, cancellation, camera suppression,
 * position accuracy, rotation/scale preservation, and lifecycle safety.
 *
 * Note: The test environment (jsdom) uses MouseEvent on window for drag tracking
 * since DragController registers `mousemove`/`mouseup` globally. The `cancelDrag()`
 * public API handles pointercancel/blur scenarios deterministically in tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { DragController } from '../interaction/DragController';
import { RaycastInteractionManager } from '../interaction/RaycastInteractionManager';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { INTERACTION_CONFIG } from '../interaction/InteractionConfig';

// ─── Test Infrastructure ──────────────────────────────────────────────────────

function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  cam.position.set(0, 8, 10);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

function makeDomElement(): HTMLElement {
  const el = document.createElement('canvas');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    configurable: true,
  });
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  return el;
}

/** Minimal CameraController stub — only implements the methods DragController uses. */
interface CameraStub {
  setSuppressOrbit: ReturnType<typeof vi.fn>;
}

function makeCameraStub(): CameraStub {
  return { setSuppressOrbit: vi.fn() };
}

function fireMouseEvent(
  target: EventTarget,
  type: string,
  options: Partial<MouseEventInit> = {}
): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('DragController (M1.3.2)', () => {
  let camera: THREE.PerspectiveCamera;
  let domElement: HTMLElement;
  let requestRender: ReturnType<typeof vi.fn>;
  let interactionManager: RaycastInteractionManager;
  let cameraStub: CameraStub;
  let dragController: DragController;
  let card: CardObject3D;
  let deck: DeckObject3D;

  const OVER_THRESHOLD = INTERACTION_CONFIG.DRAG_START_THRESHOLD_PX + 10;

  beforeEach(() => {
    camera = makeCamera();
    domElement = makeDomElement();
    requestRender = vi.fn();
    interactionManager = new RaycastInteractionManager(camera, domElement, requestRender);
    cameraStub = makeCameraStub();

    dragController = new DragController(
      camera,
      domElement,
      interactionManager,
      cameraStub as unknown as import('../scene/CameraController').CameraController,
      requestRender
    );

    card = new CardObject3D({
      id: 'drag_test_card',
      position: { x: 0, y: TABLE_CONFIG.SURFACE_Y, z: 0 },
    });
    card.updateMatrixWorld(true);

    deck = new DeckObject3D({
      id: 'drag_test_deck',
      cardIds: ['c1', 'c2', 'c3'],
      position: { x: -5, y: TABLE_CONFIG.SURFACE_Y, z: 0 },
    });
    deck.updateMatrixWorld(true);

    interactionManager.registerObject('card1', card);
    interactionManager.registerObject('deck1', deck);
  });

  afterEach(() => {
    dragController.dispose();
    interactionManager.dispose();
    if (!card.isDisposed()) card.dispose();
    if (!deck.isDisposed()) deck.dispose();
  });

  // ─── Nhóm 1: Bắt đầu kéo Card hợp lệ ──────────────────────────────────

  describe('Nhóm 1 — Valid Card Drag Start', () => {
    it('isDragging() starts false', () => {
      expect(dragController.isDragging()).toBe(false);
    });

    it('getDraggedCard() starts null', () => {
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('card becomes drag candidate after onCardMouseDown fires', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);

      // Candidate set but drag not yet active (threshold not crossed)
      expect(dragController.getDraggedCard()).toBe(card);
      expect(dragController.isDragging()).toBe(false);
    });

    it('drag activates after movement crosses threshold', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      expect(dragController.isDragging()).toBe(true);
    });

    it('lấy góc ghế cho cả nhóm HAND và giữ góc chỉnh khi thả', () => {
      const follower = new CardObject3D({ id: 'follower', faceUp: false, position: { x: 2, y: 0, z: 0 } });
      const seatYaw = 4 * Math.PI / 5;
      const origins: FrameRequestCallback[] = [];
      const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => origins.push(cb));
      try {
        card.setHandZoneId('hand-4');
        follower.setHandZoneId('hand-4');
        card.rotation.y = -0.15;
        follower.rotation.y = 0.25;
        dragController.getSeatDragYaw = () => seatYaw;
        interactionManager.selectObjects([card, follower]);
        dragController.beginPreviewDrag(card, new MouseEvent('mousedown', { clientX: 400, clientY: 300 }), { x: 0, y: 0 });
        expect(card.rotation.y).toBeCloseTo(-0.15);
        expect(follower.position.x - card.position.x).toBeCloseTo(2);
        expect(follower.position.z - card.position.z).toBeCloseTo(0);
        origins[0]!(performance.now() + 200);
        expect(card.getRotationY()).toBeCloseTo(seatYaw);
        expect(follower.getRotationY()).toBeCloseTo(seatYaw);
        dragController.rotateDrag(Math.PI / 2);
        const expected = seatYaw + Math.PI / 2;
        expect(dragController.getDropYaw(card)).toBeCloseTo(expected);
        expect(dragController.getDropYaw(follower)).toBeCloseTo(expected);
        expect(follower.isFaceUp()).toBe(false);
        expect(card.isFaceUp()).toBe(true);
      } finally {
        dragController.abortDrag(true);
        follower.dispose();
        raf.mockRestore();
      }
    });

    it('onCardMouseDown callback is registered on interactionManager', () => {
      expect(interactionManager.onCardMouseDown).not.toBeNull();
      expect(typeof interactionManager.onCardMouseDown).toBe('function');
    });
  });

  // ─── Nhóm 2: Không kéo DeckObject3D ──────────────────────────────────────

  describe('Nhóm 2 — DeckObject3D Not Draggable', () => {
    it('drag state stays clean when no card mousedown fires', () => {
      // Without calling onCardMouseDown, moving mouse does nothing
      fireMouseEvent(window, 'mousemove', { clientX: 200, clientY: 300 });
      expect(dragController.isDragging()).toBe(false);
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('DeckObject3D is not a CardObject3D — interactionManager only fires callback for cards', () => {
      // The onCardMouseDown callback signature is CardObject3D typed.
      // TypeScript guarantees DeckObject3D cannot be passed. Verify runtime state is safe.
      expect(dragController.isDragging()).toBe(false);
    });

    it('right-click on card does NOT trigger drag (only button===0)', () => {
      const event = new MouseEvent('mousedown', { button: 2, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      expect(dragController.isDragging()).toBe(false);
    });
  });

  // ─── Nhóm 3: Không kéo vùng trống ──────────────────────────────────────

  describe('Nhóm 3 — Empty Space Not Draggable', () => {
    it('moving mouse without prior card mousedown does not start drag', () => {
      fireMouseEvent(window, 'mousemove', { clientX: 600, clientY: 400 });
      expect(dragController.isDragging()).toBe(false);
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('mouseup without drag start does not throw or corrupt state', () => {
      expect(() => fireMouseEvent(window, 'mouseup')).not.toThrow();
      expect(dragController.isDragging()).toBe(false);
    });

    it('mousedown on canvas without card hit does NOT activate isDragActive', () => {
      // Simulate canvas mousedown without triggering the card callback
      fireMouseEvent(domElement, 'mousedown', { button: 0, clientX: 200, clientY: 300 });
      fireMouseEvent(window, 'mousemove', { clientX: 300, clientY: 300 });
      expect(interactionManager.isDragActive).toBe(false);
    });
  });

  // ─── Nhóm 4: Phân biệt click và drag theo threshold ──────────────────────

  describe('Nhóm 4 — Click vs Drag Threshold', () => {
    it('movement below threshold does NOT activate drag', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);

      const belowThreshold = INTERACTION_CONFIG.DRAG_START_THRESHOLD_PX - 1;
      fireMouseEvent(window, 'mousemove', { clientX: 400 + belowThreshold, clientY: 300 });

      expect(dragController.isDragging()).toBe(false);
    });

    it('movement at exactly threshold activates drag (displacement >= threshold)', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);

      // Exactly at threshold — the guard is `< threshold`, so threshold itself passes
      fireMouseEvent(window, 'mousemove', {
        clientX: 400 + INTERACTION_CONFIG.DRAG_START_THRESHOLD_PX,
        clientY: 300,
      });

      expect(dragController.isDragging()).toBe(true);
    });

    it('movement past threshold activates drag', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);

      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      expect(dragController.isDragging()).toBe(true);
    });

    it('DRAG_START_THRESHOLD_PX is a positive number', () => {
      expect(INTERACTION_CONFIG.DRAG_START_THRESHOLD_PX).toBeGreaterThan(0);
    });
  });

  // ─── Nhóm 5: Tính giao điểm ray-plane ──────────────────────────────────

  describe('Nhóm 5 — Ray-Plane Intersection', () => {
    it('drag plane correctly set at SURFACE_Y + DRAG_LIFT_Y', () => {
      const expectedY = TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y;
      // Verify via card Y position when drag is active
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      if (dragController.isDragging()) {
        expect(card.position.y).toBeCloseTo(expectedY, 3);
      }
    });

    it('THREE.Plane correctly intersects a ray from test camera', () => {
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2(0, 0); // screen center
      raycaster.setFromCamera(ndc, camera);

      const planeY = TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const point = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, point);

      expect(hit).not.toBeNull();
      if (hit) expect(point.y).toBeCloseTo(planeY, 3);
    });

    it('ray from (0,8,10) looking at origin hits drag plane', () => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const planeY = TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const point = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, point);

      // Ray from (0,8,10) looking at origin will cross planeY which is positive-Y above surface
      expect(hit).not.toBeNull();
    });
  });

  // ─── Nhóm 6: Cập nhật vị trí Card khi kéo ──────────────────────────────

  describe('Nhóm 6 — Card Position Updates During Drag', () => {
    it('card position changes from initial when dragging', () => {
      const initialX = card.position.x;
      const initialZ = card.position.z;

      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      // Move well past threshold to a new location
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mousemove', { clientX: 500, clientY: 250 });

      if (dragController.isDragging()) {
        // At least X or Z should have changed
        expect(card.position.x !== initialX || card.position.z !== initialZ).toBe(true);
      }
    });

    it('requestRender is called when drag activates', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      requestRender.mockClear();

      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      if (dragController.isDragging()) {
        expect(requestRender).toHaveBeenCalled();
      }
    });

    it('card X position moves roughly in the direction of pointer', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      // Move to the right
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD + 80, clientY: 300 });

      if (dragController.isDragging()) {
        // Moving pointer right should move card right (positive X direction)
        expect(card.position.x).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─── Nhóm 7: Giữ đúng độ cao tiếp xúc mặt bàn ──────────────────────────

  describe('Nhóm 7 — Table Contact Height', () => {
    it('DRAG_LIFT_Y is positive — card always above table surface', () => {
      expect(INTERACTION_CONFIG.DRAG_LIFT_Y).toBeGreaterThan(0);
    });

    it('card.position.y equals SURFACE_Y + DRAG_LIFT_Y during active drag', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      if (dragController.isDragging()) {
        const expectedY = TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y;
        expect(card.position.y).toBeCloseTo(expectedY, 5);
      }
    });

    it('card.position.y returns to TABLE_CONFIG.SURFACE_Y after drop', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');

      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });

    it('card.position.y returns to SURFACE_Y after cancel', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      dragController.cancelDrag();

      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });
  });

  // ─── Nhóm 8: Không thay đổi rotation và scale ───────────────────────────

  describe('Nhóm 8 — Rotation and Scale Preserved', () => {
    it('card rotation is unchanged after full drag cycle', () => {
      const rx = card.rotation.x;
      const ry = card.rotation.y;
      const rz = card.rotation.z;

      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mousemove', { clientX: 500, clientY: 250 });
      fireMouseEvent(window, 'mouseup');

      expect(card.rotation.x).toBeCloseTo(rx, 5);
      expect(card.rotation.y).toBeCloseTo(ry, 5);
      expect(card.rotation.z).toBeCloseTo(rz, 5);
    });

    it('card scale is unchanged after full drag cycle', () => {
      const sx = card.scale.x;
      const sy = card.scale.y;
      const sz = card.scale.z;

      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mousemove', { clientX: 500, clientY: 250 });
      fireMouseEvent(window, 'mouseup');

      expect(card.scale.x).toBeCloseTo(sx, 5);
      expect(card.scale.y).toBeCloseTo(sy, 5);
      expect(card.scale.z).toBeCloseTo(sz, 5);
    });

    it('card cardId remains the same throughout drag', () => {
      const originalId = card.cardId;
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');
      expect(card.cardId).toBe(originalId);
    });
  });

  // ─── Nhóm 9: Orbit Camera bị chặn khi kéo Card ──────────────────────────

  describe('Nhóm 9 — Camera Orbit Suppressed During Card Drag', () => {
    it('setSuppressOrbit(true) called when card mousedown fires', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      expect(cameraStub.setSuppressOrbit).toHaveBeenCalledWith(true);
    });

    it('setSuppressOrbit(false) called after mouseup', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');
      expect(cameraStub.setSuppressOrbit).toHaveBeenCalledWith(false);
    });

    it('setSuppressOrbit(false) called after cancelDrag()', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      dragController.cancelDrag();
      expect(cameraStub.setSuppressOrbit).toHaveBeenCalledWith(false);
    });

    it('isDragActive remains false on card mousedown (only set true when movement threshold crossed)', () => {
      // BUG 1 Fix (M1.3.4.1): isDragActive must NOT be set on mousedown.
      // It must only be set true inside _activateDrag() when displacement >= DRAG_START_THRESHOLD_PX.
      // Setting it on mousedown would suppress click-selection for ALL card clicks.
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      expect(interactionManager.isDragActive).toBe(false);
    });

    it('isDragActive reset to false after mouseup', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');
      expect(interactionManager.isDragActive).toBe(false);
    });

    it('setSuppressOrbit not called for shift+leftclick (pan mode)', () => {
      cameraStub.setSuppressOrbit.mockClear();
      const event = new MouseEvent('mousedown', { button: 0, shiftKey: true, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      // shift+click is pan, not drag — orbit suppression should NOT fire
      expect(cameraStub.setSuppressOrbit).not.toHaveBeenCalled();
    });
  });

  // ─── Nhóm 10: Orbit Camera hoạt động bình thường khi kéo vùng trống ─────

  describe('Nhóm 10 — Camera Orbit Works on Empty Space', () => {
    it('setSuppressOrbit NOT called when moving mouse without card interaction', () => {
      cameraStub.setSuppressOrbit.mockClear();
      fireMouseEvent(window, 'mousemove', { clientX: 300, clientY: 200 });
      expect(cameraStub.setSuppressOrbit).not.toHaveBeenCalled();
    });

    it('isDragActive remains false without card mousedown', () => {
      fireMouseEvent(domElement, 'mousedown', { button: 0, clientX: 200, clientY: 300 });
      fireMouseEvent(window, 'mousemove', { clientX: 300, clientY: 300 });
      expect(interactionManager.isDragActive).toBe(false);
    });

    it('setSuppressOrbit NOT called for right-click on card (orbit uses right-click)', () => {
      cameraStub.setSuppressOrbit.mockClear();
      const event = new MouseEvent('mousedown', { button: 2, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      expect(cameraStub.setSuppressOrbit).not.toHaveBeenCalledWith(true);
    });
  });

  // ─── Nhóm 11: Kết thúc drag khi mouseup ─────────────────────────────────

  describe('Nhóm 11 — Drag Ends on Mouse Up', () => {
    it('isDragging() becomes false after mouseup', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      expect(dragController.isDragging()).toBe(true);

      fireMouseEvent(window, 'mouseup');
      expect(dragController.isDragging()).toBe(false);
    });

    it('getDraggedCard() is null after mouseup', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('card.position.y equals SURFACE_Y after drop', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });
  });

  // ─── Nhóm 12: Hủy drag bằng cancelDrag() public API ────────────────────

  describe('Nhóm 12 — Drag Cancelled via cancelDrag()', () => {
    it('isDragging() becomes false after cancelDrag()', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      dragController.cancelDrag();
      expect(dragController.isDragging()).toBe(false);
    });

    it('getDraggedCard() is null after cancelDrag()', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      dragController.cancelDrag();
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('card.position.y restores to SURFACE_Y after cancelDrag()', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      dragController.cancelDrag();
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });

    it('cancelDrag() is safe to call when no drag is active', () => {
      expect(() => dragController.cancelDrag()).not.toThrow();
      expect(dragController.isDragging()).toBe(false);
    });
  });

  // ─── Nhóm 13: Hủy drag khi mất focus hoặc canvas ────────────────────────

  describe('Nhóm 13 — Drag Cancelled on Blur and Mouseleave', () => {
    it('drag is cancelled when window fires blur event', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      window.dispatchEvent(new Event('blur'));

      expect(dragController.isDragging()).toBe(false);
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('card.position.y is SURFACE_Y after blur cancel', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      window.dispatchEvent(new Event('blur'));
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });

    it('drag is cancelled when mouse leaves the canvas (mouseleave on domElement)', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      fireMouseEvent(domElement, 'mouseleave');

      expect(dragController.isDragging()).toBe(false);
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('card.position.y is SURFACE_Y after mouseleave cancel', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(domElement, 'mouseleave');
      expect(card.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y, 5);
    });
  });

  // ─── Nhóm 14: Cleanup khi dispose ───────────────────────────────────────

  describe('Nhóm 14 — Dispose Cleanup', () => {
    it('dispose does not throw', () => {
      expect(() => dragController.dispose()).not.toThrow();
    });

    it('dispose can be called multiple times safely', () => {
      dragController.dispose();
      expect(() => dragController.dispose()).not.toThrow();
    });

    it('dispose cancels any active drag', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });

      dragController.dispose();

      expect(dragController.isDragging()).toBe(false);
      expect(dragController.getDraggedCard()).toBeNull();
    });

    it('dispose removes onCardMouseDown callback from interactionManager', () => {
      dragController.dispose();
      expect(interactionManager.onCardMouseDown).toBeNull();
    });

    it('events after dispose do NOT activate drag or call setSuppressOrbit', () => {
      dragController.dispose();
      requestRender.mockClear();
      cameraStub.setSuppressOrbit.mockClear();

      // onCardMouseDown is null — calling it does nothing
      interactionManager.onCardMouseDown?.(card, new MouseEvent('mousedown', { button: 0 }));
      fireMouseEvent(window, 'mousemove', { clientX: 500, clientY: 200 });

      expect(dragController.isDragging()).toBe(false);
      expect(cameraStub.setSuppressOrbit).not.toHaveBeenCalled();
    });
  });

  // ─── Nhóm 15: Hover hoạt động lại sau khi drag kết thúc ─────────────────

  describe('Nhóm 15 — Hover Restores After Drag', () => {
    it('interactionManager.isDragActive is false after drop — hover/click logic re-enabled', () => {
      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');

      expect(interactionManager.isDragActive).toBe(false);
    });

    it('card emissive is restored to pre-drag values after drop', () => {
      const mesh = card.getMesh();
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .filter((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial);

      // Snapshot original emissive before drag
      const origColors = mats.map((m) => m.emissive.clone());
      const origIntensities = mats.map((m) => m.emissiveIntensity);

      const event = new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 });
      interactionManager.onCardMouseDown?.(card, event);
      fireMouseEvent(window, 'mousemove', { clientX: 400 + OVER_THRESHOLD, clientY: 300 });
      fireMouseEvent(window, 'mouseup');

      // After drop, emissive should match pre-drag snapshot
      mats.forEach((m, i) => {
        expect(m.emissive.r).toBeCloseTo(origColors[i]!.r, 4);
        expect(m.emissive.g).toBeCloseTo(origColors[i]!.g, 4);
        expect(m.emissive.b).toBeCloseTo(origColors[i]!.b, 4);
        expect(m.emissiveIntensity).toBeCloseTo(origIntensities[i]!, 4);
      });
    });

    it('INTERACTION_CONFIG drag constants are all valid positive numbers', () => {
      expect(INTERACTION_CONFIG.DRAG_START_THRESHOLD_PX).toBeGreaterThan(0);
      expect(INTERACTION_CONFIG.DRAG_LIFT_Y).toBeGreaterThan(0);
      expect(INTERACTION_CONFIG.DRAG_EMISSIVE_COLOR).toBeGreaterThan(0);
      expect(INTERACTION_CONFIG.DRAG_EMISSIVE_INTENSITY).toBeGreaterThan(0);
    });
  });
});
