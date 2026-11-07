/**
 * HandZoneObject3D.ts — 3D Representation of a Player's Private Hand Zone (M1.5.0)
 * Visual container that arranges, holds, and manages cards in a flat overlapping
 * horizontal row (M1.7.7.1).
 *
 * Presentation (M1.7.7.1):
 *   NORMAL — every card lies flat on one plane, overlapping row, adaptive spacing
 *   HOVER  — the pointed card only lifts slightly + scales 1.04 + gains render
 *            order. No stand-up pitch, no fan/spread, no pointer-driven rotation.
 *
 * The M1.7.3 fan/preview "stand cards upright" presentation was removed in
 * M1.7.7.1 because it fought the flat-row design and produced the old hover look
 * in the browser.
 */

import * as THREE from 'three';
import { CardObject3D } from './CardObject3D';
import { HAND_ZONE_CONFIG } from './HandZoneConfig';
import { Disposer } from '../utils/Disposer';
import type { CardSlotTransform } from '../animation/CardTransferAnimator';

export interface HandZoneObject3DOptions {
  id: string;
  playerIndex: number;
  x: number;
  z: number;
  rotationY: number;
  label: string;
  width?: number;
  depth?: number;
  isCardSelected?: (card: CardObject3D) => boolean;
  isCardHovered?: (card: CardObject3D) => boolean;
  isLocalPlayer?: boolean;
}

export class HandZoneObject3D extends THREE.Group {
  readonly zoneId: string;
  readonly playerIndex: number;
  readonly zoneWidth: number;
  readonly zoneDepth: number;

  private _label: string;
  private readonly _cards: CardObject3D[] = [];
  private _isHovered = false;
  private _isLocalPlayer = true;
  private _isCardSelectedCallback?: (card: CardObject3D) => boolean;
  private _isCardHoveredCallback?: (card: CardObject3D) => boolean;
  /** M1.7.8: fires whenever hand membership/order changes (not on layout). */
  private _onCardsChangedCallback?: (zone: HandZoneObject3D) => void;

  // Visual sub-objects
  private _borderLine: THREE.LineLoop | null = null;
  private _fillMesh: THREE.Mesh | null = null;
  private _labelSprite: THREE.Sprite | null = null;
  private _labelTexture: THREE.CanvasTexture | null = null;

  // Materials
  private readonly _borderMaterial: THREE.LineBasicMaterial;
  private readonly _fillMaterial: THREE.MeshBasicMaterial;

  // ─── M1.7.7.1: Flat hand row (no fan/preview state) ────────────────────────
  /** Effective spacing used in current layout — shared between arrangeCards & findCardByRay */
  private _currentSpacing = 0;
  // ──────────────────────────────────────────────────────────────────────────

  constructor(opts: HandZoneObject3DOptions) {
    super();
    this.name = `HandZoneObject3D_${opts.id}`;
    this.zoneId = opts.id;
    this.playerIndex = opts.playerIndex;
    this._label = opts.label;
    this.zoneWidth = opts.width ?? HAND_ZONE_CONFIG.DEFAULT_WIDTH;
    this.zoneDepth = opts.depth ?? HAND_ZONE_CONFIG.DEFAULT_DEPTH;
    this._isCardSelectedCallback = opts.isCardSelected;
    this._isCardHoveredCallback = opts.isCardHovered;
    this._isLocalPlayer = opts.isLocalPlayer ?? true;

    this.position.set(opts.x, HAND_ZONE_CONFIG.SURFACE_Y, opts.z);
    this.rotation.y = opts.rotationY;

    this._borderMaterial = new THREE.LineBasicMaterial({
      color: HAND_ZONE_CONFIG.BORDER_COLOR, transparent: true, opacity: HAND_ZONE_CONFIG.BORDER_OPACITY, depthWrite: false,
    });
    this._fillMaterial = new THREE.MeshBasicMaterial({
      color: HAND_ZONE_CONFIG.FILL_COLOR, transparent: true, opacity: HAND_ZONE_CONFIG.FILL_OPACITY, side: THREE.DoubleSide, depthWrite: false,
    });

    this._buildBorder();
    this._buildFillPlane();
    this._buildLabel();
  }

  // ─── Visual Construction ──────────────────────────────────────────────────

  private _buildBorder(): void {
    const hw = this.zoneWidth / 2;
    const hd = this.zoneDepth / 2;
    const pts = new Float32Array([
      -hw, 0, -hd,
       hw, 0, -hd,
       hw, 0,  hd,
      -hw, 0,  hd,
    ]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this._borderLine = new THREE.LineLoop(geom, this._borderMaterial);
    this._borderLine.renderOrder = 2;
    this.add(this._borderLine);
  }

  private _buildFillPlane(): void {
    const geom = new THREE.PlaneGeometry(this.zoneWidth, this.zoneDepth);
    geom.rotateX(-Math.PI / 2);
    this._fillMesh = new THREE.Mesh(geom, this._fillMaterial);
    this._fillMesh.position.y = 0.0005;
    this._fillMesh.renderOrder = 1;
    this.add(this._fillMesh);
  }

  /**
   * Build or rebuild the label sprite. In test environments (e.g., JSDOM) the
   * Canvas 2D context may be absent, so we guard against that.
   */
  private _buildLabel(): void {
    // Guard for headless test environments where `document` is undefined.
    if (typeof document === 'undefined') {
      return;
    }

    if (this._labelSprite) {
      this.remove(this._labelSprite);
      this._labelSprite = null;
    }
    if (this._labelTexture) {
      this._labelTexture.dispose();
      this._labelTexture = null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    // @ts-ignore – getContext may be undefined in some test environments.
    const ctx = canvas.getContext?.('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = HAND_ZONE_CONFIG.LABEL_BG_COLOR;
      ctx.beginPath();
      ctx.roundRect(16, 16, canvas.width - 32, canvas.height - 32, 16);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 36px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = HAND_ZONE_CONFIG.LABEL_TEXT_COLOR;
      const countText = `${this._cards.length} lá`;
      ctx.fillText(`${this._label} • ${countText}`, canvas.width / 2, canvas.height / 2);
    }

    this._labelTexture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: this._labelTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this._labelSprite = new THREE.Sprite(spriteMat);
    this._labelSprite.position.set(0, HAND_ZONE_CONFIG.LABEL_Y, this.zoneDepth / 2 + 0.45);
    this._labelSprite.scale.set(3.2, 0.8, 1);
    this._labelSprite.renderOrder = 5;
    this.add(this._labelSprite);
  }

  // ─── Card Management ──────────────────────────────────────────────────────

  addCard(card: CardObject3D, atIndex?: number): void {
    const existingIdx = this._cards.indexOf(card);
    if (existingIdx !== -1) this._cards.splice(existingIdx, 1);
    if (atIndex !== undefined && atIndex >= 0 && atIndex <= this._cards.length) {
      this._cards.splice(atIndex, 0, card);
    } else {
      this._cards.push(card);
    }
    card.setHandZoneId(this.zoneId);
    card.setStackId(null);
    this._buildLabel();
    this.arrangeCards();
    this._notifyCardsChanged();
  }

  removeCard(cardId: string): CardObject3D | null {
    const idx = this._cards.findIndex((c) => c.cardId === cardId);
    if (idx === -1) return null;
    const [removed] = this._cards.splice(idx, 1);
    if (removed) removed.setHandZoneId(null);
    this._buildLabel();
    this.arrangeCards();
    this._notifyCardsChanged();
    return removed ?? null;
  }

  moveCard(cardId: string, toIndex: number): void {
    const idx = this._cards.findIndex((c) => c.cardId === cardId);
    if (idx === -1) return;
    const [card] = this._cards.splice(idx, 1);
    if (!card) return;
    const targetIdx = Math.max(0, Math.min(this._cards.length, toIndex));
    this._cards.splice(targetIdx, 0, card);
    this.arrangeCards();
    this._notifyCardsChanged();
  }

  reorderCards(cardIds: string[]): void {
    const cardMap = new Map<string, CardObject3D>();
    for (const c of this._cards) {
      cardMap.set(c.cardId, c);
    }

    const reordered: CardObject3D[] = [];
    for (const id of cardIds) {
      const card = cardMap.get(id);
      if (card) {
        reordered.push(card);
        cardMap.delete(id);
      }
    }
    // Append any cards not mentioned in cardIds
    for (const remaining of cardMap.values()) {
      reordered.push(remaining);
    }

    this._cards.length = 0;
    this._cards.push(...reordered);
    this.arrangeCards();
    this._notifyCardsChanged();
  }

  getCards(): CardObject3D[] { return [...this._cards]; }
  getCardIds(): string[] { return this._cards.map((c) => c.cardId); }
  getCardCount(): number { return this._cards.length; }
  hasCard(cardId: string): boolean { return this._cards.some((c) => c.cardId === cardId); }
  getCard(cardId: string): CardObject3D | undefined { return this._cards.find((c) => c.cardId === cardId); }
  getCardIndex(cardId: string): number { return this._cards.findIndex((c) => c.cardId === cardId); }

  clearCards(): void {
    for (const card of this._cards) card.setHandZoneId(null);
    this._cards.length = 0;
    this._buildLabel();
    this._notifyCardsChanged();
  }

  setSelectionCallback(cb?: (card: CardObject3D) => boolean): void { this._isCardSelectedCallback = cb; }
  setHoverCallback(cb?: (card: CardObject3D) => boolean): void { this._isCardHoveredCallback = cb; }

  /** M1.7.8: subscribe to hand membership/order changes. */
  setCardsChangedCallback(cb?: (zone: HandZoneObject3D) => void): void {
    this._onCardsChangedCallback = cb;
  }

  private _notifyCardsChanged(): void {
    this._onCardsChangedCallback?.(this);
  }

  // ─── Spatial Math & Layout ────────────────────────────────────────────────

  containsPoint(worldX: number, worldZ: number, tolerance = 0): boolean {
    const dx = worldX - this.position.x;
    const dz = worldZ - this.position.z;
    const rotY = this.rotation.y;
    const cos = Math.cos(-rotY);
    const sin = Math.sin(-rotY);

    const locX = dx * cos + dz * sin;
    const locZ = -dx * sin + dz * cos;

    return (
      Math.abs(locX) <= this.zoneWidth / 2 + tolerance &&
      Math.abs(locZ) <= this.zoneDepth / 2 + tolerance
    );
  }

  findInsertionIndex(worldX: number, worldZ: number): number {
    const N = this._cards.length;
    if (N === 0) return 0;

    const dx = worldX - this.position.x;
    const dz = worldZ - this.position.z;
    const rotY = this.rotation.y;
    const cos = Math.cos(-rotY);
    const sin = Math.sin(-rotY);
    const locX = dx * cos + dz * sin;

    const cardWidth = this._cards[0]?.cardWidth ?? 2.5;
    const spacing = this._computeFlatSpacing(N, cardWidth);
    const totalSpan = (N - 1) * spacing;

    for (let i = 0; i < N; i++) {
      const cardLocX = -totalSpan / 2 + i * spacing;
      if (locX < cardLocX) {
        return i;
      }
    }
    return N;
  }

  /**
   * Computes the single flat-row spacing for N cards (M1.7.7.1).
   *
   * Spacing depends on the real card width, the card count and the usable hand
   * width — never on a single hard-coded distance:
   *   1–3 cards   → natural width + small gap (little or no overlap)
   *   4–6 cards   → light overlap  (62% of card width)
   *   7–10 cards  → medium overlap (48% of card width)
   *   11+ cards   → heavy overlap  (34% of card width)
   * The result is always clamped so the whole row fits inside the hand zone.
   */
  private _computeFlatSpacing(N: number, cardWidth: number): number {
    if (N <= 1) return 0;
    const usableWidth = Math.max(
      0,
      this.zoneWidth - cardWidth - HAND_ZONE_CONFIG.HAND_MARGIN * 2
    );
    const maxFitSpacing = usableWidth / (N - 1);

    let desired: number;
    if (N <= 3) {
      desired = cardWidth + HAND_ZONE_CONFIG.NATURAL_GAP;
    } else if (N <= 6) {
      desired = cardWidth * HAND_ZONE_CONFIG.SPACING_RATIO_LIGHT;
    } else if (N <= 10) {
      desired = cardWidth * HAND_ZONE_CONFIG.SPACING_RATIO_MEDIUM;
    } else {
      desired = cardWidth * HAND_ZONE_CONFIG.SPACING_RATIO_HEAVY;
    }

    return Math.min(desired, maxFitSpacing);
  }

  arrangeCards(): void {
    const N = this._cards.length;
    if (N === 0) return;

    const cardWidth = this._cards[0]?.cardWidth ?? 2.5;
    // Single authoritative spacing for layout AND hit-testing.
    this._currentSpacing = this._computeFlatSpacing(N, cardWidth);

    for (let i = 0; i < N; i++) {
      const card = this._cards[i]!;
      // M1.7.4: a transfer animator/drag owns this transform.
      if (card.isLayoutControlled()) continue;
      this._applySlot(card, this._computeSlot(i, N, cardWidth, card));
    }
  }

  /**
   * Computes the exact final slot for a card currently in this hand.
   * Used to guarantee the transfer animation lands on the same transform that
   * `arrangeCards()` would produce after commit.
   */
  getCardSlotTransform(card: CardObject3D): CardSlotTransform {
    const index = this._cards.indexOf(card);
    if (index < 0) {
      return this.computeIncomingSlotTransform(card, this._cards.length);
    }
    const N = this._cards.length;
    const cardWidth = this._cards[0]?.cardWidth ?? card.cardWidth;
    return this._computeSlot(index, N, cardWidth, card);
  }

  /**
   * Computes the slot a card will occupy once inserted at `index`, *including*
   * the incoming card in the layout count. Does not mutate card order.
   */
  computeIncomingSlotTransform(card: CardObject3D, index: number): CardSlotTransform {
    const N = this._cards.length + 1;
    const safeIndex = Math.max(0, Math.min(this._cards.length, index));
    const cardWidth = this._cards[0]?.cardWidth ?? card.cardWidth;
    return this._computeSlot(safeIndex, N, cardWidth, card);
  }

  /** Shared flat-row math used by arrangeCards() and transfer animation. */
  private _computeSlot(
    index: number,
    total: number,
    cardWidth: number,
    card: CardObject3D
  ): CardSlotTransform {
    const N = total;
    const spacing = this._computeFlatSpacing(N, cardWidth);
    const totalSpan = (N - 1) * spacing;
    // M1.7.7.1: all cards share one horizontal plane — no fan offset in Z.
    const locX = N > 1 ? -totalSpan / 2 + index * spacing : 0;

    const isSelected = this._isCardSelectedCallback ? this._isCardSelectedCallback(card) : false;
    // M1.7.6: HOVER presentation is only legal while this zone still owns the
    // card. The global hovered-card callback alone is not authoritative — a
    // card removed from the hand must never keep the hand lift/scale/layer.
    const isHovered =
      this._isCardHoveredCallback !== undefined &&
      card.getHandZoneId() === this.zoneId &&
      this._isCardHoveredCallback(card);

    const baseElevation =
      HAND_ZONE_CONFIG.SURFACE_Y +
      (index * HAND_ZONE_CONFIG.ELEVATION_STEP) +
      (isSelected ? HAND_ZONE_CONFIG.SELECTED_ELEVATION : 0);

    const cosRot = Math.cos(this.rotation.y);
    const sinRot = Math.sin(this.rotation.y);

    const worldX = this.position.x + locX * cosRot;
    const worldZ = this.position.z - locX * sinRot;

    // M1.7.7.1: the only hand presentation is flat. Selection may lift the card
    // a little; hover (local player only) adds a subtle Y lift + tiny scale +
    // render-order bump. Rotation is never changed by hover.
    let elevation = baseElevation;
    let scale = 1;
    let layerIndex =
      HAND_ZONE_CONFIG.BASE_LAYER_INDEX +
      index +
      (isSelected ? HAND_ZONE_CONFIG.SELECTION_LAYER_OFFSET : 0);

    if (isHovered && this._isLocalPlayer) {
      elevation = baseElevation + (isSelected ? 0 : HAND_ZONE_CONFIG.HOVER_LIFT_Y);
      scale = HAND_ZONE_CONFIG.HOVER_SCALE;
      layerIndex =
        HAND_ZONE_CONFIG.BASE_LAYER_INDEX +
        index +
        (isSelected
          ? HAND_ZONE_CONFIG.SELECTION_LAYER_OFFSET
          : HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET);
    }

    // Only the hand-zone Y rotation is applied; pitch/roll stay at 0 (flat card).
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, this.rotation.y, 0, 'YXZ')
    );

    return {
      position: new THREE.Vector3(worldX, elevation, worldZ),
      quaternion,
      scale: new THREE.Vector3(scale, scale, scale),
      layerIndex,
    };
  }

  private _applySlot(card: CardObject3D, slot: CardSlotTransform): void {
    card.position.copy(slot.position);
    card.rotation.order = 'YXZ';
    card.quaternion.copy(slot.quaternion);
    // Quaternion decomposition can yield -0 for flat cards; normalize so callers
    // that compare Euler components strictly (e.g. rotation.x === 0) see +0.
    card.rotation.x += 0;
    card.rotation.y += 0;
    card.rotation.z += 0;
    card.scale.copy(slot.scale);
    if (slot.layerIndex !== undefined) {
      card.setLayerIndex(slot.layerIndex);
    }
  }

  /**
   * M1.7.2 Fix C: Deterministic partition-based raycasting for overlapping cards in hand.
   * Gives every card a guaranteed hit-test interval regardless of overlap.
   * M1.7.7.1: uses the same flat-row spacing as arrangeCards().
   */
  findCardByRay(raycaster: THREE.Raycaster): CardObject3D | null {
    const N = this._cards.length;
    if (N === 0) return null;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.position.y);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;

    const dx = hit.x - this.position.x;
    const dz = hit.z - this.position.z;
    const rotY = this.rotation.y;
    const cos = Math.cos(-rotY);
    const sin = Math.sin(-rotY);
    const locX = dx * cos + dz * sin;
    const locZ = -dx * sin + dz * cos;

    const cardWidth = this._cards[0]?.cardWidth ?? 2.5;
    const cardHeight = this._cards[0]?.cardHeight ?? 3.5;

    // Cards are always flat on one plane, so the tolerance is constant.
    const zTolerance = cardHeight / 2 + 0.4;
    if (Math.abs(locZ) > zTolerance) return null;

    if (N === 1) {
      return Math.abs(locX) <= cardWidth / 2 ? this._cards[0]! : null;
    }

    const spacing =
      this._currentSpacing > 0 ? this._currentSpacing : this._computeFlatSpacing(N, cardWidth);

    const totalSpan = (N - 1) * spacing;

    const firstLeft = -totalSpan / 2 - cardWidth / 2;
    const lastRight = totalSpan / 2 + cardWidth / 2;
    if (locX < firstLeft || locX > lastRight) return null;

    for (let i = 0; i < N - 1; i++) {
      const nextCardLocX = -totalSpan / 2 + (i + 1) * spacing;
      const nextCardLeft = nextCardLocX - cardWidth / 2;
      if (locX < nextCardLeft) {
        return this._cards[i]!;
      }
    }
    return this._cards[N - 1]!;
  }

  setLocalPlayer(isLocalPlayer: boolean): void {
    if (this._isLocalPlayer === isLocalPlayer) return;
    this._isLocalPlayer = isLocalPlayer;
    this.arrangeCards();
  }

  setHovered(hovered: boolean): void {
    if (this._isHovered === hovered) return;
    this._isHovered = hovered;
    this._borderMaterial.opacity = hovered ? HAND_ZONE_CONFIG.BORDER_HOVER_OPACITY : HAND_ZONE_CONFIG.BORDER_OPACITY;
    this._borderMaterial.color.setHex(hovered ? HAND_ZONE_CONFIG.BORDER_HOVER_COLOR : HAND_ZONE_CONFIG.BORDER_COLOR);
    this._fillMaterial.opacity = hovered ? HAND_ZONE_CONFIG.FILL_HOVER_OPACITY : HAND_ZONE_CONFIG.FILL_OPACITY;
    this._borderMaterial.needsUpdate = true;
    this._fillMaterial.needsUpdate = true;
  }

  isHovered(): boolean { return this._isHovered; }

  dispose(): void {
    Disposer.disposeObject3D(this);
    this._cards.length = 0;
  }
}
