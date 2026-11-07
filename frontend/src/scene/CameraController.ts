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
  initialTarget?: THREE.Vector3;
}

interface ResolvedCameraOptions {
  orbitSpeed: number;
  panSpeed: number;
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  initialTheta: number;
  initialPhi: number;
  initialRadius: number;
  maxPanExtentX: number;
  maxPanExtentZ: number;
}

const DEFAULT_OPTIONS: ResolvedCameraOptions = {
  orbitSpeed: 0.005,
  panSpeed: 0.012,
  zoomSpeed: 0.08,
  minDistance: 4.5,
  maxDistance: 40.0,
  minPolarAngle: 0.12,                  // ~7° from overhead view
  maxPolarAngle: Math.PI / 2 - 0.08,    // Restrict from penetrating below table surface
  initialTheta: 0,
  initialPhi: Math.PI / 3.4,            // Comfortable ~53° tabletop perspective angle
  initialRadius: 13.5,                  // Frames the full table with margins
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
      maxDistance: options?.maxDistance ?? DEFAULT_OPTIONS.maxDistance,
      minPolarAngle: options?.minPolarAngle ?? DEFAULT_OPTIONS.minPolarAngle,
      maxPolarAngle: options?.maxPolarAngle ?? DEFAULT_OPTIONS.maxPolarAngle,
      initialTheta: options?.initialTheta ?? DEFAULT_OPTIONS.initialTheta,
      initialPhi: options?.initialPhi ?? DEFAULT_OPTIONS.initialPhi,
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
      Math.min(this._options.maxDistance, this._spherical.radius + zoomFactor)
    );
    this._updateCamera();
  }

  private _onKeyDown(e: KeyboardEvent): void {
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
    this._options.initialTheta = theta;
    if (applyImmediately) {
      this._spherical.theta = theta;
      this._spherical.phi = this._options.initialPhi;
      this._target.copy(this._defaultTarget);
      this._updateCamera();
    }
    void animate;
    void durationMs;
  }

  /**
   * Computes recommended camera radius based on actual table outer radius and viewport aspect ratio.
   * Ensures the entire table is comfortably framed without being cut off or excessively small.
   */
  computeAdaptiveRadius(tableRadius: number, aspect?: number): number {
    const asp = aspect ?? this._camera.aspect ?? 1.777;
    const fovY = (this._camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(asp * Math.tan(fovY / 2));
    const phi = this._options.initialPhi;

    // Required distance along vertical perspective and horizontal perspective
    const distVertical = (tableRadius * Math.sin(phi) + 1.2) / Math.tan(fovY / 2);
    const distHorizontal = (tableRadius + 1.0) / Math.tan(fovX / 2);

    const requiredDist = Math.max(distVertical, distHorizontal) * 1.10;

    return Math.max(
      this._options.minDistance,
      Math.min(this._options.maxDistance, requiredDist)
    );
  }

  /**
   * Sets an adaptive camera distance/radius to comfortably frame different table sizes.
   * Also updates default reset target radius so resetCamera() returns to this view.
   * Clamped within configured minDistance and maxDistance per M1.4.1 / M1.4.2.
   */
  setAdaptiveRadius(radius: number): void {
    const clampedRadius = Math.max(
      this._options.minDistance,
      Math.min(this._options.maxDistance, radius)
    );
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
    this._abortController.abort();
    this.onChange = null;
    logger.info('CameraController disposed');
  }
}
