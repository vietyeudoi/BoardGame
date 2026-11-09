/**
 * CardObject3D.ts — 3D Physical Card Mesh & State Controller
 * Digital Tabletop Sandbox 3D Card representation with front/back faces,
 * realistic paper thickness, rounded corners, procedural/custom textures,
 * flip state, and memory-safe lifecycle management per M1.2.1.
 */
import * as THREE from 'three';
import { CARD_CONFIG } from './CardConfig';
import { TABLE_CONFIG } from './TableConfig';
import { getCardFaceImage } from './CardFaceImages';
import { getCardFaceRules } from './CardFaceRules';
import { CardTextureGenerator } from './CardTextureGenerator';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CardObject3D');

export interface CardContent {
  title?: string;
  description?: string;
  artwork?: string | HTMLCanvasElement | HTMLImageElement;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}

export interface CardOptions {
  id?: string;
  cardType?: string;
  faceImage?: string;
  ownerId?: string | null;
  width?: number;
  height?: number;
  thickness?: number;
  cornerRadius?: number;
  frontTexture?: THREE.Texture;
  backTexture?: THREE.Texture;
  title?: string;
  description?: string;
  artwork?: string | HTMLCanvasElement | HTMLImageElement;
  faceUp?: boolean;
  position?: THREE.Vector3 | { x: number; y: number; z: number };
  rotation?: THREE.Euler | { x: number; y: number; z: number };
  scale?: THREE.Vector3 | { x: number; y: number; z: number };
}

/** Duration of the visual Y-axis flip animation (M1.7.4). */
export const CARD_FLIP_DURATION_MS = 280;

export interface CardFlipOptions {
  durationMs?: number;
  requestRender?: () => void;
  onComplete?: () => void;
}

export class CardObject3D extends THREE.Group {
  public readonly cardId: string;
  public readonly cardWidth: number;
  public readonly cardHeight: number;
  public readonly cardThickness: number;
  public readonly cornerRadius: number;

  private _faceUp = true;
  private _flipStartZ = 0;
  private _isDisposed = false;
  public _ownerId: string | null = null;
  private _isMasked = false;
  /**
   * M1.7.8: canonical card type (e.g. "exploding-kitten"). Kept as display
   * metadata only — never used for gameplay rules in this sandbox.
   */
  private _cardType: string | null = null;
  private _stackId: string | null = null;
  private _handZoneId: string | null = null;
  private _layerIndex = 0;

  /** M1.7.4: while true, layout managers must not write this card's transform. */
  private _layoutControlled = false;

  // M1.7.4: animated Y-axis flip state
  private _flipAnimating = false;
  private _flipTargetFaceUp = true;
  private _flipElapsedMs = 0;
  private _flipDurationMs = CARD_FLIP_DURATION_MS;
  private _flipFramePending = false;
  private _flipRequestRender: (() => void) | null = null;
  private _flipOnComplete: (() => void) | null = null;

  private _content: CardContent;

  // Visual Meshes and Materials
  private readonly _cardMesh: THREE.Mesh;
  private readonly _frontMaterial: THREE.MeshStandardMaterial;
  private readonly _backMaterial: THREE.MeshStandardMaterial;
  private readonly _sideMaterial: THREE.MeshStandardMaterial;

  // Textures and Canvas reuse
  private _frontTexture: THREE.Texture | null = null;
  private _backTexture: THREE.Texture | null = null;
  private _frontCanvas: HTMLCanvasElement | null = null;
  private _ownsFrontTexture = false;
  private _externalFrontTexture = false;
  private _faceImage?: string;
  private _sharedFrontImage?: string;
  private _sharedFrontKey: string | null = null;
  private _sharedBackTexture = false;

  constructor(options?: CardOptions) {
    super();

    this.cardId =
      options?.id ??
      `card_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    this.name = `CardObject3D_${this.cardId}`;

    this.cardWidth = options?.width ?? CARD_CONFIG.DEFAULT_WIDTH;
    this.cardHeight = options?.height ?? CARD_CONFIG.DEFAULT_HEIGHT;
    this.cardThickness = options?.thickness ?? CARD_CONFIG.DEFAULT_THICKNESS;
    this.cornerRadius = options?.cornerRadius ?? CARD_CONFIG.DEFAULT_CORNER_RADIUS;

    this._faceUp = options?.faceUp ?? true;
    this._cardType = options?.cardType ?? null;
    this._faceImage = options?.faceImage;
    this._ownerId = options?.ownerId ?? null;

    this._content = {
      title: options?.title ?? 'Card',
      description: options?.description ?? '',
      artwork: options?.artwork,
    };

    // 1. Setup Textures
    this._initTextures(options);

    // 2. Setup Materials
    this._frontMaterial = new THREE.MeshStandardMaterial({
      map: this._frontTexture,
      roughness: CARD_CONFIG.SURFACE_ROUGHNESS,
      metalness: CARD_CONFIG.SURFACE_METALNESS,
      color: 0xffffff,
    });

    this._backMaterial = new THREE.MeshStandardMaterial({
      map: this._backTexture,
      roughness: CARD_CONFIG.SURFACE_ROUGHNESS,
      metalness: CARD_CONFIG.SURFACE_METALNESS,
      color: 0xffffff,
    });

    this._sideMaterial = new THREE.MeshStandardMaterial({
      color: CARD_CONFIG.EDGE_COLOR,
      roughness: CARD_CONFIG.EDGE_ROUGHNESS,
      metalness: CARD_CONFIG.EDGE_METALNESS,
    });

    // 3. Construct 3D Extruded Geometry with 3 distinct material groups
    const geometry = this._buildGeometry();

    // 4. Create Card Body Mesh
    this._cardMesh = new THREE.Mesh(geometry, [
      this._frontMaterial, // Index 0: Front face
      this._backMaterial,  // Index 1: Back face
      this._sideMaterial,  // Index 2: Paper core edge
    ]);
    this._cardMesh.name = `${this.name}_Mesh`;
    this._cardMesh.castShadow = true;
    this._cardMesh.receiveShadow = true;

    // Apply initial face-up/down rotation
    this._cardMesh.rotation.z = this._faceUp ? 0 : Math.PI;

    // Offset sub-mesh so Group origin (0, 0, 0) corresponds to the bottom surface of the card
    this._cardMesh.position.set(0, this.cardThickness / 2, 0);

    this.add(this._cardMesh);

    // 5. Initial Position, Rotation, Scale
    if (options?.position) {
      this.position.set(options.position.x, options.position.y, options.position.z);
    } else {
      // Resting flush on tabletop surface (bottom touches table at SURFACE_Y)
      this.position.set(0, TABLE_CONFIG.SURFACE_Y, 0);
    }

    if (options?.rotation) {
      this.rotation.set(options.rotation.x, options.rotation.y, options.rotation.z);
    }

    if (options?.scale) {
      this.scale.set(options.scale.x, options.scale.y, options.scale.z);
    }

    logger.debug('CardObject3D created', {
      id: this.cardId,
      faceUp: this._faceUp,
      width: this.cardWidth,
      height: this.cardHeight,
    });
  }

  // ─── ID and Identification ────────────────────────────────────────────────

  getId(): string {
    return this.cardId;
  }

  getOwnerId(): string | null {
    return this._ownerId;
  }

  setOwnerId(ownerId: string | null): void {
    this._ownerId = ownerId;
  }

  /** Checks if the front face of this card is visually masked (M1.5.4) */
  isMasked(): boolean {
    return this._isMasked;
  }

  // ─── Card Type Metadata (M1.7.8) ──────────────────────────────────────────

  /** Returns the canonical card type, or null when the card has none. */
  getCardType(): string | null {
    return this._cardType;
  }

  /** Stores the canonical card type for display (screen-space fan preview). */
  getFaceImage(): string | undefined {
    return this._faceImage;
  }

  setCardType(cardType: string | null, faceImage = this._cardType === cardType ? this._faceImage : undefined): void {
    if (this._isDisposed || (this._cardType === cardType && this._faceImage === faceImage)) return;
    this._cardType = cardType;
    this._faceImage = faceImage;
    this._refreshFrontTexture();
  }

  /**
   * Sets whether the front face of this card is masked to show the back texture (M1.5.4).
   * Used for opponent hand privacy to guarantee front face is never exposed.
   */
  setMasked(masked: boolean): void {
    if (this._isDisposed) return;
    if (this._isMasked === masked) return;
    this._isMasked = masked;
    this._frontMaterial.map = masked ? this._backTexture : this._frontTexture;
    this._frontMaterial.needsUpdate = true;
  }

  getObject3D(): THREE.Group {
    return this;
  }

  getMesh(): THREE.Mesh {
    return this._cardMesh;
  }

  /**
   * Sets micro cascade offset for visual stair-stepping when in a stack (M1.3.4.3).
   * Moves the inner mesh relative to the card's group origin without changing group world position.
   */
  setCascadeOffset(offsetX: number, offsetZ: number): void {
    this._cardMesh.position.x = offsetX;
    this._cardMesh.position.z = offsetZ;
  }

  getCascadeOffset(): { x: number; z: number } {
    return { x: this._cardMesh.position.x, z: this._cardMesh.position.z };
  }

  /** Returns world-space bounding box of the card */
  getBoundingBox(): THREE.Box3 {
    this.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(this);
  }

  /** Returns world Y coordinate of the bottom surface of the card */
  getBottomY(): number {
    return this.getBoundingBox().min.y;
  }

  /** Returns world Y coordinate of the top surface of the card */
  getTopY(): number {
    return this.getBoundingBox().max.y;
  }

  // ─── Face Up / Flip Management ────────────────────────────────────────────

  isFaceUp(): boolean {
    return this._faceUp;
  }

  setFaceUp(faceUp: boolean): void {
    if (this._isDisposed) return;
    this._cancelFlipAnimation(false);
    this._faceUp = faceUp;
    // Rotate card mesh around local Z axis so the correct cap faces upward.
    this._cardMesh.rotation.z = faceUp ? 0 : Math.PI;
  }

  flip(): void {
    if (this._isDisposed) return;
    this.setFaceUp(!this._faceUp);
  }

  /**
   * M1.7.4: Animate a flip around the card’s local Z axis. The semantic face state is
   * updated immediately so callers may keep broadcasting/authorizing while the
   * mesh completes its visual turn. Masked cards stay masked for the whole
   * animation, so opponent hand content is never exposed.
   */
  animateFlipTo(faceUp: boolean, options?: CardFlipOptions): void {
    if (this._isDisposed) return;
    if (!this._flipAnimating && this._faceUp === faceUp) return;

    this._cancelFlipAnimation(false);
    this._flipStartZ = this._cardMesh.rotation.z;

    this._faceUp = faceUp;
    this._flipTargetFaceUp = faceUp;
    this._flipDurationMs = Math.max(0, options?.durationMs ?? CARD_FLIP_DURATION_MS);
    this._flipElapsedMs = 0;
    this._flipRequestRender = options?.requestRender ?? null;
    this._flipOnComplete = options?.onComplete ?? null;

    if (typeof requestAnimationFrame === 'undefined' || this._flipDurationMs === 0) {
      this.setFaceUp(faceUp);
      this._notifyFlipComplete();
      return;
    }

    this._flipAnimating = true;
    this._scheduleFlipFrame();
  }

  isFlipAnimating(): boolean {
    return this._flipAnimating;
  }

  /** Completes an in-flight flip immediately (used by tests and teardown). */
  flushFlipAnimation(): void {
    if (!this._flipAnimating) return;
    this.advanceFlipAnimation(this._flipDurationMs);
  }

  /**
   * Advances an in-flight flip by `deltaMs`. rAF drives this in the browser;
   * deterministic tests can call it directly.
   */
  advanceFlipAnimation(deltaMs: number): void {
    if (!this._flipAnimating || this._isDisposed) return;
    this._flipElapsedMs = Math.min(
      this._flipDurationMs,
      this._flipElapsedMs + Math.max(0, deltaMs)
    );
    this._applyFlipProgress();
    if (this._flipElapsedMs >= this._flipDurationMs) {
      this._finishFlipAnimation();
    } else {
      this._scheduleFlipFrame();
    }
    this._flipRequestRender?.();
  }

  private _scheduleFlipFrame(): void {
    if (this._flipFramePending) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    this._flipFramePending = true;
    requestAnimationFrame(() => {
      this._flipFramePending = false;
      if (!this._flipAnimating || this._isDisposed) return;
      this._flipElapsedMs = Math.min(this._flipDurationMs, this._flipElapsedMs + 16.7);
      this._applyFlipProgress();
      if (this._flipElapsedMs >= this._flipDurationMs) {
        this._finishFlipAnimation();
      } else {
        this._scheduleFlipFrame();
      }
      this._flipRequestRender?.();
    });
  }

  private _applyFlipProgress(): void {
    const t = this._flipDurationMs <= 0
      ? 1
      : Math.min(1, this._flipElapsedMs / this._flipDurationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    // Lá nằm trong XZ, trục dọc của lá là Z.
    this._cardMesh.rotation.z = THREE.MathUtils.lerp(this._flipStartZ, this._flipTargetFaceUp ? 0 : Math.PI, eased);
  }

  private _finishFlipAnimation(): void {
    const target = this._flipTargetFaceUp;
    this._flipAnimating = false;
    this._cardMesh.rotation.y = 0;
    this._faceUp = target;
    this._cardMesh.rotation.z = target ? 0 : Math.PI;
    this._notifyFlipComplete();
  }

  private _cancelFlipAnimation(applyTarget: boolean): void {
    if (!this._flipAnimating) return;
    const target = this._flipTargetFaceUp;
    this._flipAnimating = false;
    this._cardMesh.rotation.y = 0;
    if (applyTarget) {
      this._faceUp = target;
      this._cardMesh.rotation.z = target ? 0 : Math.PI;
    }
  }

  private _notifyFlipComplete(): void {
    const cb = this._flipOnComplete;
    this._flipOnComplete = null;
    this._flipRequestRender = null;
    cb?.();
  }

  // ─── Layout Control (M1.7.4) ──────────────────────────────────────────────

  /**
   * Marks this card as exclusively controlled by a transfer animator/drag.
   * Hand layout and stack arrangement must skip transform writes while true.
   */
  setLayoutControlled(controlled: boolean): void {
    this._layoutControlled = controlled;
  }

  isLayoutControlled(): boolean {
    return this._layoutControlled;
  }

  // ─── Content and Textures ─────────────────────────────────────────────────

  private _initTextures(options?: CardOptions): void {
    // Front Texture
    if (options?.frontTexture) {
      this._frontTexture = options.frontTexture;
      this._externalFrontTexture = true;
    } else {
      this._generateProceduralFrontTexture();
    }

    // Back Texture
    if (options?.backTexture) {
      this._backTexture = options.backTexture;
      this._sharedBackTexture = false;
    } else {
      this._generateProceduralBackTexture();
    }
  }


  private _generateProceduralFrontTexture(): void {
    const { title, description, artwork, backgroundColor, textColor, accentColor } = this._content;
    const type = this._cardType;
    const canonical = type !== null && getCardFaceRules(type) !== undefined;
    const plainUnknown = type === null && (!title || title === 'Card') && !description && !textColor && !accentColor;
    // Lá đã biết loại dùng mẫu chuẩn, kể cả khi nơi tạo truyền thêm nhãn thao tác.
    if (!artwork && !backgroundColor && (canonical || plainUnknown)) {
      const key = type ?? '';
      const image = getCardFaceImage(type, this._faceImage) ? this._faceImage ?? '' : undefined;
      if (this._sharedFrontKey === key && this._sharedFrontImage === image) return;
      this._releaseFrontTexture();
      this._frontTexture = image === undefined ? CardTextureGenerator.acquireFrontTexture(key)
        : CardTextureGenerator.acquireFrontTexture(key, 'standard', image);
      if (this._frontTexture) {
        this._sharedFrontKey = key;
        this._sharedFrontImage = image;
      }
      return;
    }
    if (this._sharedFrontKey !== null) this._releaseFrontTexture();
    this._frontCanvas = CardTextureGenerator.getOrCreateCanvas(this._frontCanvas);
    if (this._frontCanvas) {
      CardTextureGenerator.drawFront(this._frontCanvas, this._content, this._cardType);
      if (!this._frontTexture) {
        this._frontTexture = CardTextureGenerator.createTextureFromCanvas(this._frontCanvas);
        this._ownsFrontTexture = true;
      } else {
        this._frontTexture.needsUpdate = true;
      }
    }
  }

  private _generateProceduralBackTexture(): void {
    this._backTexture = CardTextureGenerator.acquireBackTexture();
    this._sharedBackTexture = this._backTexture !== null;
  }


  private _releaseFrontTexture(): void {
    if (this._sharedFrontKey !== null) CardTextureGenerator.releaseFrontTexture(this._sharedFrontKey, 'standard', this._sharedFrontImage);
    else if (this._ownsFrontTexture) this._frontTexture?.dispose();
    this._sharedFrontKey = null;
    this._sharedFrontImage = undefined;
    this._ownsFrontTexture = false;
    this._frontTexture = null;
    this._frontCanvas = null;
  }

  setFrontTexture(texture: THREE.Texture): void {
    if (this._isDisposed || this._frontTexture === texture) return;
    this._releaseFrontTexture();
    this._frontTexture = texture;
    this._externalFrontTexture = true;
    if (!this._isMasked) {
      this._frontMaterial.map = texture;
      this._frontMaterial.needsUpdate = true;
    }
  }

  setBackTexture(texture: THREE.Texture): void {
    if (this._isDisposed) return;
    if (this._backTexture === texture) return;
    if (this._sharedBackTexture) CardTextureGenerator.releaseBackTexture();
    this._backTexture = texture;
    this._sharedBackTexture = false;
    this._backMaterial.map = texture;
    this._backMaterial.needsUpdate = true;
  }

  updateContent(content: CardContent): void {
    if (this._isDisposed) return;

    const keys = Object.keys(content) as (keyof CardContent)[];
    if (keys.every(key => content[key] === this._content[key])) return;
    this._content = { ...this._content, ...content };

    this._refreshFrontTexture();
  }

  private _refreshFrontTexture(): void {

    if (this._externalFrontTexture) return;
    this._generateProceduralFrontTexture();
    if (!this._isMasked && this._frontMaterial.map !== this._frontTexture) {
      this._frontMaterial.map = this._frontTexture;
      this._frontMaterial.needsUpdate = true;
    }
  }

  getContent(): CardContent {
    return { ...this._content };
  }

  // ─── Transforms ───────────────────────────────────────────────────────────

  setPosition(x: number, y: number, z: number): void {
    if (this._isDisposed) return;
    this.position.set(x, y, z);
  }

  setRotation(x: number, y: number, z: number): void {
    if (this._isDisposed) return;
    this.rotation.set(x, y, z);
  }

  setScale(x: number, y: number, z: number): void {
    if (this._isDisposed) return;
    this.scale.set(x, y, z);
  }

  // ─── Rotation & Arrangement (M1.3.4) ──────────────────────────────────────

  /** Returns rotation around Y axis normalized to [0, 2*PI) */
  getRotationY(): number {
    // Euler XYZ có thể biểu diễn yaw lớn bằng pitch/roll π sau khi slerp.
    const { x, y, z, w } = this.quaternion;
    const yaw = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
    return Math.abs(yaw) < Number.EPSILON * 4 ? 0 : THREE.MathUtils.euclideanModulo(yaw, Math.PI * 2);
  }

  /** Rotates card around Y axis by given radians */
  override rotateY(angleRadians: number): this {
    if (!this._isDisposed) {
      if (this.rotation.order !== "YXZ") this.rotation.reorder("YXZ");
      this.rotation.y += angleRadians;
    }
    return this;
  }

  /** Rotates card 90 degrees clockwise on tabletop */
  rotateClockwise90(): void {
    this.rotateY(Math.PI / 2);
  }

  /** Rotates card 90 degrees counter-clockwise on tabletop */
  rotateCounterClockwise90(): void {
    this.rotateY(-Math.PI / 2);
  }

  /** Returns stack ID if card is part of a stack, or null */
  getStackId(): string | null {
    return this._stackId;
  }

  /** Assigns or clears stack ID */
  setStackId(stackId: string | null): void {
    this._stackId = stackId;
  }

  /** Checks if card is currently stacked */
  isInStack(): boolean {
    return this._stackId !== null;
  }

  /** Returns hand zone ID if card is in a hand zone, or null */
  getHandZoneId(): string | null {
    return this._handZoneId;
  }

  /** Assigns or clears hand zone ID (M1.5.0) */
  setHandZoneId(handZoneId: string | null): void {
    this._handZoneId = handZoneId;
    if (handZoneId !== null) {
      this._stackId = null; // Cannot be in both Hand and Stack
    }
  }

  /** Checks if card is currently held in a hand zone (M1.5.0) */
  isInHand(): boolean {
    return this._handZoneId !== null;
  }

  /** Gets visual layering index */
  getLayerIndex(): number {
    return this._layerIndex;
  }

  /** Sets visual layering index and updates renderOrder */
  setLayerIndex(index: number): void {
    this._layerIndex = index;
    this._cardMesh.renderOrder = index;
  }

  // ─── Geometry Construction ────────────────────────────────────────────────

  /**
   * Constructs an extruded rounded rectangle with 3 discrete material groups:
   * - Group 0 (materialIndex 0): Front face cap (+Y normal when flat)
   * - Group 1 (materialIndex 1): Back face cap (-Y normal when flat)
   * - Group 2 (materialIndex 2): Edge/sides (perimeter paper)
   */
  private _buildGeometry(): THREE.BufferGeometry {
    const W = this.cardWidth;
    const H = this.cardHeight;
    const R = Math.min(this.cornerRadius, W / 2 - 0.01, H / 2 - 0.01);
    const depth = this.cardThickness;

    // 2D Rounded Rectangle Shape
    const shape = new THREE.Shape();
    const x0 = -W / 2 + R;
    const x1 = W / 2 - R;
    const y0 = -H / 2 + R;
    const y1 = H / 2 - R;

    shape.moveTo(x0, -H / 2);
    shape.lineTo(x1, -H / 2);
    shape.absarc(x1, y0, R, -Math.PI / 2, 0, false);
    shape.lineTo(W / 2, y1);
    shape.absarc(x1, y1, R, 0, Math.PI / 2, false);
    shape.lineTo(x0, H / 2);
    shape.absarc(x0, y1, R, Math.PI / 2, Math.PI, false);
    shape.lineTo(-W / 2, y0);
    shape.absarc(x0, y0, R, Math.PI, Math.PI * 1.5, false);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: CARD_CONFIG.CURVE_SEGMENTS,
    });

    // Center geometry so rotation center is at (0, 0, 0)
    geo.center();

    // Rotate -90° around X axis so length lies along Z and thickness along Y
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;

    // Split caps into separate Front Face and Back Face groups
    const totalCap = geo.groups[0]?.count ?? 0;
    const halfCap = Math.floor(totalCap / 2);

    // Bottom cap (Back Face)
    for (let i = 0; i < halfCap; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Mirrored U so text on card back is not reversed when flipped
      uv.setXY(i, (W / 2 - x) / W, (H / 2 - z) / H);
    }

    // Top cap (Front Face)
    for (let i = halfCap; i < totalCap; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, (x + W / 2) / W, (H / 2 - z) / H);
    }
    uv.needsUpdate = true;

    // Reorganize groups: Group 0 = Front, Group 1 = Back, Group 2 = Sides
    const sideGroupCount = geo.groups[1]?.count ?? 0;
    geo.groups = [
      { start: halfCap, count: halfCap, materialIndex: 0 },         // Front Face
      { start: 0, count: halfCap, materialIndex: 1 },               // Back Face
      { start: totalCap, count: sideGroupCount, materialIndex: 2 }, // Side Edge
    ];

    return geo;
  }

  // ─── Lifecycle & Disposal ─────────────────────────────────────────────────

  isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this._flipAnimating = false;
    this._layoutControlled = false;

    // 1. Dispose geometry
    if (this._cardMesh.geometry) {
      this._cardMesh.geometry.dispose();
    }

    // 2. Dispose materials
    this._frontMaterial.map = null;
    this._frontMaterial.dispose();
    this._backMaterial.map = null;
    this._backMaterial.dispose();
    this._sideMaterial.dispose();

    // 3. Nhả texture dùng chung hoặc hủy texture riêng.
    this._releaseFrontTexture();
    if (this._sharedBackTexture) CardTextureGenerator.releaseBackTexture();
    this._backTexture = null;

    this._frontCanvas = null;

    // 4. Remove all children and cleanup
    this.remove(this._cardMesh);
    this.clear();

    logger.debug('CardObject3D disposed', { id: this.cardId });
  }
}
