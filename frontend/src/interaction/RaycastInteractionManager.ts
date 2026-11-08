/**
 * RaycastInteractionManager.ts — Hover & Selection Interaction System
 * Handles mouse-driven raycasting over CardObject3D and DeckObject3D instances
 * in the 3D tabletop sandbox scene.
 *
 * Design Principles (M1.3.1 / M1.3.2 / M1.3.4.3):
 * - Uses a single THREE.Raycaster; never creates a second renderer or camera.
 * - Pristine Base Emissive Tracking: stores clean initial material emissive so highlights
 *   never pollute or overwrite each other (M1.3.4.3).
 * - Clear Visual State Hierarchy: DRAG > DROP_TARGET > SELECTED > HOVER > DEFAULT.
 * - Exposes Drop Target Preview API for intuitive drag & drop merge feedback.
 * - All event listeners are registered via AbortController for safe cleanup.
 */
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { INTERACTION_CONFIG } from './InteractionConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('RaycastInteractionManager');

// ─── Internal Types ──────────────────────────────────────────────────────────

/** Stored emissive state for a single material, used to restore original material state. */
interface StoredEmissive {
  color: THREE.Color;
  intensity: number;
}

/** A registered interactable object entry. */
interface InteractableEntry {
  id: string;
  object: CardObject3D | DeckObject3D;
}

// ─── RaycastInteractionManager ────────────────────────────────────────────────

export class RaycastInteractionManager {
  private readonly _raycaster: THREE.Raycaster;
  private readonly _ndc = new THREE.Vector2();

  // Registered objects available for interaction
  private readonly _interactables = new Map<string, InteractableEntry>();

  // Current hover, selection, and drop preview state
  private _hoveredObject: CardObject3D | DeckObject3D | null = null;
  private readonly _selectedObjects = new Set<CardObject3D | DeckObject3D>();
  private readonly _dropTargetObjects = new Set<CardObject3D | DeckObject3D>();

  // Pristine base emissive storage (keyed by material uuid)
  private readonly _baseEmissiveMap = new Map<string, StoredEmissive>();

  // Legacy backup maps kept for interface compatibility
  private readonly _hoverEmissiveBackup = new Map<string, StoredEmissive>();
  private readonly _selectEmissiveBackup = new Map<string, StoredEmissive>();

  // Click vs drag detection
  private _mouseDownX = 0;
  private _mouseDownY = 0;

  // AbortController for event listener cleanup
  private readonly _abortController = new AbortController();

  /**
   * Optional callback invoked when a left-click mousedown lands on a CardObject3D.
   * DragController sets this to intercept the event before orbit/selection logic runs.
   */
  public onCardMouseDown: ((card: CardObject3D, event: MouseEvent) => void) | null = null;

  /**
   * Optional callback invoked when a DeckObject3D is clicked (M1.3.3).
   */
  public onDeckClick: ((deck: DeckObject3D, event: MouseEvent) => void) | null = null;

  /**
   * Optional callback invoked when a card in a stack is Alt+Clicked (M1.3.4.2).
   */
  public onAltClickCardInStack: ((card: CardObject3D, event: MouseEvent) => void) | null = null;

  /**
   * Optional callback invoked when selection changes (M1.5.0).
   */
  public onSelectionChanged: (() => void) | null = null;

  /**
   * Optional callback invoked when hovered object changes (M1.5.1).
   */
  public onHoverChanged: ((current: CardObject3D | DeckObject3D | null, prev: CardObject3D | DeckObject3D | null) => void) | null = null;

  /**
   * Optional callback invoked when hover changes on a TABLE-location card (M1.5.3).
   * Used by HoverExpansionController to trigger fan-out animation.
   */
  public onTableCardHoverChanged: ((card: CardObject3D | null, isHovering: boolean) => void) | null = null;

  /**
   * Flag indicating whether an active drag is in progress (M1.3.2).
   */
  public isDragActive = false;

  /**
   * Optional custom resolver for card hits (e.g. partition-based HandZone hit testing) (M1.7.2).
   */
  public customCardHitResolver: ((raycaster: THREE.Raycaster) => CardObject3D | null) | null = null;

  /**
   * Optional permission checker to filter interactable objects (e.g. blocking opponent hand cards) (M1.7.2).
   */
  public canInteractWithObject: ((object: CardObject3D | DeckObject3D) => boolean) | null = null;

  constructor(
    private readonly _camera: THREE.Camera,
    private readonly _domElement: HTMLElement,
    private readonly _requestRender: () => void
  ) {
    this._raycaster = new THREE.Raycaster();
    this._registerEventListeners();
    logger.info('RaycastInteractionManager initialized');
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  registerObject(id: string, object: CardObject3D | DeckObject3D): void {
    if (this._interactables.has(id)) {
      logger.warn(`RaycastInteractionManager: Object with id "${id}" already registered, replacing.`);
    }

    // Prevent registering duplicate object instances under multiple IDs (M1.3.3)
    for (const [existingId, entry] of this._interactables.entries()) {
      if (entry.object === object && existingId !== id) {
        logger.warn(
          `RaycastInteractionManager: Object instance already registered with id "${existingId}", ignoring duplicate registration as "${id}"`
        );
        return;
      }
    }

    this._interactables.set(id, { id, object });

    // Store pristine base material state once
    const mesh = object.getMesh();
    if (mesh) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial && !this._baseEmissiveMap.has(mat.uuid)) {
          this._baseEmissiveMap.set(mat.uuid, {
            color: mat.emissive.clone(),
            intensity: mat.emissiveIntensity,
          });
        }
      }
    }

    logger.debug(`Registered interactable: ${id}`);
  }

  unregisterObject(id: string): void {
    const entry = this._interactables.get(id);
    if (!entry) {
      logger.warn(`RaycastInteractionManager: unregisterObject called for unknown id "${id}"`);
      return;
    }

    if (this._hoveredObject === entry.object) {
      this._hoveredObject = null;
    }
    if (this._selectedObjects.has(entry.object)) {
      this.deselectObject(entry.object);
    }
    if (this._dropTargetObjects.has(entry.object)) {
      this._dropTargetObjects.delete(entry.object);
    }

    this._interactables.delete(id);
    logger.debug(`Unregistered interactable: ${id}`);
  }

  getRegisteredCount(): number {
    return this._interactables.size;
  }

  // ─── State Accessors ──────────────────────────────────────────────────────

  getHoveredObject(): CardObject3D | DeckObject3D | null {
    return this._hoveredObject;
  }

  getSelectedObject(): CardObject3D | DeckObject3D | null {
    return this._selectedObjects.values().next().value ?? null;
  }

  getSelectedObjects(): (CardObject3D | DeckObject3D)[] {
    return Array.from(this._selectedObjects);
  }

  getSelectedCards(): CardObject3D[] {
    return this.getSelectedObjects().filter((obj): obj is CardObject3D => obj instanceof CardObject3D);
  }

  isSelected(object: CardObject3D | DeckObject3D): boolean {
    return this._selectedObjects.has(object);
  }

  // ─── Selection Management ─────────────────────────────────────────────────

  selectObject(object: CardObject3D | DeckObject3D, addToSelection = false): void {
    if (!addToSelection) {
      const prevSelected = Array.from(this._selectedObjects);
      this._selectedObjects.clear();
      for (const prev of prevSelected) {
        this.refreshObjectHighlight(prev);
      }
    }

    if (!this._selectedObjects.has(object)) {
      this._selectedObjects.add(object);
      this.refreshObjectHighlight(object);
      this._requestRender();
      this.onSelectionChanged?.();
    }
  }

  deselectObject(object: CardObject3D | DeckObject3D): void {
    if (this._selectedObjects.has(object)) {
      this._selectedObjects.delete(object);
      this.refreshObjectHighlight(object);
      this._requestRender();
      this.onSelectionChanged?.();
    }
  }

  clearSelection(): void {
    if (this._selectedObjects.size === 0) return;

    const prev = Array.from(this._selectedObjects);
    this._selectedObjects.clear();
    for (const obj of prev) {
      this.refreshObjectHighlight(obj);
    }

    this._requestRender();
    this.onSelectionChanged?.();
  }

  selectObjects(objects: (CardObject3D | DeckObject3D)[]): void {
    const prev = Array.from(this._selectedObjects);
    this._selectedObjects.clear();
    for (const obj of prev) {
      this.refreshObjectHighlight(obj);
    }

    for (const obj of objects) {
      this._selectedObjects.add(obj);
      this.refreshObjectHighlight(obj);
    }
    this._requestRender();
    this.onSelectionChanged?.();
  }

  // ─── Drop Target Preview (M1.3.4.3) ───────────────────────────────────────

  setDropTargetPreview(objects: (CardObject3D | DeckObject3D)[]): void {
    const newSet = new Set(objects);
    let changed = false;

    for (const old of this._dropTargetObjects) {
      if (!newSet.has(old)) {
        this._dropTargetObjects.delete(old);
        this.refreshObjectHighlight(old);
        changed = true;
      }
    }

    for (const obj of objects) {
      if (!this._dropTargetObjects.has(obj)) {
        this._dropTargetObjects.add(obj);
        this.refreshObjectHighlight(obj);
        changed = true;
      }
    }

    if (changed) {
      this._requestRender();
    }
  }

  clearDropTargetPreview(): void {
    if (this._dropTargetObjects.size === 0) return;
    const toRefresh = Array.from(this._dropTargetObjects);
    this._dropTargetObjects.clear();
    for (const obj of toRefresh) {
      this.refreshObjectHighlight(obj);
    }
    this._requestRender();
  }

  // ─── Unified Visual State Resolver (M1.3.4.3) ─────────────────────────────

  /**
   * Refreshes the visual highlight of an object strictly based on its current state:
   * DROP_TARGET (cyan) > SELECTED (green) > HOVERED (blue) > DEFAULT (clean base).
   * Eliminates state pollution and stuck highlights completely.
   */
  refreshObjectHighlight(object: CardObject3D | DeckObject3D): void {
    const mesh = object.getMesh();
    if (!mesh) return;

    if (this._dropTargetObjects.has(object)) {
      this._applyHighlightDirect(
        mesh,
        INTERACTION_CONFIG.DROP_PREVIEW_EMISSIVE_COLOR,
        INTERACTION_CONFIG.DROP_PREVIEW_EMISSIVE_INTENSITY
      );
    } else if (this.isSelected(object)) {
      this._applyHighlightDirect(
        mesh,
        INTERACTION_CONFIG.SELECTED_EMISSIVE_COLOR,
        INTERACTION_CONFIG.SELECTED_EMISSIVE_INTENSITY
      );
    } else if (this._hoveredObject === object) {
      this._applyHighlightDirect(
        mesh,
        INTERACTION_CONFIG.HOVER_EMISSIVE_COLOR,
        INTERACTION_CONFIG.HOVER_EMISSIVE_INTENSITY
      );
    } else {
      this._restoreHighlightDirect(mesh);
    }
  }

  private _applyHighlightDirect(mesh: THREE.Mesh, color: number, intensity: number): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (!this._baseEmissiveMap.has(mat.uuid)) {
        this._baseEmissiveMap.set(mat.uuid, {
          color: mat.emissive.clone(),
          intensity: mat.emissiveIntensity,
        });
      }
      mat.emissive.set(color);
      mat.emissiveIntensity = intensity;
    }
  }

  private _restoreHighlightDirect(mesh: THREE.Mesh): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const base = this._baseEmissiveMap.get(mat.uuid);
      if (base) {
        mat.emissive.copy(base.color);
        mat.emissiveIntensity = base.intensity;
      } else {
        mat.emissive.set(0x000000);
        mat.emissiveIntensity = 0;
      }
    }
  }

  // ─── Event Listeners ──────────────────────────────────────────────────────

  private _registerEventListeners(): void {
    const signal = this._abortController.signal;

    this._domElement.addEventListener(
      'mousemove',
      (e) => this._onMouseMove(e),
      { signal }
    );

    this._domElement.addEventListener(
      'mouseleave',
      () => this._onMouseLeave(),
      { signal }
    );

    this._domElement.addEventListener(
      'mousedown',
      (e) => this._onMouseDown(e),
      { signal }
    );

    this._domElement.addEventListener(
      'mouseup',
      (e) => this._onMouseUp(e),
      { signal }
    );
  }

  getObjectAt(clientX: number, clientY: number): CardObject3D | DeckObject3D | null {
    this._updateNDC(clientX, clientY);
    return this._findIntersectedEntry()?.object ?? null;
  }

  private _updateNDC(clientX: number, clientY: number): void {
    const rect = this._domElement.getBoundingClientRect();
    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _collectMeshes(): { mesh: THREE.Mesh; entry: InteractableEntry }[] {
    const targets: { mesh: THREE.Mesh; entry: InteractableEntry }[] = [];
    for (const entry of this._interactables.values()) {
      if (entry.object.isDisposed()) continue;
      if (this.canInteractWithObject && !this.canInteractWithObject(entry.object)) continue;
      const mesh = entry.object.getMesh();
      if (mesh && mesh.visible) {
        targets.push({ mesh, entry });
      }
    }
    return targets;
  }

  private _findIntersectedEntry(): InteractableEntry | null {
    if (this._interactables.size === 0) return null;

    this._raycaster.setFromCamera(this._ndc, this._camera);

    // M1.7.2 Fix C: Check custom card hit resolver first (HandZone partition)
    if (this.customCardHitResolver) {
      const customCard = this.customCardHitResolver(this._raycaster);
      if (customCard && !customCard.isDisposed()) {
        if (!this.canInteractWithObject || this.canInteractWithObject(customCard)) {
          const entry = this._interactables.get(customCard.cardId);
          if (entry) return entry;
        }
      }
    }

    const targets = this._collectMeshes();
    if (targets.length === 0) return null;

    const meshes = targets.map((t) => t.mesh);
    const intersections = this._raycaster.intersectObjects(meshes, false);

    if (intersections.length === 0) return null;

    // Prefer higher renderOrder if difference >= 50 (e.g. lifted/selected/hovered)
    let bestHit = intersections[0]!;
    for (let i = 1; i < intersections.length; i++) {
      const hit = intersections[i]!;
      if ((hit.object.renderOrder ?? 0) - (bestHit.object.renderOrder ?? 0) >= 50) {
        bestHit = hit;
      }
    }

    const hitMesh = bestHit.object as THREE.Mesh;
    const hit = targets.find((t) => t.mesh === hitMesh);
    return hit?.entry ?? null;
  }

  // ─── Hover Logic ──────────────────────────────────────────────────────────

  /**
   * M1.7.9 Part B: programmatic hover entry point used by the screen-space fan
   * preview overlay. Mirrors the internal `_updateHover` state bookkeeping (hover
   * highlight refresh + `onHoverChanged` fan-out) so hovers forwarded from a fan
   * card stay fully in sync with the real card hover pipeline without a canvas
   * raycast round-trip. `null` clears the hover (pointer left the card region).
   */
  setHoveredObject(object: CardObject3D | DeckObject3D | null): void {
    if (this._hoveredObject === object) return;
    const prev = this._hoveredObject;
    this._hoveredObject = object;
    if (prev) this.refreshObjectHighlight(prev);
    if (object) this.refreshObjectHighlight(object);
    this._requestRender();
    this.onHoverChanged?.(object, prev);
  }

  private _updateHover(): void {
    const hitEntry = this._findIntersectedEntry();

    if (hitEntry === null) {
      if (this._hoveredObject !== null) {
        const prev = this._hoveredObject;
        this._hoveredObject = null;
        this.refreshObjectHighlight(prev);
        this._requestRender();
        this.onHoverChanged?.(null, prev);
        // M1.5.3: Notify HoverExpansionController when leaving a table card
        if (prev instanceof CardObject3D && !prev.isInHand()) {
          this.onTableCardHoverChanged?.(null, false);
        }
      }
      return;
    }

    const hitObject = hitEntry.object;
    if (hitObject === this._hoveredObject) return;

    const prev = this._hoveredObject;
    this._hoveredObject = hitObject;

    if (prev) this.refreshObjectHighlight(prev);
    this.refreshObjectHighlight(hitObject);
    this._requestRender();
    this.onHoverChanged?.(hitObject, prev);

    // M1.5.3: Notify HoverExpansionController on table card hover
    if (hitObject instanceof CardObject3D && !hitObject.isInHand()) {
      this.onTableCardHoverChanged?.(hitObject, true);
    } else if (prev instanceof CardObject3D && !prev.isInHand()) {
      this.onTableCardHoverChanged?.(null, false);
    }
  }

  // ─── Mouse Handlers ───────────────────────────────────────────────────────

  /**
   * M1.7.5 Part 1: clears the current hover if it points at `object`.
   * Invoked on the HAND→TABLE transition so no hand-hover bookkeeping
   * (hover highlight, hand-zone hover callbacks, expansion triggers) survives
   * the card leaving its hand. The next pointer move re-evaluates hover
   * normally, and the card then hovers as an ordinary table card.
   */
  clearHoverForObject(object: CardObject3D | DeckObject3D): void {
    if (this._hoveredObject !== object) return;
    const prev = this._hoveredObject;
    this._hoveredObject = null;
    this.refreshObjectHighlight(prev);
    this._requestRender();
    this.onHoverChanged?.(null, prev);
    if (prev instanceof CardObject3D && !prev.isInHand()) {
      this.onTableCardHoverChanged?.(null, false);
    }
  }

  private _onMouseMove(event: MouseEvent): void {
    if (this.isDragActive) return;
    this._updateNDC(event.clientX, event.clientY);
    this._updateHover();
  }

  private _onMouseLeave(): void {
    if (this._hoveredObject !== null) {
      const prev = this._hoveredObject;
      this._hoveredObject = null;
      this.refreshObjectHighlight(prev);
      this._requestRender();
      this.onHoverChanged?.(null, prev);
    }
  }

  private _onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;

    this._mouseDownX = event.clientX;
    this._mouseDownY = event.clientY;

    this._updateNDC(event.clientX, event.clientY);
    const hitEntry = this._findIntersectedEntry();

    if (hitEntry !== null && hitEntry.object instanceof CardObject3D) {
      if (this.onCardMouseDown) {
        this.onCardMouseDown(hitEntry.object, event);
      }
    }
  }

  private _onMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    if (this.isDragActive) return;

    const dx = event.clientX - this._mouseDownX;
    const dy = event.clientY - this._mouseDownY;
    const distSq = dx * dx + dy * dy;

    if (distSq > INTERACTION_CONFIG.CLICK_DRAG_THRESHOLD_PX ** 2) {
      return;
    }

    this._updateNDC(event.clientX, event.clientY);
    this._processClick(event);
  }

  // ─── Click Processing ─────────────────────────────────────────────────────

  private _processClick(event?: MouseEvent): void {
    const hitEntry = this._findIntersectedEntry();
    const isMulti = Boolean(event?.ctrlKey || event?.metaKey);
    const isAlt = Boolean(event?.altKey);

    if (hitEntry === null) {
      if (!isMulti) {
        this.clearSelection();
      }
      return;
    }

    const hitObject = hitEntry.object;

    if (hitObject instanceof DeckObject3D && this.onDeckClick) {
      this.onDeckClick(hitObject, event ?? new MouseEvent('click'));
      return;
    }

    if (isAlt && hitObject instanceof CardObject3D && hitObject.isInStack() && this.onAltClickCardInStack) {
      this.onAltClickCardInStack(hitObject, event ?? new MouseEvent('click'));
      return;
    }

    if (isMulti) {
      if (this.isSelected(hitObject)) {
        this.deselectObject(hitObject);
      } else {
        this.selectObject(hitObject, true);
      }
    } else {
      if (this._selectedObjects.size === 1 && this.isSelected(hitObject)) {
        this.deselectObject(hitObject);
      } else {
        this.selectObject(hitObject, false);
      }
    }

    logger.debug(`Selection updated for: ${hitEntry.id} (total selected: ${this._selectedObjects.size})`);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  dispose(): void {
    this._abortController.abort();
    this.clearDropTargetPreview();
    this.clearSelection();

    this._hoveredObject = null;
    this._interactables.clear();
    this._baseEmissiveMap.clear();
    this._hoverEmissiveBackup.clear();
    this._selectEmissiveBackup.clear();
    this.onCardMouseDown = null;
    this.onDeckClick = null;
    this.onAltClickCardInStack = null;
    this.onTableCardHoverChanged = null;

    logger.info('RaycastInteractionManager disposed');
  }
}
