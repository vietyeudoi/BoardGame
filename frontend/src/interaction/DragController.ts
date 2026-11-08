import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { INTERACTION_CONFIG, clampTablePosition } from './InteractionConfig';
import type { TableShapeParams } from '../objects/TableShapeConfig';
import type { RaycastInteractionManager } from './RaycastInteractionManager';
import type { CameraController } from '../scene/CameraController';
import { Logger } from '../utils/Logger';

const HAND_DRAG_TURN_MS = 150;
const logger = Logger.create('DragController');

// ─── Internal Types ───────────────────────────────────────────────────────────

/** Stored emissive state for a single material, used to restore after drag ends. */
interface StoredEmissive {
  color: THREE.Color;
  intensity: number;
}

/** Pre-drag transform captured when a pointer grabs a card (M1.7.4). */
export interface DragOrigin {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

// ─── DragController ───────────────────────────────────────────────────────────

export class DragController {
  // The primary card being dragged (null when no drag active)
  private _draggedCard: CardObject3D | null = null;

  // Group movement: followers and their relative offsets to the primary dragged card
  private readonly _groupOffsets = new Map<CardObject3D, { offsetX: number; offsetZ: number }>();

  // Whether a drag threshold has been crossed (mousedown → actual movement)
  private _dragActive = false;

  // Pointer coordinates where mousedown occurred on a card
  private _pointerDownClientX = 0;
  private _pointerDownClientY = 0;

  // ── Reusable math objects (no per-frame allocation) ──────────────────────
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  // Plane normal = (0, 1, 0) upward; constant set in constructor
  private readonly _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _intersectPoint = new THREE.Vector3();
  private readonly _prevIntersectPoint = new THREE.Vector3();

  // Offset from card origin to pick point so card doesn't "jump" on drag start
  private readonly _pickOffset = new THREE.Vector3();

  // Emissive backup during drag (keyed by material uuid)
  private readonly _dragEmissiveBackup = new Map<string, StoredEmissive>();

  // M1.7.4.1: hand cards whose `layoutControlled` flag this drag claimed. Only
  // these may be released on cleanup; transfers claim the flag independently.
  private readonly _layoutClaimedCards = new Set<CardObject3D>();

  // Pre-drag transform of the primary card (M1.7.4). Kept until the next grab
  // so a server rejection can restore the exact authoritative transform.
  private _dragOrigin: DragOrigin | null = null;
  private _dragOriginCardId: string | null = null;

  // AbortController for window-level listeners during an active drag
  private _dragAbortController: AbortController | null = null;

  // M1.7.10: last known pointer position. The fan preview boundary rule needs
  // to know where the gesture ended, not which 3D object was hovered before
  // the drag started (hover updates are suppressed while a drag is active).
  private _lastPointerClientX: number | null = null;
  private _lastPointerClientY: number | null = null;

  // AbortController for permanent listeners (domElement)
  private readonly _permanentAbortController = new AbortController();

  /**
   * Optional callback invoked when a card or group of cards is dropped onto the table.
   * Can be hooked by SceneManager to handle stacking on drop.
   */
  public onCardDropped: ((card: CardObject3D, isGroup?: boolean, followers?: CardObject3D[]) => void) | null = null;

  /**
   * Optional callback invoked during drag move to query and display drop targets (M1.3.4.3).
   */
  public onQueryDropTarget: ((card: CardObject3D) => void) | null = null;

  /**
   * Optional callback invoked when a drag is cancelled.
   */
  public onDragCancel: (() => void) | null = null;

  /**
   * Optional callback invoked once a real drag becomes active (M1.7.8).
   * Used by the screen-space hand fan preview to close immediately.
   */
  getSeatDragYaw?: () => number;
  private _handDragYaw: number | undefined;
  private _orientationFrame: number | null = null;
  private readonly _orientationTarget = new THREE.Quaternion();

  getDropYaw(card: CardObject3D): number | undefined {
    return this._handDragYaw === undefined || !this.getDraggedCards().includes(card) ? undefined : card.getRotationY();
  }

  rotateDrag(delta: number): boolean {
    if (!this._dragActive) return false;
    this._cancelOrientationFrame();
    if (this._handDragYaw !== undefined) this._handDragYaw += delta;
    for (const card of this.getDraggedCards()) {
      const yaw = this._handDragYaw ?? (card.getRotationY() + delta);
      card.rotation.set(0, Math.atan2(Math.sin(yaw), Math.cos(yaw)), 0, "YXZ");
    }
    this.onDragPreviewMove?.();
    this._requestRender();
    return true;
  }

  private _cancelOrientationFrame(): void {
    if (this._orientationFrame !== null) cancelAnimationFrame(this._orientationFrame);
    this._orientationFrame = null;
  }

  public onDragPreviewStart?: () => void;
  public onDragPreviewMove?: () => void;
  public onDragPreviewStop?: () => void;
  private readonly _followerOrigins = new Map<CardObject3D, DragOrigin>();

  getDraggedCards(): CardObject3D[] {
    return this._draggedCard ? [this._draggedCard, ...this._groupOffsets.keys()] : [];
  }

  public onDragStarted: ((card: CardObject3D) => void) | null = null;

  /**
   * Optional callback invoked when drag starts — for broadcasting to server (M1.5.3).
   */
  public onDragStartBroadcast: ((objectId: string, pos: { x: number; y: number; z: number }) => void) | null = null;

  /**
   * Optional callback invoked during drag move — for broadcasting to server, throttled (M1.5.3).
   */
  public onDragMoveBroadcast: ((objectId: string, pos: { x: number; y: number; z: number }) => void) | null = null;

  /**
   * Optional callback invoked when drag ends — for broadcasting final position (M1.5.3, M1.5.3.1, M1.5.4).
   * M1.7.5 Part 2: carries the card's table yaw so HAND→TABLE seat orientation
   * (and any manual yaw) is stored authoritatively and visible to every client.
   */
  public onDragEndBroadcast: ((objectId: string, pos: { x: number; y: number; z: number }, faceUp?: boolean, targetPlayerIndex?: number | null, rotation?: number) => void) | null = null;

  /**
   * Optional validator to check if a card can be dragged by local player (M1.5.4).
   */
  public canDragCard: ((card: CardObject3D) => boolean) | null = null;

  /**
   * Optional callback to resolve drop target player index for hand transfers (M1.5.4).
   */
  public getDropTargetPlayerIndex: ((card: CardObject3D) => number | null | undefined) | null = null;

  /**
   * Optional suppression hook (M1.7.4). Returning false prevents the duplicate
   * `object:drag-end` broadcast when an explicit `card:transfer` request already
   * owns the authoritative network path for this drop.
   */
  public shouldBroadcastDragEnd: ((objectId: string) => boolean) | null = null;

  /**
   * Optional guard (M1.7.4.1). A dragged hand card owns `layoutControlled` while
   * the pointer drives it. On cleanup the drag may only release that ownership
   * when no pending/animating transfer has taken over the card. Returning false
   * keeps the card controlled (the transfer/animator is the new single writer).
   */
  public shouldReleaseLayoutControl: ((card: CardObject3D) => boolean) | null = null;

  /**
   * Optional notification (M1.7.4.1) fired after drag-owned layout control has
   * been released, so SceneManager can restore authoritative hand slots. Pending
   * transfers stay controlled and are therefore skipped by the layout pass.
   */
  public onDragFinished: (() => void) | null = null;
  /** Giao phần hạ/trả bài cho animator sau khi xử lý drop và nhả layout. */
  public onDragSettled: ((card: CardObject3D, start: DragOrigin) => void) | null = null;

  /**
   * Optional callback to retrieve active table shape parameters for dynamic containment clamping.
   */
  public getTableShapeParams: (() => TableShapeParams) | null = null;

  constructor(
    private readonly _camera: THREE.PerspectiveCamera,
    private readonly _domElement: HTMLElement,
    private readonly _interactionManager: RaycastInteractionManager,
    private readonly _cameraController: CameraController,
    private readonly _requestRender: () => void
  ) {
    this._raycaster.near = INTERACTION_CONFIG.RAYCASTER_NEAR;
    this._raycaster.far = INTERACTION_CONFIG.RAYCASTER_FAR;

    // Set drag plane constant: Plane equation is dot(n, p) + d = 0
    // n = (0,1,0), p.y + d = 0 → d = -planeY
    const planeY = TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y;
    this._dragPlane.constant = -planeY;

    // Wire into RaycastInteractionManager — fires when left-mousedown hits a CardObject3D
    this._interactionManager.onCardMouseDown = (card: CardObject3D, event: MouseEvent) => {
      this._onCardPointerDown(card, event);
    };

    // Chuyển từ canvas sang fan vẫn thuộc cùng thao tác; chỉ hủy khi rời cửa sổ.
    this._domElement.addEventListener(
      'mouseleave',
      (event: MouseEvent) => { if (!event.relatedTarget) this.cancelDrag(); },
      { signal: this._permanentAbortController.signal }
    );

    logger.info('DragController initialized');
  }

  // ─── Public State Accessors ───────────────────────────────────────────────

  isDragging(): boolean {
    return this._dragActive;
  }

  getDraggedCard(): CardObject3D | null {
    return this._draggedCard;
  }

  getGroupCards(): CardObject3D[] {
    return Array.from(this._groupOffsets.keys());
  }

  /**
   * M1.7.10: last pointer position seen by the gesture. Used after a drag ends
   * to evaluate the local-hand fan boundary against the real cursor location.
   */
  getLastPointerPosition(): { clientX: number; clientY: number } | null {
    if (this._lastPointerClientX === null || this._lastPointerClientY === null) return null;
    return { clientX: this._lastPointerClientX, clientY: this._lastPointerClientY };
  }

  /**
   * Public cancel entry point.
   * Called by: mouseleave on canvas, window blur, pointercancel, or external code.
   * Safe to call even when no drag is active.
   */
  cancelDrag(): void {
    this._cancelDrag();
  }

  /** Pre-drag transform captured on the last card grab (M1.7.4). */
  getDragOrigin(): DragOrigin | null {
    return this._dragOrigin;
  }

  /** Card ID that owns the captured drag origin, if any. */
  getDragOriginCardId(): string | null {
    return this._dragOriginCardId;
  }

  /**
   * Aborts the active drag without broadcasting a drag-end event (M1.7.4).
   * Used when the backend rejects an unauthorized interaction. When
   * `restoreTransform` is true the card is snapped back to the transform it had
   * when the drag began.
   */
  abortDrag(restoreTransform = false): void {
    const card = this._draggedCard;
    if (!card) {
      this._cleanup();
      return;
    }

    if (
      restoreTransform &&
      this._dragOrigin &&
      this._dragOriginCardId === card.cardId
    ) {
      card.position.copy(this._dragOrigin.position);
      card.rotation.copy(this._dragOrigin.rotation);
      card.scale.copy(this._dragOrigin.scale);
    }

    if (restoreTransform) {
      for (const [follower, origin] of this._followerOrigins) {
        follower.position.copy(origin.position);
        follower.rotation.copy(origin.rotation);
        follower.scale.copy(origin.scale);
      }
    }
    this.onDragCancel?.();
    this._removeDragHighlights();
    this._requestRender();
    this._cleanup();
    logger.debug('Drag aborted after server rejection', { id: card.cardId });
  }

  /**
   * Public drag entry point used by the screen-space Full Hand Fan Preview
   * (M1.7.9 Part B). Reuses the exact canvas card-drag pipeline (threshold,
   * drag plane, pickup offset, layout control, drop handlers) on the real card,
   * so a drag started from the fan behaves identically to one from the 3D hand.
   */
  beginDrag(card: CardObject3D, event: MouseEvent): void {
    this._onCardPointerDown(card, event);
  }

  /** Giữ điểm cầm khi chuyển từ fan 2D sang mặt phẳng kéo 3D. */
  beginPreviewDrag(card: CardObject3D, event: MouseEvent, offset: { x: number; y: number }): void {
    this._onCardPointerDown(card, event);
    if (this._draggedCard !== card) return;
    this._updateNDC(event.clientX - offset.x, event.clientY - offset.y);
    this._raycaster.setFromCamera(this._ndc, this._camera);
    const center = this._raycaster.ray.intersectPlane(this._dragPlane, new THREE.Vector3());
    if (!center) return;
    this._pickOffset.copy(this._prevIntersectPoint).sub(center);
    this._activateDrag();
    this._moveGroupTo(center.x, center.z);
    this.onQueryDropTarget?.(card);
    this.onDragPreviewMove?.();
    this._requestRender();
  }

  // ─── Drag Start (triggered by RaycastInteractionManager callback) ─────────

  private _onCardPointerDown(card: CardObject3D, event: MouseEvent): void {
    // Only handle primary left-click; ignore shift+click (pan modifier) or other buttons
    if (event.button !== 0 || event.shiftKey) return;

    this._lastPointerClientX = event.clientX;
    this._lastPointerClientY = event.clientY;

    // Check if card can be dragged by local player (M1.5.4 Hand Privacy / Ownership)
    if (this.canDragCard && !this.canDragCard(card)) return;

    // Record the primary drag candidate (threshold not yet crossed)
    this._draggedCard = card;
    this._groupOffsets.clear();

    // M1.7.4: capture the pre-drag transform so a rejected interaction can be
    // restored without relying on the (possibly mutated) hand layout.
    this._dragOrigin = {
      position: card.position.clone(),
      rotation: card.rotation.clone(),
      scale: card.scale.clone(),
    };
    this._dragOriginCardId = card.cardId;

    // Check if this card is part of a multi-selection
    const selectedCards = this._interactionManager.getSelectedCards();
    if (selectedCards.length > 1 && selectedCards.some((c) => c.cardId === card.cardId)) {
      for (const selCard of selectedCards) {
        if (selCard.cardId !== card.cardId) {
          if (this.canDragCard && !this.canDragCard(selCard)) continue;
          this._followerOrigins.set(selCard, this._captureTransform(selCard));
          this._groupOffsets.set(selCard, {
            offsetX: selCard.position.x - card.position.x,
            offsetZ: selCard.position.z - card.position.z,
          });
        }
      }
    }

    this._dragActive = false;
    this._pointerDownClientX = event.clientX;
    this._pointerDownClientY = event.clientY;

    // NOTE: Do NOT set isDragActive = true here.
    // isDragActive is only set true in _activateDrag() when movement threshold is crossed.
    // Setting it here would suppress _processClick in RaycastInteractionManager._onMouseUp
    // for ALL card clicks, even simple clicks that never move (BUG 1 root cause).

    // Immediately suppress camera orbit so it doesn't start on this mousedown
    this._cameraController.setSuppressOrbit(true);

    // Pre-compute pick offset so the card doesn't jump on first move:
    this._updateNDC(event.clientX, event.clientY);
    this._raycaster.setFromCamera(this._ndc, this._camera);
    const planeHit = this._raycaster.ray.intersectPlane(this._dragPlane, this._intersectPoint);

    if (planeHit) {
      // XZ offset only — Y is fixed at DRAG_LIFT_Y height during the drag
      this._pickOffset.set(
        this._intersectPoint.x - card.position.x,
        0,
        this._intersectPoint.z - card.position.z
      );
      this._prevIntersectPoint.copy(this._intersectPoint);
    } else {
      this._pickOffset.set(0, 0, 0);
    }

    // Register global window listeners for the duration of this drag attempt
    this._registerDragListeners();

    logger.debug('Card pointer down', { id: card.cardId, groupCount: this._groupOffsets.size });
  }

  // ─── Drag Move ────────────────────────────────────────────────────

  private _onMouseMove(event: MouseEvent): void {
    this._lastPointerClientX = event.clientX;
    this._lastPointerClientY = event.clientY;
    if (!this._draggedCard) return;

    const dx = event.clientX - this._pointerDownClientX;
    const dy = event.clientY - this._pointerDownClientY;
    const displacement = Math.sqrt(dx * dx + dy * dy);

    // Activate drag once movement threshold is crossed
    if (!this._dragActive) {
      if (displacement < INTERACTION_CONFIG.DRAG_START_THRESHOLD_PX) return;
      this._activateDrag();
    }

    // Cast ray from camera through current pointer position against drag plane
    this._updateNDC(event.clientX, event.clientY);
    this._raycaster.setFromCamera(this._ndc, this._camera);

    const planeHit = this._raycaster.ray.intersectPlane(this._dragPlane, this._intersectPoint);
    if (!planeHit) return;

    // Skip render if position hasn't meaningfully changed
    if (
      Math.abs(this._intersectPoint.x - this._prevIntersectPoint.x) < 1e-6 &&
      Math.abs(this._intersectPoint.z - this._prevIntersectPoint.z) < 1e-6
    ) return;
    this._prevIntersectPoint.copy(this._intersectPoint);

    // Subtract pick offset so card origin tracks under the cursor without jumping
    const targetX = this._intersectPoint.x - this._pickOffset.x;
    const targetZ = this._intersectPoint.z - this._pickOffset.z;

    this._moveGroupTo(targetX, targetZ);

    // M1.3.4.3: Query drop target preview candidate
    this.onQueryDropTarget?.(this._draggedCard);
    this.onDragPreviewMove?.();

    // M1.5.3 / M1.7.4.1: only table cards have broadcastable drag positions —
    // hand transforms stay private and are never sent to peers.
    if (!this._draggedCard.isInHand()) {
      this.onDragMoveBroadcast?.(this._draggedCard.cardId, {
        x: this._draggedCard.position.x,
        y: this._draggedCard.position.y,
        z: this._draggedCard.position.z,
      });
    }

    this._requestRender();
  }

  // ─── Drag End (mouse button released) ────────────────────────────────────

  private _moveGroupTo(targetX: number, targetZ: number): void {
    const leader = this._draggedCard;
    if (!leader) return;
    // Table boundary clamp for the primary card
    const shapeParams = this.getTableShapeParams ? this.getTableShapeParams() : undefined;
    const clampedLeader = clampTablePosition(
      targetX,
      targetZ,
      leader.getRotationY(),
      leader.cardWidth,
      leader.cardHeight,
      shapeParams
    );

    // If dragging a group, calculate shift delta and ensure all group members stay bounded
    let finalLeaderX = clampedLeader.x;
    let finalLeaderZ = clampedLeader.z;

    if (this._groupOffsets.size > 0) {
      // Test follower bounds and adjust leader if needed
      for (const [follower, offset] of this._groupOffsets.entries()) {
        const followerTargetX = finalLeaderX + offset.offsetX;
        const followerTargetZ = finalLeaderZ + offset.offsetZ;
        const clampedFollower = clampTablePosition(
          followerTargetX,
          followerTargetZ,
          follower.getRotationY(),
          follower.cardWidth,
          follower.cardHeight,
          shapeParams
        );
        const shiftX = clampedFollower.x - followerTargetX;
        const shiftZ = clampedFollower.z - followerTargetZ;
        finalLeaderX += shiftX;
        finalLeaderZ += shiftZ;
      }
    }

    // Position primary card at DRAG_LIFT_Y elevation
    leader.position.set(
      finalLeaderX,
      TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y,
      finalLeaderZ
    );

    // Position follower cards maintaining relative offsets
    for (const [follower, offset] of this._groupOffsets.entries()) {
      follower.position.set(
        finalLeaderX + offset.offsetX,
        TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y,
        finalLeaderZ + offset.offsetZ
      );
    }

  }

  private _onMouseUp(event?: MouseEvent): void {
    if (event) {
      this._lastPointerClientX = event.clientX;
      this._lastPointerClientY = event.clientY;
    }
    if (!this._draggedCard) {
      this._cleanup();
      return;
    }

    const settledCard = this._dragActive ? this._draggedCard : null;
    const settleStart = settledCard ? this._captureTransform(settledCard) : null;
    const followerStarts = settledCard ? Array.from(this._groupOffsets.keys(), card => [card, this._captureTransform(card)] as const) : [];
    if (this._dragActive) {
      const card = this._draggedCard;
      const followers = Array.from(this._groupOffsets.keys());
      const isGroup = followers.length > 0;

      this._removeDragHighlights();

      logger.debug('Card(s) dropped', {
        id: card.cardId,
        x: card.position.x,
        z: card.position.z,
        groupCount: followers.length,
      });

      // Invoke drop hook for stacking or arrangement before final Y normalization
      this.onCardDropped?.(card, isGroup, followers);

      // Normalise height for non-stacked and non-hand cards
      if (!card.isInStack() && !card.isInHand()) {
        card.position.y = TABLE_CONFIG.SURFACE_Y;
      }
      for (const follower of followers) {
        if (!follower.isInStack() && !follower.isInHand()) {
          follower.position.y = TABLE_CONFIG.SURFACE_Y;
        }
      }

      // M1.5.3 / M1.5.4 / M1.7.4: Broadcast drag end to multiplayer peers.
      // The suppression hook prevents a duplicate ownership path when an
      // explicit card:transfer request was already sent for this drop.
      this._broadcastDragEnd(card);
      for (const follower of followers) this._broadcastDragEnd(follower);

      this._requestRender();
    }

    this._cleanup();
    if (settledCard && settleStart) this.onDragSettled?.(settledCard, settleStart);
    for (const [follower, origin] of followerStarts) this.onDragSettled?.(follower, origin);
  }

  // ─── Cancel Drag (private implementation) ────────────────────────────────

  private _cancelDrag(): void {
    if (!this._draggedCard) {
      this._cleanup();
      return;
    }

    const settledCard = this._dragActive ? this._draggedCard : null;
    const settleStart = settledCard ? this._captureTransform(settledCard) : null;
    if (this._dragActive) {
      this.onDragCancel?.();
      // Reset Y to table surface if not in stack, keep last valid XZ
      if (!this._draggedCard.isInStack()) {
        this._draggedCard.position.y = TABLE_CONFIG.SURFACE_Y;
      }
      for (const [follower] of this._groupOffsets.entries()) {
        if (!follower.isInStack()) {
          follower.position.y = TABLE_CONFIG.SURFACE_Y;
        }
      }
      this._removeDragHighlights();
      // M1.5.3 / M1.7.4.1: a cancelled hand drag has no authoritative drop —
      // the hand slot is restored by layout once ownership is released, so never
      // send the pointer position as a drop. Table drags still broadcast.
      if (!this._draggedCard.isInHand()) {
        this._broadcastDragEnd(this._draggedCard);
      }
      this._requestRender();
      logger.debug('Drag cancelled', { id: this._draggedCard.cardId });
    }

    this._cleanup();
    if (settledCard && settleStart) this.onDragSettled?.(settledCard, settleStart);
  }

  private _captureTransform(card: CardObject3D): DragOrigin {
    return { position: card.position.clone(), rotation: card.rotation.clone(), scale: card.scale.clone() };
  }

  // ─── Activation & Cleanup Helpers ─────────────────────────────────────────

  private _activateDrag(): void {
    if (!this._draggedCard) return;
    this._dragActive = true;

    // Drag sở hữu con trỏ; SceneManager giữ fan mở cho tới khi kết thúc thao tác.
    this.onDragStarted?.(this._draggedCard);

    // M1.7.4.1: the drag becomes the single writer for its cards. Hand layout
    // (arrangeCards), fan-preview animation, selection re-arrange and incoming
    // room snapshots must not overwrite the pointer-driven transform.
    this._claimLayoutControl(this._draggedCard);
    for (const follower of this._groupOffsets.keys()) {
      this._claimLayoutControl(follower);
    }

    // Góc ghế được tính trong hệ bàn. Slerp chọn đường xoay ngắn nhất.
    if (this._draggedCard.isInHand()) {
      const cards = this.getDraggedCards();
      this._handDragYaw = this.getSeatDragYaw?.() ?? 0;
      const origins = cards.map(card => {
        card.rotation.reorder("YXZ");
        return card.quaternion.clone();
      });
      this._orientationTarget.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._handDragYaw);
      const started = performance.now();
      const advance = (now: number): void => {
        const t = Math.max(0, Math.min(1, (now - started) / HAND_DRAG_TURN_MS));
        cards.forEach((card, index) => card.quaternion.slerpQuaternions(origins[index]!, this._orientationTarget, 1 - (1 - t) ** 2));
        this.onDragPreviewMove?.();
        this._requestRender();
        this._orientationFrame = t < 1 ? requestAnimationFrame(advance) : null;
      };
      this._orientationFrame = requestAnimationFrame(advance);
      this._draggedCard.position.y = TABLE_CONFIG.SURFACE_Y + INTERACTION_CONFIG.DRAG_LIFT_Y;
    }

    // Signal to RaycastInteractionManager that an actual drag is in progress.
    // This suppresses click-selection in _onMouseUp for this mouse gesture only.
    this._interactionManager.isDragActive = true;

    // Apply drag highlight to primary card and all group followers
    this._applyDragHighlight(this._draggedCard);
    for (const [follower] of this._groupOffsets.entries()) {
      this._applyDragHighlight(follower);
    }

    this.onDragPreviewStart?.();
    this._requestRender();
    logger.debug('Drag activated', { id: this._draggedCard.cardId, groupCount: this._groupOffsets.size });

    // Tay bài đã dùng gói preview ẩn danh. Luồng cũ ở đây chỉ dành cho bài trên bàn.
    if (!this._draggedCard.isInHand()) {
      this.onDragStartBroadcast?.(this._draggedCard.cardId, {
        x: this._draggedCard.position.x,
        y: this._draggedCard.position.y,
        z: this._draggedCard.position.z,
      });
    }
  }

  /**
   * M1.7.4.1: Take exclusive layout ownership of a hand card for the duration of
   * the drag. Cards already controlled by a transfer are left untouched, and
   * table cards need no ownership (only hand/stacks re-write transforms).
   */
  private _claimLayoutControl(card: CardObject3D): void {
    if (!card.isInHand()) return;
    if (card.isLayoutControlled()) return;
    card.setLayoutControlled(true);
    this._layoutClaimedCards.add(card);
  }

  /**
   * M1.7.4.1: Release only the layout ownership this drag claimed. When a drop
   * already queued a pending transfer (or a transfer animation started), that
   * path owns the card and the flag must stay set.
   */
  private _releaseLayoutControl(): void {
    for (const card of this._layoutClaimedCards) {
      if (this.shouldReleaseLayoutControl && !this.shouldReleaseLayoutControl(card)) {
        continue;
      }
      card.setLayoutControlled(false);
    }
    this._layoutClaimedCards.clear();
  }

  /** Emits a drag-end broadcast unless SceneManager suppressed this drop. */
  private _broadcastDragEnd(card: CardObject3D): void {
    if (this.shouldBroadcastDragEnd && !this.shouldBroadcastDragEnd(card.cardId)) {
      return;
    }
    const targetPlayerIndex = this.getDropTargetPlayerIndex
      ? this.getDropTargetPlayerIndex(card)
      : undefined;
    this.onDragEndBroadcast?.(
      card.cardId,
      {
        x: card.position.x,
        y: card.position.y,
        z: card.position.z,
      },
      card.isFaceUp(),
      targetPlayerIndex,
      card.getRotationY()
    );
  }

  private _cleanup(): void {
    this._cancelOrientationFrame();
    this._handDragYaw = undefined;
    this._unregisterDragListeners();
    this._removeDragHighlights();

    // Re-enable camera orbit controls
    this._cameraController.setSuppressOrbit(false);

    // Release drag lock in RaycastInteractionManager
    this._interactionManager.isDragActive = false;

    // M1.7.4.1: hand out layout ownership before the layout settles. Transfers
    // that took over keep their own control, so the settle pass skips them.
    const hadDrag = this._dragActive;
    this._releaseLayoutControl();

    this._draggedCard = null;
    this._groupOffsets.clear();
    this._followerOrigins.clear();
    this._dragActive = false;

    // Bài từ TABLE cũng phải kết thúc phiên drag để hover HAND hoạt động lại.
    if (hadDrag) {
      this.onDragPreviewStop?.();
      this.onDragFinished?.();
    }
  }

  // ─── Event Listener Registration ─────────────────────────────────────────

  private _registerDragListeners(): void {
    this._unregisterDragListeners();
    this._dragAbortController = new AbortController();
    const signal = this._dragAbortController.signal;

    window.addEventListener(
      'mousemove',
      (e) => this._onMouseMove(e),
      { signal }
    );

    window.addEventListener(
      'mouseup',
      (e) => this._onMouseUp(e),
      { signal }
    );

    window.addEventListener(
      'blur',
      () => this.cancelDrag(),
      { signal }
    );
    window.addEventListener('pointercancel', () => this.cancelDrag(), { signal });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.cancelDrag();
    }, { signal });
  }

  private _unregisterDragListeners(): void {
    if (this._dragAbortController) {
      this._dragAbortController.abort();
      this._dragAbortController = null;
    }
  }

  // ─── NDC Calculation ─────────────────────────────────────────────────────

  private _updateNDC(clientX: number, clientY: number): void {
    const rect = this._domElement.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    this._ndc.x = ((clientX - rect.left) / w) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / h) * 2 + 1;
  }

  // ─── Emissive Highlight Helpers ───────────────────────────────────────────

  /** Applies drag emissive highlight to all MeshStandardMaterial in card mesh. */
  private _applyDragHighlight(card: CardObject3D): void {
    const mesh = card.getMesh();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (!this._dragEmissiveBackup.has(mat.uuid)) {
        this._dragEmissiveBackup.set(mat.uuid, {
          color: mat.emissive.clone(),
          intensity: mat.emissiveIntensity,
        });
      }
      mat.emissive.set(INTERACTION_CONFIG.DRAG_EMISSIVE_COLOR);
      mat.emissiveIntensity = INTERACTION_CONFIG.DRAG_EMISSIVE_INTENSITY;
    }
  }

  /** Restores original emissive values after drag ends or is cancelled. */
  private _removeDragHighlights(): void {
    const cardsToRestore: CardObject3D[] = [];
    if (this._draggedCard) cardsToRestore.push(this._draggedCard);
    for (const follower of this._groupOffsets.keys()) {
      cardsToRestore.push(follower);
    }

    for (const card of cardsToRestore) {
      const mesh = card.getMesh();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      for (const mat of materials) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        const stored = this._dragEmissiveBackup.get(mat.uuid);
        if (stored) {
          mat.emissive.copy(stored.color);
          mat.emissiveIntensity = stored.intensity;
          this._dragEmissiveBackup.delete(mat.uuid);
        }
      }
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  dispose(): void {
    // Teardown không khởi động thêm animation hay sắp xếp HAND đã bị dispose.
    this.onDragSettled = null;
    this.onDragFinished = null;
    this._cancelDrag();
    this._permanentAbortController.abort();
    this._interactionManager.onCardMouseDown = null;
    this.onCardDropped = null;
    this.shouldBroadcastDragEnd = null;
    this.shouldReleaseLayoutControl = null;
    this.onDragFinished = null;
    this.onDragSettled = null;
    this._dragOrigin = null;
    this._dragOriginCardId = null;
    this._dragEmissiveBackup.clear();
    this._layoutClaimedCards.clear();
    this._groupOffsets.clear();
    logger.info('DragController disposed');
  }
}
