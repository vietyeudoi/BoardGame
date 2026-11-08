import * as THREE from 'three';
import { CardTextureGenerator } from './CardTextureGenerator';

const WIDTH = 1.85;
const DEPTH = 0.96;
const GAP = 0.24;
const HEIGHT = 0.045;
const DECK_CLEARANCE = 3.1;
const TEXTURE_WIDTH = 384;
const TEXTURE_HEIGHT = 144;
const LABELS = ['Rút', 'See', 'Xáo', 'Alter'] as const;
const BUTTON_OFFSETS = [-1.5, -0.5, 1.5, 0.5];

export class TableActions3D extends THREE.Group {
  private readonly _geometry = new THREE.PlaneGeometry(WIDTH, DEPTH);
  private readonly _buttons: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly _remoteHover = new Map<string, string>();
  private readonly _listeners = new AbortController();
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private _hovered = false;
  private _pressed = false;

  private _shuffleEnabled = false;
  private _extraPressed?: number;
  private _viewEnabled = false;
  onSee?: () => void;
  onAlter?: () => void;
  onShuffle?: () => void;
  onDraw?: () => void;
  onDrawHover?: (hovering: boolean) => void;

  constructor(
    private readonly _canvas: HTMLElement,
    private readonly _camera: THREE.PerspectiveCamera,
    private readonly _requestRender: () => void,
    private readonly _isObstructed: () => boolean
  ) {
    super();
    this.name = 'table-actions';
    LABELS.forEach((_, index) => {
      const button = new THREE.Mesh(this._geometry, new THREE.MeshBasicMaterial());
      button.name = 'table-action-' + index;
      button.rotation.order = "YXZ";
      button.rotation.x = -Math.PI / 2;
      button.position.set(BUTTON_OFFSETS[index]! * (WIDTH + GAP), HEIGHT, 0);
      this._buttons.push(button);
      this.add(button);
      this._paint(index);
    });
    const options = { signal: this._listeners.signal };
    _canvas.addEventListener('mousemove', (event) => this._setHover(this._hitsDraw(event)), options);
    _canvas.addEventListener('mouseleave', () => this._setHover(false), options);
    _canvas.addEventListener('mousedown', (event) => {

      if (event.button !== 0) return;

      const extra = [1, 2, 3].find(index => this._enabled(index) && this._hitsDraw(event, index));
      if (extra !== undefined) {
        this._extraPressed = extra;
        return;
      }
      if (!this._hitsDraw(event)) return;
      this._pressed = true;
      this._paintDraw();
    }, options);
    window.addEventListener('mouseup', (event) => {


      const extra = this._extraPressed;
      this._extraPressed = undefined;
      if (extra !== undefined) {
        if (event.button === 0 && this._enabled(extra) && this._hitsDraw(event, extra)) {
          if (extra === 1) this.onSee?.();
          if (extra === 2) this.onShuffle?.();
          if (extra === 3) this.onAlter?.();
        }
        return;
      }
      if (!this._pressed) return;
      this._pressed = false;
      this._paintDraw();
      if (event.button === 0 && this._hitsDraw(event)) this.onDraw?.();
    }, options);
    window.addEventListener('blur', () => {
      this._extraPressed = undefined;
      this._setHover(false);
    }, options);
  }


  setShuffleEnabled(enabled: boolean): void {
    if (this._shuffleEnabled === enabled) return;
    this._shuffleEnabled = enabled;
    if (!enabled && this._extraPressed === 2) this._extraPressed = undefined;
    this._paint(2);
    this._requestRender();
  }


  setViewEnabled(enabled: boolean): void {
    if (this._viewEnabled === enabled) return;
    this._viewEnabled = enabled;
    this._paint(1);
    this._paint(3);
    this._requestRender();
  }

  private _enabled(index: number): boolean {
    return index === 0 || (index === 2 ? this._shuffleEnabled : this._viewEnabled);
  }

  setAnchor(deckX: number, deckZ: number, theta: number): void {
    // Tâm nút dùng chung trên bàn, mặt chữ xoay để đọc từ ghế local.
    this.position.set(deckX, 0, deckZ + DECK_CLEARANCE);
    for (const button of this._buttons) button.rotation.y = theta;
    this.updateMatrixWorld(true);
  }

  updateRemoteHover(playerId: string, playerName: string, hovering: boolean): void {
    if (hovering) this._remoteHover.set(playerId, playerName);
    else this._remoteHover.delete(playerId);
    this._paintDraw();
  }

  clearRemoteHover(): void {
    this._remoteHover.clear();
    this._setHover(false);
    this._paintDraw();
  }

  hitsAt(event: MouseEvent): boolean {
    return this._buttons.some((_, index) => this._hitsDraw(event, index));
  }

  private _hitsDraw(event: MouseEvent, index = 0): boolean {
    if (!this.visible || this._isObstructed()) return false;
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this._ndc.set(
      (event.clientX - rect.left) * 2 / rect.width - 1,
      1 - (event.clientY - rect.top) * 2 / rect.height
    );
    if (Math.abs(this._ndc.x) > 1 || Math.abs(this._ndc.y) > 1) return false;
    this._ray.setFromCamera(this._ndc, this._camera);
    this.updateMatrixWorld(true);
    return this._ray.intersectObject(this._buttons[index]!, false).length > 0;
  }

  private _setHover(hovering: boolean): void {
    const hoverChanged = hovering !== this._hovered;
    if (!hoverChanged && (hovering || !this._pressed)) return;
    this._hovered = hovering;
    if (!hovering) this._pressed = false;
    this._paintDraw();
    if (hoverChanged) this.onDrawHover?.(hovering);
  }

  private _paintDraw(): void {
    this._buttons[0]!.position.y = this._pressed ? HEIGHT / 3 : HEIGHT;
    this._paint(0);
    this._requestRender();
  }

  private _paint(index: number): void {
    const button = this._buttons[index]!;
    const enabled = this._enabled(index);
    const active = index === 0 && (this._hovered || this._remoteHover.size > 0);
    if (!CardTextureGenerator.isCanvasSupported()) return;
    let texture = button.material.map as THREE.CanvasTexture | null;
    if (!texture) {
      const canvas = document.createElement('canvas');
      canvas.width = TEXTURE_WIDTH;
      canvas.height = TEXTURE_HEIGHT;
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      button.material.map = texture;
      button.material.needsUpdate = true;
    }
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = active ? '#694f37' : '#29211d';
    ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.strokeStyle = enabled ? '#d1a778' : '#5b5149';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, TEXTURE_WIDTH - 8, TEXTURE_HEIGHT - 8);
    ctx.fillStyle = enabled ? '#fff1d9' : '#9d8e80';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const names = index === 0 ? [...this._remoteHover.values()].join(', ') : '';
    ctx.fillText(LABELS[index]!, TEXTURE_WIDTH / 2, names ? 54 : TEXTURE_HEIGHT / 2);
    if (names) {
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(names, TEXTURE_WIDTH / 2, 111, TEXTURE_WIDTH - 24);
    }
    texture.needsUpdate = true;
  }

  dispose(): void {
    this._listeners.abort();
    this._geometry.dispose();
    for (const button of this._buttons) {
      button.material.map?.dispose();
      button.material.dispose();
    }
    this.removeFromParent();
  }
}
