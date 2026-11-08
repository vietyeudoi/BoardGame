/**
 * CameraController.ts — Fixed shared tabletop camera with bounded zoom.
 */
import * as THREE from 'three';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CameraController');

export interface CameraControllerOptions {
  orbitSpeed?: number;
  panSpeed?: number;
  zoomSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  initialTheta?: number;
  initialPhi?: number;
  initialRadius?: number;
  fitTablePerspective?: boolean;
  initialTarget?: THREE.Vector3;
}

interface ResolvedCameraOptions {
  orbitSpeed: number;
  panSpeed: number;
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;
  fitTablePerspective: boolean;
  minPolarAngle: number;
  maxPolarAngle: number;
  initialTheta: number;
  initialPhi: number;
  initialRadius: number;
  maxPanExtentX: number;
  maxPanExtentZ: number;
}

export const TABLE_CAMERA_FOV = 54;
const TABLE_CAMERA_ELEVATION = 29;
const TABLE_CAMERA_MARGIN = 1.055;
const TABLE_CAMERA_CLOSE_FRAMING = 0.94 * 0.88;
const TABLE_CAMERA_WIDE_ASPECT = 1.45;
const TABLE_CAMERA_HAND_ROOM = 0.075;

const DEFAULT_OPTIONS: ResolvedCameraOptions = {
  orbitSpeed: 0.005,
  panSpeed: 0.012,
  zoomSpeed: 0.08,
  minDistance: 4.5,
  maxDistance: 40.0,
  minPolarAngle: 0.12,                  // ~7° from overhead view
  maxPolarAngle: Math.PI / 2 - 0.08,    // Restrict from penetrating below table surface
  initialTheta: 0,
  initialPhi: Math.PI / 3.4,
  initialRadius: 13.5,
  fitTablePerspective: false,
  maxPanExtentX: 8.0,
  maxPanExtentZ: 5.5,
};

interface SphericalCoords {
  theta: number;
  phi: number;
  radius: number;
}

export class CameraController {
  private readonly _options: ResolvedCameraOptions;
  private readonly _defaultTarget: THREE.Vector3;
  private _spherical: SphericalCoords;
  private _target: THREE.Vector3;

  private _seatFrame?: number;
  private readonly _abortController = new AbortController();

  /** Callback invoked when camera moves so SceneManager can trigger requestRender() */
  public onChange: (() => void) | null = null;
  public shouldHandleResetKey?: () => boolean;
  /**
   * M1.7.10 Part C: when set, reset requests (button/R key) delegate here so the
   * local seated perspective stays the single source of truth. Falls back to
   * `resetCamera()` when unset (standalone CameraController use).
   */
  public onResetRequested: (() => void) | null = null;

  /**
   * M1.7.5 Part 3: optional guard for the wheel. Returning false blocks camera
   * zoom (a selected table card is being rotated instead) while still consuming
   * the event so the page never scrolls. Zoom stays normal when unguarded.
   */
  public shouldHandleWheel?: () => boolean;

  constructor(
    private readonly _camera: THREE.PerspectiveCamera,
    private readonly _domElement: HTMLElement,
    options?: CameraControllerOptions
  ) {
    this._options = {
      orbitSpeed: options?.orbitSpeed ?? DEFAULT_OPTIONS.orbitSpeed,
      panSpeed: options?.panSpeed ?? DEFAULT_OPTIONS.panSpeed,
      zoomSpeed: options?.zoomSpeed ?? DEFAULT_OPTIONS.zoomSpeed,
      minDistance: options?.minDistance ?? DEFAULT_OPTIONS.minDistance,
      fitTablePerspective: options?.fitTablePerspective ?? DEFAULT_OPTIONS.fitTablePerspective,
      maxDistance: options?.maxDistance ?? DEFAULT_OPTIONS.maxDistance,
      minPolarAngle: options?.minPolarAngle ?? DEFAULT_OPTIONS.minPolarAngle,
      maxPolarAngle: options?.maxPolarAngle ?? DEFAULT_OPTIONS.maxPolarAngle,
      initialTheta: options?.initialTheta ?? DEFAULT_OPTIONS.initialTheta,
      initialPhi: options?.initialPhi ?? (options?.fitTablePerspective
        ? THREE.MathUtils.degToRad(90 - TABLE_CAMERA_ELEVATION)
        : DEFAULT_OPTIONS.initialPhi),
      initialRadius: options?.initialRadius ?? DEFAULT_OPTIONS.initialRadius,
      maxPanExtentX: DEFAULT_OPTIONS.maxPanExtentX,
      maxPanExtentZ: DEFAULT_OPTIONS.maxPanExtentZ,
    };

    this._defaultTarget = options?.initialTarget
      ? options.initialTarget.clone()
      : new THREE.Vector3(0, 0, 0);

    this._target = this._defaultTarget.clone();
    this._spherical = {
      theta: this._options.initialTheta,
      phi: this._options.initialPhi,
      radius: this._options.initialRadius,
    };

    this._attachListeners();
    this._updateCamera();

    logger.info('CameraController initialized with fixed tabletop view', {
      radius: this._spherical.radius,
      phi: this._spherical.phi,
    });
  }

  private _attachListeners(): void {
    const opts = { signal: this._abortController.signal };

    this._domElement.addEventListener('mousedown', (e) => this._onMouseDown(e), opts);
    window.addEventListener('mousemove', (e) => this._onMouseMove(e), opts);
    window.addEventListener('mouseup', () => this._onMouseUp(), opts);
    this._domElement.addEventListener('wheel', (e) => this._onWheel(e), {
      ...opts,
      passive: false,
    });
    this._domElement.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    window.addEventListener('keydown', (e) => this._onKeyDown(e), opts);
  }

  private _onMouseDown(e: MouseEvent): void {
    // Camera orientation is deliberately fixed. Mouse buttons are reserved for
    // tabletop interaction and must never rotate or pan the board.
    void e;
  }

  private _onMouseMove(e: MouseEvent): void {
    void e;
  }

  private _onMouseUp(): void {
    // Intentionally empty: fixed camera has no pointer-driven motion.
  }

  private _onWheel(e: WheelEvent): void {
    // Always consume: the canvas must never hand the wheel to page scrolling.
    e.preventDefault();

    // M1.7.5 Part 3: no camera zoom while the wheel is rotating a selection.
    if (this.shouldHandleWheel && !this.shouldHandleWheel()) return;

    const zoomFactor = e.deltaY * 0.01 * this._options.zoomSpeed * this._spherical.radius;
    this._spherical.radius = Math.max(
      this._options.minDistance,
      Math.min(Math.max(this._options.maxDistance, this._options.initialRadius), this._spherical.radius + zoomFactor)
    );
    this._updateCamera();
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input, textarea, select'))) return;
    // Press 'R' to reset camera (unless suppressed by active card selection / manipulation)
    if (e.key === 'r' || e.key === 'R') {
      if (!this.shouldHandleResetKey || this.shouldHandleResetKey()) {
        // M1.7.10 Part C: prefer the seated-perspective owner when wired.
        if (this.onResetRequested) this.onResetRequested();
        else this.resetCamera();
      }
    }
  }

  /**
   * Resets camera smoothly to its pristine initial tabletop perspective.
   */
  resetCamera(): void {
    this._cancelSeatAnimation();
    this._spherical.theta = this._options.initialTheta;
    this._spherical.phi = this._options.initialPhi;
    this._spherical.radius = this._options.initialRadius;
    this._target.copy(this._defaultTarget);
    this._updateCamera();
    logger.info('Camera reset to default view');
  }

  /**
   * Updates camera position and orientation from spherical coordinates.
   */
  private _updateCamera(): void {
    const { theta, phi, radius } = this._spherical;
    this._camera.position.set(
      this._target.x + radius * Math.sin(phi) * Math.sin(theta),
      this._target.y + radius * Math.cos(phi),
      this._target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this._camera.lookAt(this._target);
    this._camera.updateMatrixWorld();

    // Notify scene manager that a frame render is requested
    this.onChange?.();
  }

  /** Current focus target of the camera */
  getTarget(): THREE.Vector3 {
    return this._target.clone();
  }

  /** Camera focus remains the table center in the shared fixed view. */
  setTarget(newTarget: THREE.Vector3): void {
    this._target.copy(newTarget);
    this._updateCamera();
    this.onChange?.();
  }

  /**
   * M1.7.10 Part C: records the target that `resetCamera()` should return to.
   * The seated perspective sets this to the local player's seat so initial and
   * manual-reset framings are identical.
   */
  setDefaultTarget(newTarget: THREE.Vector3): void {
    this._defaultTarget.copy(newTarget);
  }

  /** Current spherical radius (distance) */
  getRadius(): number {
    return this._spherical.radius;
  }

  getInitialTheta(): number {
    return this._options.initialTheta;
  }

  getTheta(): number {
    return this._spherical.theta;
  }

  getPhi(): number {
    return this._spherical.phi;
  }

  /**
   * Applies the local player's seat perspective. Input remains fixed: users
   * cannot orbit manually, but each client is seated at its own table edge.
   */
  setPlayerPerspective(
    theta: number,
    applyImmediately = true,
    animate = false,
    durationMs = 500
  ): void {

    this._cancelSeatAnimation();
    this._options.initialTheta = theta;
    if (!applyImmediately) return;
    this._spherical.phi = this._options.initialPhi;
    this._target.copy(this._defaultTarget);
    const start = this._spherical.theta;
    const distance = Math.atan2(Math.sin(theta - start), Math.cos(theta - start));
    if (!animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || distance === 0) {
      this._spherical.theta = theta;
      this._updateCamera();
      return;
    }
    const started = performance.now();
    const frame = (now: number): void => {
      const progress = Math.min(1, Math.max(0, (now - started) / durationMs));
      const eased = progress * progress * (3 - 2 * progress);
      this._spherical.theta = progress === 1 ? theta : start + distance * eased;
      this._updateCamera();
      this._seatFrame = progress < 1 ? requestAnimationFrame(frame) : undefined;
    };
    this._seatFrame = requestAnimationFrame(frame);
  }

  private _cancelSeatAnimation(): void {
    if (this._seatFrame !== undefined) cancelAnimationFrame(this._seatFrame);
    this._seatFrame = undefined;
  }

  /**
   * Computes recommended camera radius based on actual table outer radius and viewport aspect ratio.
   * Ensures the entire table is comfortably framed without being cut off or excessively small.
   */
  computeAdaptiveRadius(tableRadius: number, aspect?: number): number {
    const viewportAspect = aspect ?? this._camera.aspect;
    const asp = Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 16 / 9;
    const fovY = (this._camera.fov * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovY / 2);
    if (!this._options.fitTablePerspective) {
      const vertical = (tableRadius * Math.sin(this._options.initialPhi) + 1.2) / tanHalfFov;
      const horizontal = (tableRadius + 1) / (asp * tanHalfFov);
      return THREE.MathUtils.clamp(Math.max(vertical, horizontal) * 1.10, this._options.minDistance, this._options.maxDistance);
    }
    const phi = this._options.initialPhi;

    // Tính cả phần cạnh gần được phóng lớn do phối cảnh.
    const vertical = Math.cos(phi) / tanHalfFov + Math.sin(phi);
    const horizontal = Math.hypot(1 / (asp * tanHalfFov), Math.sin(phi));
    return Math.max(this._options.minDistance, tableRadius * Math.max(vertical * TABLE_CAMERA_CLOSE_FRAMING, horizontal) * TABLE_CAMERA_MARGIN);
  }

  /**
   * Sets an adaptive camera distance/radius to comfortably frame different table sizes.
   * Also updates default reset target radius so resetCamera() returns to this view.
   * Clamped within configured minDistance and maxDistance per M1.4.1 / M1.4.2.
   */
  setAdaptiveRadius(radius: number): void {
    // Dịch khung lên để chừa phần tay bài ở sát mép trong góc nhìn cận.
    if (this._options.fitTablePerspective) {
      const aspect = this._camera.aspect;
      if (aspect >= TABLE_CAMERA_WIDE_ASPECT) {
        this._camera.setViewOffset(aspect, 1, 0, TABLE_CAMERA_HAND_ROOM, aspect, 1);
      } else if (this._camera.view?.enabled) this._camera.clearViewOffset();
    }
    const maxDistance = this._options.fitTablePerspective ? Infinity : this._options.maxDistance;
    const clampedRadius = THREE.MathUtils.clamp(radius, this._options.minDistance, maxDistance);
    this._options.initialRadius = clampedRadius;
    this._spherical.radius = clampedRadius;
    this._updateCamera();
    logger.info('Camera adaptive radius set', { radius: this._spherical.radius });
  }

  /**
   * Temporarily suppresses orbit input (left-click drag) while a card drag is active.
   * Call with `true` when a card drag begins; `false` when drag ends or is cancelled.
   * Does NOT affect pan (Shift+drag) or zoom (scroll wheel).
   */
  setSuppressOrbit(suppress: boolean): void {
    void suppress;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this._camera;
  }

  dispose(): void {
    this._cancelSeatAnimation();
    this._abortController.abort();
    this.onChange = null;
    logger.info('CameraController disposed');
  }
}
