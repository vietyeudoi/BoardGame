import * as THREE from 'three';

type Bounds = { left: number; top: number; right: number; bottom: number };
type Mode = 'replace' | 'add' | 'toggle';
const START_DISTANCE = 5;

export function overlaps(a: Bounds, b: Bounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function combineSelection<T>(original: readonly T[], hits: readonly T[], mode: Mode): T[] {
  if (mode === 'replace') return [...hits];
  const result = new Set(original);
  for (const hit of hits) {
    if (mode === 'toggle' && result.has(hit)) result.delete(hit);
    else result.add(hit);
  }
  return [...result];
}

export class ScreenBoundsProjector {
  private readonly _point = new THREE.Vector4();
  private readonly _matrix = new THREE.Matrix4();
  private readonly _view = new THREE.Matrix4();
  private _viewport!: Bounds;

  begin(camera: THREE.Camera, viewport: Bounds): void {
    camera.updateWorldMatrix(true, false);
    this._view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._viewport = viewport;
  }

  project(mesh: THREE.Mesh, output: Bounds): boolean {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box || box.isEmpty()) return false;
    mesh.updateWorldMatrix(true, false);
    this._matrix.multiplyMatrices(this._view, mesh.matrixWorld);
    const { left, top, right, bottom } = this._viewport;
    output.left = output.top = Infinity;
    output.right = output.bottom = -Infinity;
    for (let i = 0; i < 8; i++) {
      const point = this._point.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z, 1).applyMatrix4(this._matrix);
      if (point.w <= 0 || point.z < -point.w) continue;
      const x = left + (point.x / point.w + 1) * (right - left) / 2;
      const y = top + (1 - point.y / point.w) * (bottom - top) / 2;
      output.left = Math.min(output.left, x);
      output.right = Math.max(output.right, x);
      output.top = Math.min(output.top, y);
      output.bottom = Math.max(output.bottom, y);
    }
    return output.left !== Infinity && overlaps(output, this._viewport);
  }
}

interface Gesture<T> {
  x: number;
  y: number;
  endX: number;
  endY: number;
  original: T[];
  current: T[];
  mode: Mode;
  scope: Bounds;
  hit: (bounds: Bounds, hits: T[]) => void;
  finish?: () => void;
  moved: boolean;
}

export class MarqueeSelection<T> {
  private readonly _events = new AbortController();
  private readonly _box = document.createElement('div');
  private readonly _count = document.createElement('output');
  private _gesture?: Gesture<T>;
  private _frame?: number;
  private _consumeRelease = false;
  private readonly _bounds: Bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  private readonly _hits: T[] = [];
  private _previousHits?: T[];

  constructor(
    root: HTMLElement,
    private readonly _begin: (event: MouseEvent) => Pick<Gesture<T>, 'scope' | 'hit' | 'finish'> | undefined,
    private readonly _selected: () => T[],
    private readonly _select: (items: T[]) => void,
  ) {
    this._box.id = 'marquee-selection';
    this._box.style.cssText = 'display:none;position:fixed;z-index:180;pointer-events:none;box-sizing:border-box;border:1px solid #60a5fa;background:#3b82f633';
    this._count.id = 'marquee-count';
    this._count.style.cssText = 'position:fixed;top:72px;right:16px;z-index:180;pointer-events:none;background:#172554;color:#dbeafe;border-radius:6px;padding:4px 8px';
    this._count.hidden = true;
    root.append(this._box, this._count);
    const options = { capture: true, signal: this._events.signal };
    root.addEventListener('mousedown', this._down, options);
    window.addEventListener('mousemove', this._move, options);
    window.addEventListener('mouseup', this._up, options);
    window.addEventListener('blur', () => this._finish(true), options);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this._gesture) {
        this._finish(true);
        event.stopImmediatePropagation();
      }
    }, options);
  }

  onActiveChange?: (active: boolean) => void;

  showCount(count: number): void {
    this._count.hidden = !count;
    this._count.textContent = 'Đã chọn: ' + count;
  }

  private _down = (event: MouseEvent): void => {
    if (event.button !== 0 || this._gesture) return;
    this._consumeRelease = false;
    const target = this._begin(event);
    if (!target) return;
    const original = this._selected();
    this._previousHits = undefined;
    this._gesture = { ...target, original, current: original, x: event.clientX, y: event.clientY,
      endX: event.clientX, endY: event.clientY, moved: false,
      mode: event.ctrlKey ? 'toggle' : event.shiftKey ? 'add' : 'replace' };
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private _move = (event: MouseEvent): void => {
    const gesture = this._gesture;
    if (!gesture) return;
    gesture.endX = event.clientX;
    gesture.endY = event.clientY;

    if (!gesture.moved && Math.hypot(gesture.endX - gesture.x, gesture.endY - gesture.y) >= START_DISTANCE) {
      gesture.moved = true;
      this.onActiveChange?.(true);
    }
    if (gesture.moved && this._frame === undefined) this._frame = requestAnimationFrame(this._preview);
  };

  private _preview = (): void => {
    this._frame = undefined;
    const g = this._gesture;
    if (!g?.moved) return;
    const x = Math.max(g.scope.left, Math.min(g.scope.right, g.endX));
    const y = Math.max(g.scope.top, Math.min(g.scope.bottom, g.endY));

    const bounds = this._bounds;
    bounds.left = Math.min(x, g.x);
    bounds.top = Math.min(y, g.y);
    bounds.right = Math.max(x, g.x);
    bounds.bottom = Math.max(y, g.y);
    this._box.style.display = 'block';
    this._box.style.left = bounds.left + 'px';
    this._box.style.top = bounds.top + 'px';
    this._box.style.width = (bounds.right - bounds.left) + 'px';
    this._box.style.height = (bounds.bottom - bounds.top) + 'px';
    this._hits.length = 0;
    g.hit(bounds, this._hits);
    if (this._previousHits?.length === this._hits.length && this._hits.every((item, i) => item === this._previousHits?.[i])) return;
    this._previousHits = [...this._hits];
    const next = combineSelection(g.original, this._hits, g.mode);
    if (next.length === g.current.length && next.every((card, i) => card === g.current[i])) return;
    g.current = next;
    this._select(next);
  };

  private _up = (event: MouseEvent): void => {

    if (event.button !== 0 || (!this._gesture && !this._consumeRelease)) return;
    this._consumeRelease = false;
    this._move(event);
    this._finish(false);
    event.stopImmediatePropagation();
  };

  private _finish(cancel: boolean): void {
    const gesture = this._gesture;
    if (!gesture) return;
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    if (cancel) {
      this._consumeRelease = true;
      this._select(gesture.original);
    }
    else if (gesture.moved) this._preview();
    else this._select([]);
    this._gesture = undefined;
    this._box.style.display = 'none';
    if (gesture.moved) this.onActiveChange?.(false);
    gesture.finish?.();
  }

  dispose(): void {
    this._finish(true);
    this._events.abort();
    this._box.remove();
    this._count.remove();
  }
}
