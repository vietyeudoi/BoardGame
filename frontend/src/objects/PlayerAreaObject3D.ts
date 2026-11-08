/**
 * PlayerAreaObject3D.ts — 3D representation of a single player area on the table.
 * Renders a rectangle border, a label sprite, an avatar placeholder, and a slot indicator.
 * Supports hover/select visual states and containsPoint queries.
 */
import * as THREE from 'three';
import { PLAYER_AREA_VISUAL_CONFIG } from './PlayerAreaConfig';

// ─── Constructor Options ──────────────────────────────────────────────────────

export interface PlayerAreaObject3DOptions {
  id: string;
  x: number;
  z: number;
  rotationY: number;
  label: string;
  seatColor?: number;
  occupied?: boolean;
  areaWidth?: number;
  areaDepth?: number;
}

// ─── PlayerAreaObject3D ───────────────────────────────────────────────────────

export class PlayerAreaObject3D extends THREE.Group {
  readonly areaId: string;
  private _label: string;
  private _occupied: boolean;
  private readonly _seatColor: number;
  private _isHovered = false;
  private _isSelected = false;
  private _isVisible = true;

  private readonly _areaWidth: number;
  private readonly _areaDepth: number;

  // Three.js sub-objects
  private _borderLine: THREE.LineLoop | null = null;
  private _slotLine: THREE.LineLoop | null = null;
  private _labelSprite: THREE.Sprite | null = null;
  private _occupantFrame?: number;
  private _avatar: THREE.Mesh | null = null;

  // Reusable materials (kept for dispose & color updates)
  private readonly _borderMaterial: THREE.LineBasicMaterial;
  private readonly _slotMaterial: THREE.LineBasicMaterial;
  private readonly _avatarMaterial: THREE.MeshBasicMaterial;
  private _labelTexture: THREE.CanvasTexture | null = null;
  private _labelMaterial: THREE.SpriteMaterial | null = null;

  constructor(opts: PlayerAreaObject3DOptions) {
    super();
    this.areaId = opts.id;
    this._label = opts.label;
    this._occupied = opts.occupied ?? true;
    this._seatColor = opts.seatColor ?? PLAYER_AREA_VISUAL_CONFIG.BORDER_COLOR;
    this._areaWidth = opts.areaWidth ?? PLAYER_AREA_VISUAL_CONFIG.AREA_WIDTH;
    this._areaDepth = opts.areaDepth ?? PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH;

    // Set group position and rotation
    this.position.set(opts.x, PLAYER_AREA_VISUAL_CONFIG.SURFACE_Y, opts.z);
    this.rotation.y = opts.rotationY;

    // Create shared materials
    this._borderMaterial = new THREE.LineBasicMaterial({
      color: this._seatColor,
      transparent: true,
      opacity: PLAYER_AREA_VISUAL_CONFIG.BORDER_OPACITY,
      depthWrite: false,
    });

    this._slotMaterial = new THREE.LineBasicMaterial({
      color: this._seatColor,
      transparent: true,
      opacity: PLAYER_AREA_VISUAL_CONFIG.SLOT_OPACITY,
      depthWrite: false,
    });

    this._avatarMaterial = new THREE.MeshBasicMaterial({
      color: this._seatColor,
      side: THREE.DoubleSide,
    });

    this._buildBorder();
    this._buildSlotIndicator();
    this._buildLabel();
    this._buildAvatarPlaceholder();
    this._updateVisuals();
  }

  // ─── Build Helpers ────────────────────────────────────────────────────────

  private _buildBorder(): void {
    const hw = this._areaWidth / 2;
    const hd = this._areaDepth / 2;
    const geom = new THREE.BufferGeometry();
    const pts = new Float32Array([
      -hw, 0, -hd,
       hw, 0, -hd,
       hw, 0,  hd,
      -hw, 0,  hd,
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this._borderLine = new THREE.LineLoop(geom, this._borderMaterial);
    this._borderLine.renderOrder = 1;
    this.add(this._borderLine);
  }

  private _buildSlotIndicator(): void {
    const INSET = 0.15;
    const hw = this._areaWidth / 2 - INSET;
    const hd = this._areaDepth / 2 - INSET;
    const geom = new THREE.BufferGeometry();
    const pts = new Float32Array([
      -hw, 0, -hd,
       hw, 0, -hd,
       hw, 0,  hd,
      -hw, 0,  hd,
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this._slotLine = new THREE.LineLoop(geom, this._slotMaterial);
    this._slotLine.renderOrder = 1;
    this.add(this._slotLine);
  }

  private _buildLabel(): void {
    // Dispose previous label resources if rebuilding
    this._disposeLabel();

    const canvas = this._createLabelCanvas(this._label);
    this._labelTexture = new THREE.CanvasTexture(canvas);
    this._labelTexture.colorSpace = THREE.SRGBColorSpace;
    this._labelMaterial = new THREE.SpriteMaterial({
      map: this._labelTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const { LABEL_WIDTH, LABEL_HEIGHT, LABEL_Y, LABEL_OUTSET } = PLAYER_AREA_VISUAL_CONFIG;
    // Sprite luôn hướng về camera dù mỗi máy ngồi ở một góc khác nhau.
    this._labelSprite = new THREE.Sprite(this._labelMaterial);
    this._labelSprite.scale.set(LABEL_WIDTH, LABEL_HEIGHT, 1);
    this._labelSprite.name = 'SeatName_' + this.areaId;
    this._labelSprite.position.set(0, LABEL_Y, LABEL_OUTSET);
    this._labelSprite.renderOrder = 6;
    this.add(this._labelSprite);
  }

  private _createLabelCanvas(text: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    // ctx may be null in test environments (JSDOM) — skip drawing safely
    if (!ctx) return canvas;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(12,18,30,0.94)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.strokeStyle = '#' + this._seatColor.toString(16).padStart(6, '0');
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32, 224);
    return canvas;
  }

  private _buildAvatarPlaceholder(): void {
    const geom = new THREE.CircleGeometry(
      PLAYER_AREA_VISUAL_CONFIG.AVATAR_RADIUS,
      PLAYER_AREA_VISUAL_CONFIG.AVATAR_SEGMENTS
    );
    this._avatar = new THREE.Mesh(geom, this._avatarMaterial);
    this._avatar.position.set(0, PLAYER_AREA_VISUAL_CONFIG.AVATAR_Y, PLAYER_AREA_VISUAL_CONFIG.AVATAR_OUTSET);
    this._avatar.rotation.x = -Math.PI / 2;
    this._avatar.renderOrder = 1;
    this.add(this._avatar);
  }

  // ─── Visual State ─────────────────────────────────────────────────────────

  private _updateVisuals(): void {
    const { BORDER_OPACITY, EMPTY_OPACITY, SLOT_OPACITY } = PLAYER_AREA_VISUAL_CONFIG;
    this._borderMaterial.opacity = this._isSelected || this._isHovered ? 1 : this._occupied ? BORDER_OPACITY : EMPTY_OPACITY;
    this._slotMaterial.opacity = this._occupied ? SLOT_OPACITY : EMPTY_OPACITY;
    if (this._labelSprite) this._labelSprite.visible = this._occupied;
    if (this._avatar) this._avatar.visible = this._occupied;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setHovered(hovered: boolean): void {
    this._isHovered = hovered;
    this._updateVisuals();
  }

  setSelected(selected: boolean): void {
    this._isSelected = selected;
    this._updateVisuals();
  }


  animateOccupantFrom(previous: THREE.Vector3, duration: number, render: () => void): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this._stopOccupantAnimation();
    const offset = this.worldToLocal(previous.clone());
    const started = performance.now();
    const frame = (now: number): void => {
      const t = Math.min(1, Math.max(0, (now - started) / duration));
      const weight = 1 - t * t * (3 - 2 * t);
      if (this._labelSprite) this._labelSprite.position.set(offset.x * weight, PLAYER_AREA_VISUAL_CONFIG.LABEL_Y, PLAYER_AREA_VISUAL_CONFIG.LABEL_OUTSET + offset.z * weight);
      if (this._avatar) this._avatar.position.set(offset.x * weight, PLAYER_AREA_VISUAL_CONFIG.AVATAR_Y, PLAYER_AREA_VISUAL_CONFIG.AVATAR_OUTSET + offset.z * weight);
      render();
      this._occupantFrame = t < 1 ? requestAnimationFrame(frame) : undefined;
    };
    frame(started);
  }

  private _stopOccupantAnimation(): void {
    if (this._occupantFrame !== undefined) cancelAnimationFrame(this._occupantFrame);
    this._occupantFrame = undefined;
    if (this._labelSprite) this._labelSprite.position.set(0, PLAYER_AREA_VISUAL_CONFIG.LABEL_Y, PLAYER_AREA_VISUAL_CONFIG.LABEL_OUTSET);
    if (this._avatar) this._avatar.position.set(0, PLAYER_AREA_VISUAL_CONFIG.AVATAR_Y, PLAYER_AREA_VISUAL_CONFIG.AVATAR_OUTSET);
  }

  setOccupant(label: string, occupied: boolean): boolean {
    if (this._label !== label || this._occupied !== occupied) this._stopOccupantAnimation();
    if (this._label === label && this._occupied === occupied) return false;
    this._occupied = occupied;
    if (this._label !== label) this.setLabel(label);
    this._updateVisuals();
    return true;
  }

  setLabel(label: string): void {
    this._label = label;
    this._buildLabel();
    this._updateVisuals();
  }

  setVisible(visible: boolean): void {
    this._isVisible = visible;
    this.visible = this._isVisible;
  }

  isHovered(): boolean {
    return this._isHovered;
  }

  isSelected(): boolean {
    return this._isSelected;
  }

  getLabel(): string {
    return this._label;
  }

  /**
   * Returns the axis-aligned bounding box in world-space XZ, simplified.
   * Uses the group's world position and half-dimensions without rotation correction.
   */
  getBoundingBox(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    // Get world position
    const worldPos = new THREE.Vector3();
    this.getWorldPosition(worldPos);
    // Use half-diagonals as conservative AABB when rotated
    const halfDiag = Math.sqrt(
      (this._areaWidth / 2) ** 2 + (this._areaDepth / 2) ** 2
    );
    return {
      minX: worldPos.x - halfDiag,
      maxX: worldPos.x + halfDiag,
      minZ: worldPos.z - halfDiag,
      maxZ: worldPos.z + halfDiag,
    };
  }

  /**
   * Returns true if world-space point (x, z) is inside this area.
   * Converts to local space using the group's world matrix inverse.
   */
  containsPoint(x: number, z: number): boolean {
    const worldPoint = new THREE.Vector3(x, this.position.y, z);
    const localPoint = this.worldToLocal(worldPoint.clone());
    const hw = this._areaWidth / 2;
    const hd = this._areaDepth / 2;
    return (
      localPoint.x >= -hw && localPoint.x <= hw &&
      localPoint.z >= -hd && localPoint.z <= hd
    );
  }

  // ─── Dispose ──────────────────────────────────────────────────────────────

  private _disposeLabel(): void {
    if (this._labelSprite) {
      this.remove(this._labelSprite);
      this._labelSprite = null;
    }
    this._labelTexture?.dispose();
    this._labelTexture = null;
    this._labelMaterial?.dispose();
    this._labelMaterial = null;
  }

  dispose(): void {
    this._stopOccupantAnimation();
    // Border
    if (this._borderLine) {
      this._borderLine.geometry.dispose();
      this.remove(this._borderLine);
      this._borderLine = null;
    }
    this._borderMaterial.dispose();

    // Slot indicator
    if (this._slotLine) {
      this._slotLine.geometry.dispose();
      this.remove(this._slotLine);
      this._slotLine = null;
    }
    this._slotMaterial.dispose();

    // Label sprite
    this._disposeLabel();

    // Avatar
    if (this._avatar) {
      this._avatar.geometry.dispose();
      this.remove(this._avatar);
      this._avatar = null;
    }
    this._avatarMaterial.dispose();

    // Remove self from parent if attached
    this.parent?.remove(this);
  }
}
