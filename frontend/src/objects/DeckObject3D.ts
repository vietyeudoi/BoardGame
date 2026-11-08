/**
 * DeckObject3D.ts — 3D Tabletop Deck Stack & Card ID Collection Manager
 * Hiển thị bộ rút bằng một lá úp và số lá còn lại.
 * Adheres strictly to PROJECT_RULES.md (M1.2.2).
 */
import * as THREE from 'three';
import { DECK_CONFIG } from './DeckConfig';
import { TABLE_CONFIG } from './TableConfig';
import { CardTextureGenerator } from './CardTextureGenerator';
import { Logger } from '../utils/Logger';

const logger = Logger.create('DeckObject3D');

export interface DeckOptions {
  id?: string;
  cardIds?: string[];
  width?: number;
  height?: number;
  cardThickness?: number;
  cornerRadius?: number;
  topTexture?: THREE.Texture;
  position?: THREE.Vector3 | { x: number; y: number; z: number };
  rotation?: THREE.Euler | { x: number; y: number; z: number };
  scale?: THREE.Vector3 | { x: number; y: number; z: number };
}

export class DeckObject3D extends THREE.Group {
  public readonly deckId: string;
  public readonly deckWidth: number;
  public readonly deckHeight: number;
  public readonly cardThickness: number;
  public readonly cornerRadius: number;

  private _cardIds: string[] = [];
  private _isDisposed = false;
  private _onlineCount: number | null = null;
  private readonly _emptyOutline: THREE.LineLoop;
  private _badge: THREE.Sprite | null = null;
  private _badgeCount = -1;

  // 3D Visual Mesh & Materials
  private readonly _deckMesh: THREE.Mesh;
  private readonly _topMaterial: THREE.MeshStandardMaterial;
  private readonly _bottomMaterial: THREE.MeshStandardMaterial;
  private readonly _sideMaterial: THREE.MeshStandardMaterial;

  // Textures & Ownership
  private _topTexture: THREE.Texture | null = null;

  private _ownsTopTexture = false;
  private _sharedBackTexture = false;
  private _onlineTopType?: string;
  private _onlineTopTexture: THREE.CanvasTexture | null = null;
  private _activityFrame?: number;
  private _flippingFace = false;
  private _activityCards: THREE.Mesh[] = [];


  constructor(options?: DeckOptions) {
    super();

    this.deckId =
      options?.id ??
      `deck_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    this.name = `DeckObject3D_${this.deckId}`;

    this.deckWidth = options?.width ?? DECK_CONFIG.WIDTH;
    this.deckHeight = options?.height ?? DECK_CONFIG.HEIGHT;
    this.cardThickness = options?.cardThickness ?? DECK_CONFIG.CARD_THICKNESS;
    this.cornerRadius = options?.cornerRadius ?? DECK_CONFIG.CORNER_RADIUS;

    // 1. Initialize & Validate Card IDs
    if (options?.cardIds) {
      this._validateInitialCardIds(options.cardIds);
      this._cardIds = [...options.cardIds];
    } else {
      this._cardIds = [];
    }

    // 2. Textures Setup
    this._initTextures(options);

    // 3. Materials Setup
    this._topMaterial = new THREE.MeshStandardMaterial({
      map: this._topTexture,
      roughness: DECK_CONFIG.SURFACE_ROUGHNESS,
      metalness: DECK_CONFIG.SURFACE_METALNESS,
      color: 0xffffff,
    });

    this._bottomMaterial = new THREE.MeshStandardMaterial({
      color: DECK_CONFIG.EDGE_COLOR,
      roughness: DECK_CONFIG.EDGE_ROUGHNESS,
      metalness: DECK_CONFIG.EDGE_METALNESS,
    });

    this._sideMaterial = new THREE.MeshStandardMaterial({
      color: DECK_CONFIG.EDGE_COLOR,
      roughness: DECK_CONFIG.EDGE_ROUGHNESS,
      metalness: DECK_CONFIG.EDGE_METALNESS,
    });
    // 4. Geometry & Mesh Construction
    const geometry = this._buildGeometry();
    this._deckMesh = new THREE.Mesh(geometry, [
      this._topMaterial,    // Material Index 0: Top Cap (card back)
      this._bottomMaterial, // Material Index 1: Bottom Cap
      this._sideMaterial,   // Material Index 2: Layered paper sides
    ]);
    this._deckMesh.name = `${this.name}_Mesh`;
    this._deckMesh.castShadow = true;
    this._deckMesh.receiveShadow = true;
    this.add(this._deckMesh);
    const w = this.deckWidth / 2;
    const h = this.deckHeight / 2;
    this._emptyOutline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w, 0, -h), new THREE.Vector3(w, 0, -h),
      new THREE.Vector3(w, 0, h), new THREE.Vector3(-w, 0, h),
    ]), new THREE.LineBasicMaterial({ color: 0xb29a76, transparent: true, opacity: 0.45 }));
    this._emptyOutline.position.y = this.cardThickness + 0.002;
    this.add(this._emptyOutline);

    // 5. Initial Visual Mesh Scaling & Height
    this._updateVisualMesh();

    // 6. World Transform Setup
    if (options?.position) {
      this.position.set(options.position.x, options.position.y, options.position.z);
    } else {
      // Default resting flush on table surface
      this.position.set(0, TABLE_CONFIG.SURFACE_Y, 0);
    }

    if (options?.rotation) {
      this.rotation.set(options.rotation.x, options.rotation.y, options.rotation.z);
    }

    if (options?.scale) {
      this.scale.set(options.scale.x, options.scale.y, options.scale.z);
    }

    logger.debug('DeckObject3D created', {
      id: this.deckId,
      cardCount: this._cardIds.length,
      visualHeight: this.getVisualHeight(),
    });
  }

  // ─── Data Validation ──────────────────────────────────────────────────────

  private _validateInitialCardIds(ids: string[]): void {
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!id || typeof id !== 'string' || id.trim() === '') {
        throw new Error(
          `DeckObject3D (${this.deckId}): cardIds contains empty or invalid string at index ${i}`
        );
      }
      if (seen.has(id)) {
        throw new Error(
          `DeckObject3D (${this.deckId}): Duplicate card ID "${id}" detected in initial cardIds`
        );
      }
      seen.add(id);
    }
  }

  // ─── Data & Card Collection API ───────────────────────────────────────────

  getId(): string {
    return this.deckId;
  }

  getObject3D(): THREE.Group {
    return this;
  }

  getCount(): number {
    return this._onlineCount ?? this._cardIds.length;
  }

  resetLocalCards(cardIds: string[], online: boolean): void {
    this._clearActivity();
    this.setOnlineTopType(undefined);
    this._validateInitialCardIds(cardIds);
    this._cardIds = [...cardIds];
    this._onlineCount = online ? 0 : null;
    this._updateVisualMesh();
  }

  setOnlineCount(count: number): boolean {
    if (this._onlineCount === null || this._onlineCount === count) return false;
    this._onlineCount = count;
    this._updateVisualMesh();
    return true;
  }

  /**
   * Returns a shallow copy of card IDs to prevent direct external mutation.
   * Order convention: Index 0 is the bottom card; Last index is the top card.
   */
  getCardIds(): readonly string[] {
    return [...this._cardIds];
  }

  /**
   * Peeks at the top card ID without modifying deck state.
   * Returns null if the deck is empty.
   */
  peekTop(): string | null {
    if (this._cardIds.length === 0) return null;
    return this._cardIds[this._cardIds.length - 1];
  }

  /**
   * Draws (removes and returns) the top card ID from the deck.
   * Automatically updates visual mesh height. Returns null if empty.
   */
  draw(): string | null {
    if (this._isDisposed || this._cardIds.length === 0) return null;
    const topId = this._cardIds.pop()!;
    this._updateVisualMesh();
    return topId;
  }

  /**
   * Inserts a card ID at the specified index in the deck (0 = bottom, count = top).
   * index = number of cards below the inserted card.
   * Rejects empty IDs, duplicates, and out-of-range index.
   * M1.3.4.5: Advanced Deck & Stack Insertion.
   */
  insertCardAt(cardId: string, index: number): void {
    if (this._isDisposed) return;
    if (!cardId || typeof cardId !== 'string' || cardId.trim() === '') {
      throw new Error(`DeckObject3D (${this.deckId}): Cannot insert empty card ID`);
    }
    if (this._cardIds.includes(cardId)) {
      throw new Error(
        `DeckObject3D (${this.deckId}): Card with ID "${cardId}" already exists in deck`
      );
    }
    if (!Number.isInteger(index) || index < 0 || index > this._cardIds.length) {
      throw new Error(
        `DeckObject3D (${this.deckId}): Invalid insertion index ${index}. Must be between 0 and ${this._cardIds.length}`
      );
    }

    this._cardIds.splice(index, 0, cardId);
    this._updateVisualMesh();
  }

  /**
   * Removes a specific card ID from the deck (used during rollbacks or card transfers).
   * Automatically updates visual mesh height.
   * M1.3.4.5: Advanced Deck & Stack Insertion.
   */
  removeCardId(cardId: string): boolean {
    if (this._isDisposed) return false;
    const idx = this._cardIds.indexOf(cardId);
    if (idx === -1) return false;
    this._cardIds.splice(idx, 1);
    this._updateVisualMesh();
    return true;
  }

  /**
   * Inserts multiple card IDs at the specified index in the deck.
   * Preserves relative ordering of inserted cards (index 0 of batch placed at `index`).
   * Performs validation atomically before mutating state.
   * M1.3.4.5: Advanced Deck & Stack Insertion.
   */
  insertCardsAt(cardIds: string[], index: number): void {
    if (this._isDisposed) return;
    if (!cardIds || cardIds.length === 0) return;

    if (!Number.isInteger(index) || index < 0 || index > this._cardIds.length) {
      throw new Error(
        `DeckObject3D (${this.deckId}): Invalid insertion index ${index}. Must be between 0 and ${this._cardIds.length}`
      );
    }

    // Validate all candidate cards first
    const existingSet = new Set(this._cardIds);
    const newSet = new Set<string>();

    for (let i = 0; i < cardIds.length; i++) {
      const id = cardIds[i];
      if (!id || typeof id !== 'string' || id.trim() === '') {
        throw new Error(
          `DeckObject3D (${this.deckId}): insertCardsAt contains empty string at index ${i}`
        );
      }
      if (existingSet.has(id)) {
        throw new Error(
          `DeckObject3D (${this.deckId}): Card with ID "${id}" already exists in deck`
        );
      }
      if (newSet.has(id)) {
        throw new Error(
          `DeckObject3D (${this.deckId}): insertCardsAt contains duplicate card ID "${id}"`
        );
      }
      newSet.add(id);
    }

    this._cardIds.splice(index, 0, ...cardIds);
    this._updateVisualMesh();
  }

  /**
   * Adds a card ID onto the top of the deck.
   * Automatically updates visual mesh height.
   * Rejects empty IDs and duplicates.
   */
  addCard(cardId: string): void {
    this.insertCardAt(cardId, this._cardIds.length);
  }

  /**
   * Adds multiple card IDs onto the top of the deck in specified order.
   * Performs validation atomically before mutating state.
   */
  addCards(cardIds: string[]): void {
    this.insertCardsAt(cardIds, this._cardIds.length);
  }

  /**
   * In-place Fisher-Yates shuffle algorithm.
   * Preserves exact set of card IDs and visual height.
   * Accepts optional RNG for deterministic unit testing.
   */
  shuffle(rng?: () => number): void {
    if (this._isDisposed || this._cardIds.length <= 1) return;

    const random = rng ?? Math.random;
    for (let i = this._cardIds.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const temp = this._cardIds[i];
      this._cardIds[i] = this._cardIds[j];
      this._cardIds[j] = temp;
    }
  }

  // ─── Visual & Transform API ───────────────────────────────────────────────

  /**
   * Chiều cao biểu tượng của bộ bài, cố định bằng một lá khi còn bài.
   * Returns 0 if empty.
   */
  getVisualHeight(): number {
    return this.getCount() > 0 ? this.cardThickness : 0;
  }

  getMesh(): THREE.Mesh {
    return this._deckMesh;
  }

  /**
   * @deprecated M1.7.2 Fix D — Deck hover preview removed.
   * Kept as no-op for backward compatibility with any remaining call sites.
   */
  setHoverPreviewVisible(_visible: boolean): void { /* no-op */ }

  /**
   * Returns world-space bounding box.
   * Accurately reflects table contact and height.
   */
  getBoundingBox(): THREE.Box3 {
    this.updateWorldMatrix(true, true);
    if (this.getCount() === 0) {
      // Empty deck footprint at current position
      const halfW = this.deckWidth / 2;
      const halfH = this.deckHeight / 2;
      return new THREE.Box3(
        new THREE.Vector3(this.position.x - halfW, this.position.y, this.position.z - halfH),
        new THREE.Vector3(this.position.x + halfW, this.position.y, this.position.z + halfH)
      );
    }
    return new THREE.Box3().setFromObject(this._deckMesh);
  }

  getBottomY(): number {
    return this.getBoundingBox().min.y;
  }

  getTopY(): number {
    return this.getBoundingBox().max.y;
  }

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


  setOnlineTopType(cardType?: string): boolean {
    if (this._onlineTopType === cardType) return false;
    if (this._onlineTopType) CardTextureGenerator.releaseFrontTexture(this._onlineTopType);
    this._onlineTopType = cardType;
    this._onlineTopTexture = cardType ? CardTextureGenerator.acquireFrontTexture(cardType) : null;
    this._updateVisualMesh();
    return true;
  }

  private _clearActivity(): void {
    if (this._activityFrame !== undefined) cancelAnimationFrame(this._activityFrame);
    this._activityFrame = undefined;
    this._flippingFace = false;
    this._deckMesh.rotation.y = 0;
    this._deckMesh.scale.x = 1;
    for (const card of this._activityCards) {
      card.removeFromParent();
      (card.material as THREE.Material[])[0]?.dispose();
    }
    this._activityCards = [];
  }

  animateActivity(kind: 'flip' | 'shuffle' | 'insert', requestRender: () => void, count = 0): void {

    if (typeof requestAnimationFrame === 'undefined') return;
    if (kind === 'flip' && this._activityFrame !== undefined) {
      this._flippingFace = true;
      return;
    }
    const flip = kind === 'flip' || (kind === 'shuffle' && this._flippingFace);
    this._clearActivity();
    this._flippingFace = flip;
    // Lá minh họa bay vào chồng chỉ dùng mặt lưng, không gắn với ID lá thật.
    for (let index = 0; index < Math.min(count, 3); index++) {
      const back = new THREE.MeshStandardMaterial({ map: this._topTexture });
      const card = new THREE.Mesh(this._deckMesh.geometry, [back, this._bottomMaterial, this._sideMaterial]);
      this._activityCards.push(card);
      this.add(card);
    }
    const start = performance.now();
    const duration = kind === 'shuffle' ? 340 : 210;
    const animate = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1) {
        this._clearActivity();
        requestRender();
        return;
      }
      if (this._flippingFace) this._deckMesh.scale.x = 0.12 + 0.88 * t;
      if (kind === 'shuffle') this._deckMesh.rotation.y = Math.sin(t * Math.PI * 4) * 0.24 * (1 - t);
      this._activityCards.forEach((card, index) => {
        const distance = (1 - t) ** 2;
        card.position.set((index - 0.5) * 0.38 * distance, this.cardThickness + 0.5 * distance, 1.35 * distance);
      });
      requestRender();
      this._activityFrame = requestAnimationFrame(animate);
    };
    animate(start);
  }

  setTopTexture(texture: THREE.Texture, ownsTexture = false): void {
    if (this._isDisposed) return;
    if (this._topTexture === texture) return;
    this._releaseTopTexture();
    this._topTexture = texture;
    this._ownsTopTexture = ownsTexture;
    this._topMaterial.map = this.getCount() > 0 ? texture : null;
    this._topMaterial.needsUpdate = true;
  }

  // ─── Internal Mesh & Texture Construction ─────────────────────────────────

  private _initTextures(options?: DeckOptions): void {
    // 1. Top Face Texture (Card Back)
    if (options?.topTexture) {
      this._topTexture = options.topTexture;
      this._ownsTopTexture = false;
    } else {
      const shared = CardTextureGenerator.acquireBackTexture();
      this._topTexture = shared ?? new THREE.Texture();
      this._sharedBackTexture = shared !== null;
      this._ownsTopTexture = shared === null;
    }
  }

  private _releaseTopTexture(): void {
    if (this._sharedBackTexture) CardTextureGenerator.releaseBackTexture();
    else if (this._ownsTopTexture) this._topTexture?.dispose();
    this._sharedBackTexture = false;
    this._ownsTopTexture = false;
    this._topTexture = null;
  }

  private _buildGeometry(): THREE.BufferGeometry {
    const W = this.deckWidth;
    const H = this.deckHeight;
    const R = Math.min(this.cornerRadius, W / 2 - 0.01, H / 2 - 0.01);
    const depth = this.cardThickness;

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
      curveSegments: DECK_CONFIG.CURVE_SEGMENTS,
    });

    geo.center();
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;

    const totalCap = geo.groups[0]?.count ?? 0;
    const halfCap = Math.floor(totalCap / 2);

    // Top cap (Top Face): Index halfCap to totalCap (+Y normal)
    for (let i = halfCap; i < totalCap; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, (x + W / 2) / W, (H / 2 - z) / H);
    }

    // Bottom cap (Bottom Face): Index 0 to halfCap (-Y normal)
    for (let i = 0; i < halfCap; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, (W / 2 - x) / W, (H / 2 - z) / H);
    }
    uv.needsUpdate = true;

    // Material groups:
    // Group 0 (materialIndex 0): Top cap (+Y) -> Top card back artwork
    // Group 1 (materialIndex 1): Bottom cap (-Y) -> Paper core base
    // Group 2 (materialIndex 2): Sides -> Layered paper striations
    const sideCount = geo.groups[1]?.count ?? 0;
    geo.groups = [
      { start: halfCap, count: halfCap, materialIndex: 0 },
      { start: 0, count: halfCap, materialIndex: 1 },
      { start: totalCap, count: sideCount, materialIndex: 2 },
    ];

    return geo;
  }

  /**
   * Updates visual mesh scale, Y offset, and texture vertical repetition.
   * Performs zero geometry re-allocation for optimal 60 FPS performance.
   */
  private _updateVisualMesh(): void {
    const count = this.getCount();
    const empty = count === 0;
    this._deckMesh.position.y = this.cardThickness / 2;
    this._deckMesh.castShadow = !empty;
    this._emptyOutline.visible = empty;
    const map = empty ? null : this._onlineTopTexture ?? this._topTexture;
    if (this._topMaterial.map !== map) {
      this._topMaterial.map = map;
      this._topMaterial.needsUpdate = true;
    }
    this._topMaterial.color.setHex(empty ? 0x272324 : 0xffffff);
    this._updateCountBadge(count);
  }

  private _updateCountBadge(count: number): void {
    if (this._badgeCount === count || !CardTextureGenerator.isCanvasSupported()) return;
    if (!this._badge) {
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 96;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      this._badge = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      this._badge.scale.set(1.4, 0.7, 1);
      this._badge.position.set(this.deckWidth / 2, 0.36, -this.deckHeight / 2);
      this.add(this._badge);
    }
    const map = this._badge.material.map!;
    const ctx = (map.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 192, 96);
    ctx.fillStyle = "#29211d";
    ctx.beginPath();
    ctx.roundRect(2, 2, 188, 92, 20);
    ctx.fill();
    ctx.strokeStyle = "#d1a778";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = "bold 58px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff1d9";
    ctx.fillText(String(count), 96, 48, 160);
    map.needsUpdate = true;
    this._badgeCount = count;
  }

  // ─── Lifecycle & Disposal ─────────────────────────────────────────────────

  isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    this._clearActivity();
    if (this._onlineTopType) CardTextureGenerator.releaseFrontTexture(this._onlineTopType);
    this._onlineTopType = undefined;
    this._onlineTopTexture = null;

    // 1. Dispose geometry
    if (this._deckMesh.geometry) {
      this._deckMesh.geometry.dispose();
    }

    // 2. Dispose materials and clear map references
    this._topMaterial.map = null;
    this._topMaterial.dispose();
    this._bottomMaterial.map = null;
    this._bottomMaterial.dispose();
    this._sideMaterial.map = null;
    this._sideMaterial.dispose();

    // 3. Dispose owned textures
    this._releaseTopTexture();
    this._emptyOutline.geometry.dispose();
    (this._emptyOutline.material as THREE.Material).dispose();
    this._badge?.material.map?.dispose();
    this._badge?.material.dispose();

    // 4. Remove children and clear
    this.remove(this._deckMesh);
    this.clear();

    logger.debug('DeckObject3D disposed', { id: this.deckId });
  }
}
