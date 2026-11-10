/**
 * SceneManager.ts — Centralized Three.js Scene Lifecycle Manager
 * Single source of truth for the 3D world.
 * Manages Renderer, CameraController, LightingManager, TableObject3D,
 * and the RaycastInteractionManager (M1.3.1).
 */
import { TableRollEffects } from './TableRollEffects';
import * as THREE from 'three';
import { DEMO_TABLE_CARD_ID, DEMO_TABLE_CARD_X, SHARED_CONFIG } from '../../../shared/constants/config';

import { Renderer } from './Renderer';
import { CameraController } from './CameraController';
import { LightingManager } from './LightingManager';
import { TableObject3D } from '../objects/TableObject3D';
import { CardObject3D } from '../objects/CardObject3D';
import { DeckObject3D } from '../objects/DeckObject3D';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { DECK_CONFIG } from '../objects/DeckConfig';
import { CardRegistry } from '../objects/CardRegistry';
import { RaycastInteractionManager } from '../interaction/RaycastInteractionManager';
import { DragController } from '../interaction/DragController';
import { CardStackManager } from '../objects/CardStackManager';
import { CardStack } from '../objects/CardStack';
import { LayeringManager } from '../objects/LayeringManager';
import { PlayerAreaManager } from '../objects/PlayerAreaManager';
import { PlayerAreaObject3D } from '../objects/PlayerAreaObject3D';
import { RemoteDragPreview } from './RemoteDragPreview';
import { TableActions3D } from '../objects/TableActions3D';
import { TableZoneManager } from '../objects/TableZoneManager';
import { HandZoneManager } from '../objects/HandZoneManager';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import type { DeckViewState } from '@shared/types/protocol';
import { DeckViewRow, DECK_VIEW_PREFIX } from './DeckViewRow';
import { CardTransferAnimator, TRANSFER_DURATION_MIN_MS, type CardSlotTransform } from '../animation/CardTransferAnimator';
import { ZONE_VISUAL_CONFIG } from '../objects/TableZonesConfig';
import { getTableOuterRadius, resolveTableSeatCount, PlayerCount } from '../objects/TableShapeConfig';
import { CARD_TYPES, getCardTitle } from '../objects/CardTypeHelper';
import { computePlayerPerspective } from './PlayerPerspectiveHelper';
import { SEAT_CHANGE } from '@shared/constants/config';
import { ANONYMOUS_HAND_PREFIX, getAnonymousHandSlotId, type DeckDrawEnd, type SandboxObject, type PlayerInfo } from '@shared/types/room';
import {
  INTERACTION_CONFIG,
  clampTablePosition,
  type InsertionMode,
} from '../interaction/InteractionConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('SceneManager');
const DEAL_CARD_INTERVAL_MS = 35;
const OFFLINE_DECK_SIZE = 30;
const makeOfflineDeckIds = () => Array.from({ length: OFFLINE_DECK_SIZE }, (_, i) => "card_" + (i + 1));

// Bàn offline có bộ mẫu riêng. Gắn loại theo ID để xáo hoặc chèn lại không đổi mặt lá.
function getOfflineCardType(id: string): string | undefined {
  const number = /^card_(\d+)$/.exec(id)?.[1];
  const index = Number(number) - 1;
  return index >= 0 && index < OFFLINE_DECK_SIZE ? CARD_TYPES[index % CARD_TYPES.length] : undefined;
}

interface PendingHandTransfer {
  cardId: string;
  sourceZoneId: string | null;
  sourceIndex: number;
  targetPlayerIndex?: number;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  originalScale: THREE.Vector3;
  originalFaceUp: boolean;
  originalMasked: boolean;
  wasInHand: boolean;
}

export class SceneManager {
  readonly tableRollEffects: TableRollEffects;
  private readonly _scene: THREE.Scene;
  private readonly _renderer: Renderer;
  private readonly _cameraController: CameraController;
  private readonly _lightingManager: LightingManager;
  private readonly _table: TableObject3D;
  private readonly _registeredObjects = new Map<string, THREE.Object3D>();
  private readonly _cardRegistry: CardRegistry;
  private readonly _interactionManager: RaycastInteractionManager;
  private readonly _dragController: DragController;
  private readonly _stackManager = new CardStackManager();
  private readonly _layeringManager = new LayeringManager();
  private readonly _playerAreaManager: PlayerAreaManager;
  private readonly _tableZoneManager: TableZoneManager;
  private readonly _handZoneManager: HandZoneManager;
  readonly remoteDragPreview: RemoteDragPreview;
  onOnlineDeckInsert?: (cards: CardObject3D[]) => boolean;
  onOnlineDeckClick?: () => void;
  private _discardDisplay?: DeckObject3D;
  private _discardTopId?: string;
  private _roundSetup = false;
  private _roundSpectator = false;
  private readonly _sharedHandCards = new Map<string, SandboxObject>();
  private readonly _localHandAliases = new Map<string, string>();
  private _localHandSlotOrder: string[] = [];
  private readonly _spectatorFlipIds = new Set<string>();
  private _onlineCardRoomId: string | null = null;
  readonly tableActions: TableActions3D;
  readonly deckViewRow: DeckViewRow;
  private readonly _transferAnimator: CardTransferAnimator;
  private readonly _pendingTransfers = new Map<string, PendingHandTransfer>();
  private readonly _lastTransferSeq = new Map<string, number>();
  private readonly _suppressDragEndIds = new Set<string>();
  private _discardStackId: string | null = null;
  private _drawnCardCount = 0;
  private _isDrawingCard = false;
  private _insertionMode: InsertionMode = 'TOP';
  private _customInsertionAboveCount = 0;
  private _running = false;
  private _activePlayerIndex: number = 0;
  /** M1.7.8: true while the pointer rests on a card in the LOCAL player's hand. */
  private _localHandHovered = false;
  private _localHandDragActive = false;
  /** Card id of the most recent local-hand drag (M1.7.10 fan boundary rule). */
  private _lastDraggedCardId: string | null = null;

  /**
   * M1.7.5 Part 2: authoritative seat count for the current room layout.
   * Kept in sync with every table rebuild / perspective seating so the default
   * HAND→TABLE orientation can be derived from the acting player's seat.
   */
  private _activePlayerCount: PlayerCount = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM;
  private _localSessionId: string = '';
  private readonly _tablePointerRaycaster = new THREE.Raycaster();
  private readonly _tablePointerNdc = new THREE.Vector2();
  private readonly _resizeAbortController = new AbortController();
  private _handPreviewDismissed = false;
  private _handPointer: { clientX: number; clientY: number } | null = null;
  private static readonly HAND_PREVIEW_SETTLE_MS = 280;
  private _handLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  public isLocalHandPreviewOpen: (() => boolean) | null = null;
  private readonly _playerAreaAbortController = new AbortController();

  /** Callback invoked when a deck count changes (e.g. card drawn) to update HUD */
  public onDeckCountChanged: ((deckId: string, count: number) => void) | null = null;

  /** Callback invoked when a local card transfer to an opponent is requested (M1.5.4) */
  public onCardTransferRequested: ((cardId: string, targetPlayerIndex: number, handIndex?: number) => void) | null = null;

  /**
   * M1.7.8: fires when the pointer enters/leaves the LOCAL player's own HAND.
   * The screen-space fan overlay subscribes to this; nothing is broadcast.
   */
  public onLocalHandHoverChanged: ((hovering: boolean) => void) | null = null;

  /**
   * M1.7.8: fires whenever the LOCAL player's hand membership/order changes
   * (draw, play, transfer, reorder). Display-only notification.
   */
  public onLocalHandChanged: (() => void) | null = null;

  /**
   * M1.7.10 Part A: screen-space test for the fan preview overlay. Wired by App
   * to FullHandFanPreviewUI.containsPoint so a drag that ends over the Preview
   * keeps the fan open even when the dragged card left the HAND.
   */
  public isPointOverLocalHandPreview: ((clientX: number, clientY: number) => boolean) | null = null;

  constructor(container: HTMLElement) {
    this._scene = new THREE.Scene();

    this._renderer = new Renderer(container);
    this._cameraController = new CameraController(
      this._renderer.getCamera(),
      this._renderer.getDomElement(),
      { fitTablePerspective: true }
    );

    // Whenever camera moves, immediately request a new frame render
    this._cameraController.onChange = () => {
      this.requestRender();
    };

    // M1.7.10 Part C: Manual Reset Camera (button + R key) must reuse the exact
    // same seated-perspective application as Online entry. No copy of camera
    // logic lives in the reset handler.
    this._cameraController.onResetRequested = () => {
      this.applyLocalPlayerPerspective(true);
    };

    // Initialize decoupled lighting setup
    this._lightingManager = new LightingManager(this._scene);

    // Initialize 3D Table Surface
    this._table = new TableObject3D();
    this.addObject('table', this._table);
    this.tableRollEffects = new TableRollEffects(this._table.surfaceY,
      (id, object) => this.addObject(id, object), id => this.removeObject(id), () => this.requestRender());

    // Initialize Centralized Card ID Registry (M1.3.3)
    this._cardRegistry = new CardRegistry();
    this.remoteDragPreview = new RemoteDragPreview(this._scene,
      id => this._cardRegistry.getCardObject(this._localHandAliases.get(id) ?? id) ?? undefined, () => this.requestRender());

    // M1.7.4: Single owner for animated hand-transfer trajectories

    this._transferAnimator = new CardTransferAnimator(this._scene, () => this.requestRender());
    this.deckViewRow = new DeckViewRow(this._renderer.getDomElement(), this._renderer.getCamera(), this._transferAnimator,
      (id, object) => this.addObject(id, object), id => this.removeObject(id), () => this.requestRender());

    // Initialize M1.2.1 Demo Card on tabletop (rests flush on table surface)
    const demoCard = this._createOfflineDemoCard();
    this.addObject('demo_card', demoCard);
    this._cardRegistry.registerTableCard(demoCard);

    // Initialize M1.4.2 Table Zone Manager (Deck Zone, Discard Zone, Card Placement Zones)
    this._tableZoneManager = new TableZoneManager(this._scene, () => this.requestRender());
    this._tableZoneManager.setupZones(SHARED_CONFIG.MAX_PLAYERS_PER_ROOM);
    const deckPos = this._tableZoneManager.getDeckPosition();

    // Initialize M1.2.2 Demo Deck on tabletop (rests flush on table surface at deck zone position)
    const demoDeck = new DeckObject3D({
      id: 'demo_deck_1',
      cardIds: makeOfflineDeckIds(),
      position: { x: deckPos.x, y: TABLE_CONFIG.SURFACE_Y, z: deckPos.z },
    });
    this.addObject('demo_deck', demoDeck);
    this._cardRegistry.registerDeck(demoDeck.getId(), demoDeck.getCardIds());

    // Initialize M1.3.1 Raycasting Interaction System
    this._interactionManager = new RaycastInteractionManager(
      this._renderer.getCamera(),
      this._renderer.getDomElement(),
      () => this.requestRender()
    );
    this._interactionManager.registerObject('demo_card', demoCard);
    this._interactionManager.registerObject('demo_deck', demoDeck);
    this.tableActions = new TableActions3D(this._renderer.getDomElement(), this._renderer.getCamera(),
      () => this.requestRender(), () => this._interactionManager.getHoveredObject() !== null);
    this.tableActions.setAnchor(deckPos.x, deckPos.z, 0);
    this.addObject('table-actions', this.tableActions);

    // Wire deck clicks to drawCardFromDeck (M1.3.3)
    this._interactionManager.onDeckClick = (deck: DeckObject3D) => {
      if (this._onlineCardRoomId) this.onOnlineDeckClick?.();
      else this.drawCardFromDeck(deck.getId());
    };

    // M1.3.4.2: Wire Alt+Click on card-in-stack to select entire stack
    this._interactionManager.onAltClickCardInStack = (card: CardObject3D) => {
      if (!this._roundSpectator) this.selectStack(card.getStackId()!);
    };

    // Initialize M1.3.2 Drag & Drop System for CardObject3D
    this._dragController = new DragController(
      this._renderer.getCamera(),
      this._renderer.getDomElement(),
      this._interactionManager,
      this._cameraController,
      () => this.requestRender()
    );
    this._dragController.getTableShapeParams = () => this._table.currentParams;

    // Provide scene to stack manager for 3D stack badges (M1.3.4.3)
    this._stackManager.setScene(this._scene);
    this._stackManager.setTableParamsGetter(() => this._table.currentParams);

    // Initialize M1.4.0 Player Area Manager
    this._playerAreaManager = new PlayerAreaManager(this._scene, () => this.requestRender());
    this._setupPlayerAreaInteraction();

    // Initialize M1.5.0 Hand Zone Manager
    this._handZoneManager = new HandZoneManager(
      this._scene,
      () => this.requestRender(),
      (c) => this._interactionManager.isSelected(c),
      (c) => this._interactionManager.getHoveredObject() === c
    );
    this._handZoneManager.setupLayout(SHARED_CONFIG.MAX_PLAYERS_PER_ROOM);

    // Re-arrange cards in hand whenever selection changes (elevation + on-top renderOrder)
    this._interactionManager.onSelectionChanged = () => {
      this._handZoneManager.rearrangeAllHands();
    };

    // M1.7.2 Fix C / M1.7.4: Partition-based custom hit resolver for hand cards.
    // Resolve the local hand first, then opponent hands so hover/select/flip work
    // on every visible (masked) card without exposing private content.
    this._interactionManager.customCardHitResolver = (raycaster) => {
      const localZone = this._handZoneManager.getHandZoneForPlayer(this._activePlayerIndex);
      if (localZone) {
        const card = localZone.findCardByRay(raycaster);
        if (card) return card;
      }
      for (const zone of this._handZoneManager.getAllHandZones()) {
        if (zone === localZone) continue;
        const card = zone.findCardByRay(raycaster);
        if (card) return card;
      }
      return null;
    };

    // M1.7.4: Hand cards in every zone are interactable (hover/select/flip/drag).
    // Content privacy is enforced by CardObject3D masking, not by blocking input.
    // Fan sở hữu tương tác HAND; raycast không chọn nhầm lá gốc bên dưới.
    this._interactionManager.canInteractWithObject = (object) => !this._roundSetup &&
      (!this._roundSpectator || (object instanceof CardObject3D && this.canFlipCard(object))) &&
      !(object instanceof CardObject3D && this.isCardTransferAnimating(object.cardId)) &&
      !(this.isLocalHandPreviewOpen?.() && this.isLocalHandCard(object));

    window.addEventListener('mousemove', (event: MouseEvent) => {
      this._handPointer = { clientX: event.clientX, clientY: event.clientY };
      if (this._localHandDragActive) return;
      if (this._handLeaveTimer !== null) clearTimeout(this._handLeaveTimer);
      if (!this.isLocalHandPreviewOpen?.() && this._isPointerOverHandRegion()) {
        this._updateLocalHandHover(null);
      } else {
        // Dung sai ngắn khi chuyển giữa vùng kích hoạt và overlay, tránh nhấp nháy.
        this._handLeaveTimer = setTimeout(() => {
          this._handLeaveTimer = null;
          if (!this._localHandDragActive) this._updateLocalHandHover(null, true);
        }, 90);
      }
    }, { capture: true, signal: this._resizeAbortController.signal });

    // Re-arrange cards in hand whenever hover changes. M1.7.7.1: this is the ONE
    // hand-presentation trigger. The old M1.7.3 fan preview (which pitched every
    // card upright as soon as the pointer entered the hand zone) was removed —
    // it was the runtime source of the legacy "stand-up" hover effect.
    this._interactionManager.onHoverChanged = (curr, prev) => {
      const prevInHand = prev instanceof CardObject3D && prev.isInHand();
      const currInHand = curr instanceof CardObject3D && curr.isInHand();

      if (currInHand || prevInHand) {
        this._handZoneManager.rearrangeAllHands();
      }

      // M1.7.8: notify the screen-space fan preview when the pointer enters or
      // leaves the LOCAL player's own hand. Opponent hands never qualify.
      if (!this._localHandDragActive) this._updateLocalHandHover(curr);

      this.requestRender();
    };

    // M1.7.8: hand membership/order changes refresh (or close) the fan preview
    // for the local player only. This is display-only — no game state changes.
    this._handZoneManager.setCardsChangedCallback((zone) => {
      if (zone.playerIndex !== (this._activePlayerIndex ?? 0)) return;
      if (zone.getCards().length === 0) this._resetLocalHandHover();
      this.onLocalHandChanged?.();
      // M1.7.10: hand membership changes can invalidate the hover boundary (e.g.
      // the hovered card left the hand or the hand became empty). Re-evaluate it
      // so a stale `true` flag cannot keep the fan in a wrong state. Never while a
      // drag is active — the fan must stay open until the gesture ends.
      if (!this._localHandDragActive) {
        this._updateLocalHandHover(this._interactionManager.getHoveredObject());
      }
    });

    // Theo dõi lá 3D để khôi phục fan nếu thao tác trả lá về tay.
    this._dragController.getSeatDragYaw = () => this.getDefaultTableRotationForSeat();
    this._dragController.onDragStarted = (card) => {
      this._localHandDragActive = true;
      this._lastDraggedCardId = card?.cardId ?? null;
    };

    // Wire drag drop event for stacking, merging, hand placement, and layering updates (M1.3.4 / M1.5.0)
    this._dragController.onCardDropped = (
      card: CardObject3D,
      isGroup = false,
      followers: CardObject3D[] = []
    ) => {
      this._onCardDropped(card, isGroup, followers);
    };

    this._dragController.canDragCard = (card: CardObject3D) => {
      if (this._roundSetup || this._roundSpectator || (card.cardId.startsWith(ANONYMOUS_HAND_PREFIX) && !this._sharedHandCards.has(card.cardId))
        || card.isDisposed() || card.isLayoutControlled() || this.remoteDragPreview.isLocked(card.cardId)) return false;
      return true;
    };

    // M1.7.4: Explicit hand-transfer requests own the network path. Suppress the
    // duplicate object:drag-end broadcast so the server never executes a transfer
    // twice (or broadcasts a raw private hand drop position).
    this._dragController.shouldBroadcastDragEnd = (objectId: string) => {
      if (this._suppressDragEndIds.delete(objectId)) return false;
      return true;
    };

    // Resolve drop target player index for hand transfer sync (M1.5.4)
    this._dragController.getDropTargetPlayerIndex = (card: CardObject3D) => {
      if (card.isInHand()) {
        const handZone = this._handZoneManager.getHandZone(card.getHandZoneId()!);
        return handZone ? handZone.playerIndex : null;
      }
      return null;
    };

    // Wire drop target query for preview highlight during drag (M1.3.4.3 / M1.3.4.5)
    this._dragController.onQueryDropTarget = (card: CardObject3D) => {
      // 1. Check if near a Deck (M1.3.4.5)
      const nearbyDeck = this.findNearbyDeck(card, INTERACTION_CONFIG.DROP_ZONE_RADIUS);
      if (nearbyDeck) {
        this._interactionManager.setDropTargetPreview([nearbyDeck]);
        return;
      }

      // 1b. Check if inside Discard Zone (M1.4.3 Smart Discard Preview)
      if (this.isInsideDiscardZone(card.position.x, card.position.z)) {
        const discardStack = this.getDiscardStack();
        if (discardStack) {
          this._interactionManager.setDropTargetPreview(discardStack.getCards());
        }
        return;
      }

      // 1c. Check if hovering over a Hand Zone (M1.5.0 Hand Zone Preview)
      const targetHand = this._handZoneManager.findHandZoneAtPoint(card.position.x, card.position.z);
      if (targetHand) {
        const handCards = targetHand.getCards().filter((c) => c.cardId !== card.cardId);
        if (handCards.length > 0) {
          this._interactionManager.setDropTargetPreview(handCards);
        }
        return;
      }

      // 2. Check if near an existing Stack or loose Card
      const allCards = this.getAllCards();
      const target = this._stackManager.findNearbyTarget(
        card,
        allCards,
        INTERACTION_CONFIG.DROP_ZONE_RADIUS
      );
      if (target) {
        if (target instanceof CardStack) {
          this._interactionManager.setDropTargetPreview(target.getCards());
        } else {
          this._interactionManager.setDropTargetPreview([target]);
        }
      } else {
        this._interactionManager.clearDropTargetPreview();
      }
    };

    this._dragController.onDragCancel = () => {
      this._interactionManager.clearDropTargetPreview();
    };

    // M1.7.4.1: after the drag hands back layout ownership, restore authoritative
    // hand slots. Pending transfers keep their `layoutControlled` flag, so the
    // layout pass skips them until the server answers.
    this._dragController.onDragFinished = () => {
      this._handZoneManager.rearrangeAllHands();
      this.requestRender();
      this._localHandDragActive = false;
      // M1.7.10: if the dragged card returned to the local HAND (reorder, cancel
      // or failed drop) the pointer is still inside HAND/Preview → keep the fan
      // open. If it left the HAND (table, deck, opponent hand) re-evaluate the
      // boundary and close when the pointer is outside HAND + Preview.
      const draggedId = this._lastDraggedCardId;
      this._lastDraggedCardId = null;
      const stillInLocalHand =
        draggedId !== null && this.getLocalHandCards().some((c) => c.cardId === draggedId);
      if (stillInLocalHand) {
        this._localHandHovered = true;
        this.onLocalHandHoverChanged?.(true);
        return;
      }
      // The card left the HAND (table, deck, discard, opponent hand). Keep the
      // fan open only when the gesture ended over the Preview overlay; otherwise
      // the pointer is outside HAND + Preview and the fan must close.
      const pointer = this._dragController.getLastPointerPosition();
      const overPreview =
        pointer !== null &&
        (this.isPointOverLocalHandPreview?.(pointer.clientX, pointer.clientY) ?? false);
      if (overPreview) {
        if (!this._localHandHovered) {
          this._localHandHovered = true;
          this.onLocalHandHoverChanged?.(true);
        }
        return;
      }
      this._updateLocalHandHover(null);
      // The pre-drag hover is stale after a drag (hover updates are suppressed
      // while dragging). Clear it so the dropped card does not stay highlighted.
      if (this._interactionManager.getHoveredObject() !== null) {
        this._interactionManager.setHoveredObject(null);
      }
    };

    // M1.7.4.1: a drop that queued a transfer (or an animator that already
    // started) owns the card; the drag must not release layout control.
    this._dragController.shouldReleaseLayoutControl = (card: CardObject3D) =>
      !this.isCardTransferAnimating(card.cardId);

    this._dragController.onDragSettled = (card, start) => {
      // Transfer đang chờ server đã có chủ sở hữu animation riêng.
      if (card.isDisposed() || card.isInStack() || this.isCardTransferAnimating(card.cardId)) return;
      const destination = {
        position: card.position.clone(), quaternion: card.quaternion.clone(), scale: card.scale.clone(),
      };
      const zone = card.isInHand() ? this._handZoneManager.getHandZone(card.getHandZoneId()!) : null;
      card.position.copy(start.position);
      card.rotation.copy(start.rotation);
      card.scale.copy(start.scale);
      this._transferAnimator.start({
        card,
        getTarget: () => zone?.getCardSlotTransform(card) ?? destination,
        onComplete: () => {
          zone?.arrangeCards();
          if (!this._localHandDragActive) this._updateLocalHandHover(null);
          this.requestRender();
        },
      });
    };

    this._setupResizeHandler();

    logger.info('SceneManager initialized with Table, Lighting, Demo Card, Demo Deck, and InteractionManager');
  }

  private _setupResizeHandler(): void {
    const onResize = (): void => {
      this._renderer.handleResize();
      const outerRadius = getTableOuterRadius(this._table.currentParams);
      this._cameraController.setAdaptiveRadius(
        this._cameraController.computeAdaptiveRadius(outerRadius, this._renderer.getCamera().aspect)
      );
      this.requestRender();
    };
    window.addEventListener('resize', onResize, {
      signal: this._resizeAbortController.signal,
    });
  }

  start(): void {
    if (this._running) {
      logger.warn('SceneManager.start() called more than once');
      return;
    }
    this._running = true;
    this._renderer.startLoop(
      () => this._scene,
      () => this._cameraController.getCamera()
    );
    this.requestRender();
    logger.info('SceneManager render loop started');
  }

  /** Register a 3D object by ID for lifecycle tracking */
  addObject(id: string, object: THREE.Object3D): void {
    if (this._registeredObjects.has(id)) {
      logger.warn(`SceneManager: Object with id "${id}" already registered — overwriting`);
    }

    this._registeredObjects.set(id, object);
    this._scene.add(object);
    this.requestRender();
  }

  /** Remove and dispose a 3D object by ID */
  removeObject(id: string): void {
    const object = this._registeredObjects.get(id);
    if (!object) {
      logger.warn(`SceneManager: removeObject called for unknown id "${id}"`);
      return;
    }

    // Unregister from interaction system
    this._interactionManager.unregisterObject(id);

    // Unregister from card registry if on table
    if (this._cardRegistry.getLocation(id) === 'ON_TABLE') {
      this._cardRegistry.unregisterTableCard(id);
    }

    this._scene.remove(object);
    this._registeredObjects.delete(id);
    this.requestRender();

    if ('dispose' in object && typeof (object as { dispose: () => void }).dispose === 'function') {
      (object as { dispose: () => void }).dispose();
    }
    logger.debug(`Object removed from scene: ${id}`);
  }

  /**
   * Draws the top card from a DeckObject3D and transfers it onto the tabletop as a CardObject3D.
   * Multi-phase atomic transaction: guarantees strict ID consistency between DeckObject3D,
   * CardRegistry, and Three.js Scene. If any step fails, all modified state is cleanly rolled back
   * in reverse order without lost IDs, phantom records, or orphaned scene meshes.
   */
  drawCardFromDeck(
    deckId: string,
    targetPosition?: THREE.Vector3 | { x: number; y: number; z: number }
  ): CardObject3D | null {
    // Re-entrancy guard against concurrent rapid clicks
    if (this._isDrawingCard) {
      logger.warn('drawCardFromDeck: Draw already in progress — ignoring concurrent call');
      return null;
    }
    this._isDrawingCard = true;

    try {
      // 1. Validate Deck by registered key or deck.getId()
      let deck: DeckObject3D | undefined;
      const directObj = this._registeredObjects.get(deckId);
      if (directObj instanceof DeckObject3D && !directObj.isDisposed()) {
        deck = directObj;
      } else {
        for (const obj of this._registeredObjects.values()) {
          if (obj instanceof DeckObject3D && obj.getId() === deckId && !obj.isDisposed()) {
            deck = obj;
            break;
          }
        }
      }

      if (!deck) {
        logger.warn(`drawCardFromDeck: Deck "${deckId}" not found or disposed`);
        return null;
      }

      const actualDeckId = deck.getId();

      // 2. Check empty state (handled cleanly without throwing)
      if (deck.getCount() === 0) {
        logger.debug(`drawCardFromDeck: Deck "${actualDeckId}" is empty`);
        return null;
      }

      // 3. Peek top ID
      const topCardId = deck.peekTop();
      if (!topCardId) {
        return null;
      }

      // 4. Validate registry state and SceneManager unique ID
      if (!this._cardRegistry.canTransferDeckToTable(actualDeckId, topCardId)) {
        logger.error(`drawCardFromDeck: Registry rejected transfer of "${topCardId}" from deck "${actualDeckId}"`);
        return null;
      }
      if (this._registeredObjects.has(topCardId)) {
        logger.error(`drawCardFromDeck: Object with id "${topCardId}" already registered in SceneManager`);
        return null;
      }

      // 5. Calculate spawn position
      let spawnPos: { x: number; y: number; z: number };
      if (targetPosition) {
        spawnPos = {
          x: targetPosition.x,
          y: TABLE_CONFIG.SURFACE_Y,
          z: targetPosition.z,
        };
      } else {
        const cascadeIndex = this._drawnCardCount % 6;
        spawnPos = {
          x: deck.position.x + DECK_CONFIG.WIDTH + 0.8 + cascadeIndex * 0.4,
          y: TABLE_CONFIG.SURFACE_Y,
          z: deck.position.z + cascadeIndex * 0.25,
        };
      }

      // 6. Instantiate CardObject3D with atomic error protection (Phase 0)
      let newCard: CardObject3D;
      try {
        const cardType = !this._onlineCardRoomId && deck === this.getOriginalDeck()
          ? getOfflineCardType(topCardId) : undefined;
        newCard = new CardObject3D({
          id: topCardId,
          cardType,
          title: cardType ? getCardTitle(cardType) : `Lá bài ${topCardId}`,
          position: spawnPos,
          faceUp: true,
        });
      } catch (err) {
        logger.error(`drawCardFromDeck: Failed to instantiate CardObject3D for "${topCardId}"`, { err });
        return null;
      }

      // Multi-phase atomic commit with reverse rollback
      let registryCommitted = false;
      let deckPopped = false;
      let sceneAdded = false;
      let interactionRegistered = false;

      try {
        // Phase 1: CardRegistry transfer
        this._cardRegistry.transferDeckToTable(actualDeckId, topCardId, newCard);
        registryCommitted = true;

        // Phase 2: Deck pop
        const poppedId = deck.draw();
        if (poppedId !== topCardId) {
          if (poppedId) deck.addCard(poppedId);
          throw new Error(`drawCardFromDeck mismatch: expected "${topCardId}", got "${poppedId}"`);
        }
        deckPopped = true;

        // Phase 3: Add to SceneManager
        this.addObject(topCardId, newCard);
        sceneAdded = true;

        // Phase 4: Register with Interaction Manager
        this._interactionManager.registerObject(topCardId, newCard);
        interactionRegistered = true;
      } catch (err) {
        logger.error(`drawCardFromDeck: Transaction error for "${topCardId}" — rolling back all phases`, { err });

        // Reverse rollback:
        if (interactionRegistered) {
          try { this._interactionManager.unregisterObject(topCardId); } catch {}
        }
        if (sceneAdded) {
          try {
            this._scene.remove(newCard);
            this._registeredObjects.delete(topCardId);
          } catch {}
        }
        if (deckPopped) {
          try { deck.addCard(topCardId); } catch {}
        }
        if (registryCommitted) {
          try { this._cardRegistry.rollbackTableToDeck(actualDeckId, topCardId); } catch {}
        }
        newCard.dispose();
        return null;
      }

      // Only increment counter on full success
      this._drawnCardCount++;

      // Notify HUD and request render
      this.onDeckCountChanged?.(deckId, deck.getCount());
      if (deckId !== actualDeckId) {
        this.onDeckCountChanged?.(actualDeckId, deck.getCount());
      }
      this.requestRender();

      logger.info(`Card "${topCardId}" drawn successfully from deck "${actualDeckId}"`);
      return newCard;
    } finally {
      this._isDrawingCard = false;
    }
  }

  /**
   * Draws the top card from a DeckObject3D directly into a player's hand zone.
   * Multi-phase atomic transaction: deck → table (registry) → hand (registry + visual).
   * Full rollback on any failure. Card is registered with RaycastInteractionManager
   * so it can be hovered and dragged from the hand zone.
   */
  drawCardToHand(
    deckId: string,
    playerIndex: number,
    targetPosition?: THREE.Vector3 | { x: number; y: number; z: number }
  ): CardObject3D | null {
    if (this._isDrawingCard) {
      logger.warn('drawCardToHand: Draw already in progress — ignoring concurrent call');
      return null;
    }
    this._isDrawingCard = true;

    try {
      // 1. Resolve deck object
      let deck: DeckObject3D | undefined;
      const directObj = this._registeredObjects.get(deckId);
      if (directObj instanceof DeckObject3D && !directObj.isDisposed()) {
        deck = directObj;
      } else {
        for (const obj of this._registeredObjects.values()) {
          if (obj instanceof DeckObject3D && obj.getId() === deckId && !obj.isDisposed()) {
            deck = obj;
            break;
          }
        }
      }

      if (!deck) {
        logger.warn(`drawCardToHand: Deck "${deckId}" not found or disposed`);
        return null;
      }

      const actualDeckId = deck.getId();

      // 2. Empty deck guard
      if (deck.getCount() === 0) {
        logger.debug(`drawCardToHand: Deck "${actualDeckId}" is empty`);
        return null;
      }

      // 3. Resolve hand zone for the given player index
      const handZone = this._handZoneManager.getHandZoneForPlayer(playerIndex);
      if (!handZone) {
        logger.warn(`drawCardToHand: No hand zone found for player ${playerIndex}`);
        return null;
      }

      // 4. Peek top card ID
      const topCardId = deck.peekTop();
      if (!topCardId) return null;

      // 5. Validate registry (deck → table transition required first)
      if (!this._cardRegistry.canTransferDeckToTable(actualDeckId, topCardId)) {
        logger.error(`drawCardToHand: Registry rejected deck→table transfer of "${topCardId}"`);
        return null;
      }
      if (this._registeredObjects.has(topCardId)) {
        logger.error(`drawCardToHand: Object "${topCardId}" already registered in SceneManager`);
        return null;
      }

      // 6. Determine spawn position (use hand zone position so arrangeCards re-positions it)
      const spawnPos = targetPosition ?? {
        x: handZone.position.x,
        y: TABLE_CONFIG.SURFACE_Y,
        z: handZone.position.z,
      };

      // 7. Instantiate CardObject3D
      let newCard: CardObject3D;
      try {
        const cardType = !this._onlineCardRoomId && deck === this.getOriginalDeck()
          ? getOfflineCardType(topCardId) : undefined;
        newCard = new CardObject3D({
          id: topCardId,
          cardType,
          title: cardType ? getCardTitle(cardType) : `Lá bài ${topCardId}`,
          position: { x: spawnPos.x, y: TABLE_CONFIG.SURFACE_Y, z: spawnPos.z },
          faceUp: true,
        });
      } catch (err) {
        logger.error(`drawCardToHand: Failed to instantiate CardObject3D "${topCardId}"`, { err });
        return null;
      }

      // Multi-phase atomic commit
      let registryDeckToTable = false;
      let deckPopped = false;
      let sceneAdded = false;
      let interactionRegistered = false;
      let registryTableToHand = false;
      let handZoneAdded = false;

      try {
        // Phase 1: Registry — deck → table
        this._cardRegistry.transferDeckToTable(actualDeckId, topCardId, newCard);
        registryDeckToTable = true;

        // Phase 2: Pop deck
        const poppedId = deck.draw();
        if (poppedId !== topCardId) {
          if (poppedId) deck.addCard(poppedId);
          throw new Error(`drawCardToHand mismatch: expected "${topCardId}", got "${poppedId}"`);
        }
        deckPopped = true;

        // Phase 3: Add to scene
        this.addObject(topCardId, newCard);
        sceneAdded = true;

        // Phase 4: Register with interaction manager (hover + drag)
        this._interactionManager.registerObject(topCardId, newCard);
        interactionRegistered = true;

        // Phase 5a: Registry — table → hand
        this._cardRegistry.transferTableToHand(topCardId, handZone.zoneId);
        registryTableToHand = true;

        // Phase 5b: Add to visual hand zone (arranges card positions)
        this._handZoneManager.addCardToHand(handZone.zoneId, newCard);
        handZoneAdded = true;
      } catch (err) {
        logger.error(`drawCardToHand: Transaction error for "${topCardId}" — rolling back`, { err });

        if (handZoneAdded) {
          try { handZone.removeCard(topCardId); } catch {}
        }
        if (registryTableToHand) {
          try { this._cardRegistry.transferHandToTable(topCardId); } catch {}
        }
        if (interactionRegistered) {
          try { this._interactionManager.unregisterObject(topCardId); } catch {}
        }
        if (sceneAdded) {
          try {
            this._scene.remove(newCard);
            this._registeredObjects.delete(topCardId);
          } catch {}
        }
        if (deckPopped) {
          try { deck.addCard(topCardId); } catch {}
        }
        if (registryDeckToTable) {
          try { this._cardRegistry.rollbackTableToDeck(actualDeckId, topCardId); } catch {}
        }
        newCard.dispose();
        return null;
      }

      this._drawnCardCount++;

      this.onDeckCountChanged?.(deckId, deck.getCount());
      if (deckId !== actualDeckId) {
        this.onDeckCountChanged?.(actualDeckId, deck.getCount());
      }
      this.requestRender();

      logger.info(
        `drawCardToHand: Card "${topCardId}" drawn from deck "${actualDeckId}" → hand zone "${handZone.zoneId}" (player ${playerIndex})`
      );
      return newCard;
    } finally {
      this._isDrawingCard = false;
    }
  }

  /**
   * Synchronizes a card drawn via multiplayer server into the designated player's hand zone.
   * If local player, card face is visible with title. If opponent, card face is hidden (card back).
   */
  syncDrawnCard(
    cardId: string,
    playerIndex: number,
    cardType?: string,
    faceUp = true,
    ownerId?: string,
    faceImage?: string,
    end?: DeckDrawEnd,
  ): CardObject3D | null {
    const handZone = this._handZoneManager.getHandZoneForPlayer(playerIndex);
    if (!handZone) {
      logger.warn(`syncDrawnCard: No hand zone found for player ${playerIndex}`);
      return null;
    }

    let card: CardObject3D | null = null;
    const existing = this._registeredObjects.get(cardId);

    if (existing instanceof CardObject3D && !existing.isDisposed()) {
      card = existing;
      card.setFaceUp(faceUp);
      card.setMasked(this._shouldMask('HAND', ownerId ?? null, faceUp));
      if (ownerId !== undefined) card.setOwnerId(ownerId);
      if (cardType) {
        card.setCardType(cardType, faceImage);
        card.updateContent({ title: getCardTitle(cardType) });
      }
    } else {
      const deck = this.getOriginalDeck();
      if (!this._onlineCardRoomId && deck && deck.getCount() > 0) {
        deck.draw();
        this.onDeckCountChanged?.(deck.getId(), deck.getCount());
      }

      card = new CardObject3D({
        id: cardId,
        cardType,
        faceImage,
        title: (faceUp && cardType) ? getCardTitle(cardType) : 'Card',
        faceUp: faceUp,
        ownerId: ownerId ?? null,
      });
      card.setMasked(this._shouldMask('HAND', ownerId ?? null, faceUp));

      if (!this._cardRegistry.hasCard(cardId)) {
        this._cardRegistry.registerTableCard(card);
      }
      this.addObject(cardId, card);
      this._interactionManager.registerObject(cardId, card);
    }

    if (this._cardRegistry.hasCard(cardId) && this._cardRegistry.getLocation(cardId) !== 'IN_HAND') {
      try {
        this._cardRegistry.transferTableToHand(cardId, handZone.zoneId);
      } catch {}
    }

    this._handZoneManager.addCardToHand(handZone.zoneId, card);
    this.requestRender();

    if (end) this.animateDeckTake(cardId, this.getDeckFlightStart(end));
    logger.info(`syncDrawnCard: Card "${cardId}" placed in player ${playerIndex}'s hand (faceUp=${faceUp})`);
    return card;
  }

  /**
   * Synchronizes a transferred card between players in multiplayer (M1.5.4 /
   * M1.7.4). The card detaches from its current world transform, animates along
   * a single ease-in-out trajectory, then lands exactly on the resolved hand slot.
   */
  syncTransferredCard(
    cardId: string,
    fromPlayerIndex: number,
    toPlayerIndex: number,
    cardType?: string,
    faceUp = true,
    seq?: number,
    handIndex?: number,
    ownerId?: string,
    faceImage?: string
  ): CardObject3D | null {
    const toHandZone = this._handZoneManager.getHandZoneForPlayer(toPlayerIndex);
    if (!toHandZone) {
      logger.warn(`syncTransferredCard: No target hand zone found for player ${toPlayerIndex}`);
      return null;
    }

    // Deduplicate repeated/stale transfer events (transfer + room-state races).
    if (seq !== undefined) {
      const lastSeq = this._lastTransferSeq.get(cardId) ?? -1;
      if (seq < lastSeq) {
        logger.debug('syncTransferredCard: ignoring stale transfer', { cardId, seq, lastSeq });
        return (this.getObject(cardId) as CardObject3D | undefined) ?? null;
      }
      this._lastTransferSeq.set(cardId, seq);
    }

    this._pendingTransfers.delete(cardId);
    this.remoteDragPreview.finishCard(cardId);

    let card = this.getObject(cardId) as CardObject3D | undefined;
    if (!card || card.isDisposed()) {
      card = new CardObject3D({
        id: cardId,
        cardType,
        faceImage,
        title: (faceUp && cardType) ? getCardTitle(cardType) : 'Card',
        faceUp: faceUp,
        ownerId: ownerId ?? null,
      });
      card.setMasked(this._shouldMask('HAND', ownerId ?? null, faceUp));
      this.addObject(cardId, card);
      this._cardRegistry.registerTableCard(card);
      this._interactionManager.registerObject(cardId, card);
    } else if (ownerId !== undefined) {
      card.setOwnerId(ownerId);
    }

    if (cardType) card.setCardType(cardType, faceImage);

    // Already at the destination: update privacy/layout without re-animating.
    if (card.getHandZoneId() === toHandZone.zoneId) {
      this._applyHandPrivacy(card, 'HAND', ownerId ?? null, cardType, faceUp);
      card.setLayoutControlled(false);
      toHandZone.arrangeCards();
      this.requestRender();
      return card;
    }

    // Leave the source hand before animating so source layout closes immediately.
    const oldHandId = card.getHandZoneId();
    if (oldHandId) {
      const oldZone = this._handZoneManager.getHandZone(oldHandId);
      oldZone?.removeCard(cardId);
      if (oldZone) oldZone.arrangeCards();
    } else if (fromPlayerIndex >= 0) {
      this._handZoneManager.getHandZoneForPlayer(fromPlayerIndex)?.removeCard(cardId);
    }

    // A card leaving a stack must stop being stack-driven.
    if (card.isInStack()) {
      this._stackManager.removeCardFromStack(card);
    }

    // Transfer in registry
    if (this._cardRegistry.hasCard(cardId)) {
      if (this._cardRegistry.getLocation(cardId) === 'IN_HAND') {
        this._cardRegistry.transferHandToHand(cardId, toHandZone.zoneId);
      } else {
        this._cardRegistry.transferTableToHand(cardId, toHandZone.zoneId);
      }
    }

    this._applyHandPrivacy(card, 'HAND', ownerId ?? null, cardType, faceUp);

    const requestedIndex =
      handIndex !== undefined && Number.isInteger(handIndex)
        ? Math.max(0, handIndex)
        : toHandZone.getCardCount();
    card.setLayoutControlled(true);

    // Attach logical membership immediately so callers observe the authoritative
    // destination, while the animator remains the sole writer of the transform
    // (arrangeCards skips layout-controlled cards).
    if (!toHandZone.hasCard(card.cardId)) {
      toHandZone.addCard(card, Math.min(requestedIndex, toHandZone.getCardCount()));
    }

    this._transferAnimator.start({
      card,
      getTarget: (): CardSlotTransform => {
        return toHandZone.getCardSlotTransform(card!);
      },
      onComplete: () => {
        toHandZone.arrangeCards();
        card!.setLayoutControlled(false);
        const finalSlot = toHandZone.getCardSlotTransform(card!);
        card!.position.copy(finalSlot.position);
        card!.quaternion.copy(finalSlot.quaternion);
        card!.scale.copy(finalSlot.scale);
        if (finalSlot.layerIndex !== undefined) card!.setLayerIndex(finalSlot.layerIndex);
        // Con trỏ có thể đứng yên từ lúc drop: không chờ mouseenter tiếp theo.
        if (!this._localHandDragActive) this._updateLocalHandHover(null);
        this.requestRender();
      },
    });

    this.requestRender();
    logger.info(`syncTransferredCard: Card "${cardId}" transferred P${fromPlayerIndex} -> P${toPlayerIndex}`);
    return card;
  }

  /** M1.7.4.3: Sets the viewing player's server session ID for viewer-based masking. */
  setLocalSessionId(id: string): void {
    this._localSessionId = id;
  }

  /** M1.7.4.3: Gets the viewing player's server session ID. */
  getLocalSessionId(): string {
    return this._localSessionId;
  }

  /**
   * M1.7.6: authoritative eligibility check for the TABLE hover expansion
   * presentation. HAND membership and the CardRegistry location are the
   * authoritative sources; the card's `_ownerId` mirror alone is not enough
   * (it can survive a HAND→TABLE transition if a path forgets to clear it).
   *
   * TABLE cards are unowned by protocol (`ownerId = null` once played), so a
   * card that truly left a hand is never eligible for hand-style hover
   * expansion — even while the pointer is still resting on it after a drop.
   */
  isTableCardOwnedByLocalPlayer(card: CardObject3D): boolean {
    if (card.isDisposed() || card.isInHand()) return false;
    if (this._cardRegistry.getLocation(card.cardId) !== 'ON_TABLE') return false;
    const ownerId = card.getOwnerId();
    return ownerId !== null && ownerId === this._localSessionId;
  }

  /**
   * M1.7.4.3: Viewer-based masking formula.
   * HAND cards are only unmasked for the owning player (ownerId === localSessionId) when faceUp.
   * TABLE/DISCARD cards follow standard faceUp masking.
   */
  private _shouldMask(
    location: string,
    ownerId: string | null | undefined,
    faceUp: boolean
  ): boolean {
    if (location === 'HAND') {
      // Owner sees their own cards by faceUp; everyone else always sees back
      return ownerId !== this._localSessionId || !faceUp;
    }
    // TABLE / DISCARD: everyone sees faceUp
    return !faceUp;
  }

  /**
   * M1.7.4.3: Returns the session ID of the zone owner.
   * Local player zone → localSessionId. Opponent zone → null (unknown → mask).
   */
  private _getZoneOwnerId(zone: HandZoneObject3D): string | null {
    if (zone.playerIndex === this._activePlayerIndex) return this._localSessionId;
    return null;
  }

  private _applyHandPrivacy(
    card: CardObject3D,
    location: 'HAND' | 'TABLE',
    ownerId: string | null | undefined,
    cardType: string | undefined,
    faceUp: boolean
  ): void {
    card.setFaceUp(faceUp);
    card.setMasked(this._shouldMask(location, ownerId, faceUp));
    if (cardType) {
      card.setCardType(cardType);
      card.updateContent({ title: getCardTitle(cardType) });
    }
  }

  /** True when the card belongs to another player's private hand zone. */
  isCardInOpponentHand(card: CardObject3D): boolean {
    const zoneId = card.getHandZoneId();
    if (!zoneId) return false;
    const zone = this._handZoneManager.getHandZone(zoneId);
    return !!zone && zone.playerIndex !== (this._activePlayerIndex ?? 0);
  }

  /** True while a pending/authorized transfer owns the card's transform. */
  isCardTransferAnimating(cardId: string): boolean {
    return this._transferAnimator.isAnimating(cardId) || this._pendingTransfers.has(cardId);
  }

  /**
   * Completes every in-flight card transfer immediately. Deterministic hook for
   * tests, teardown, and tab-resume where waiting for animation frames is not
   * desirable.
   */
  flushCardTransfers(): void {
    this._transferAnimator.flush();
    this.requestRender();
  }

  /**
   * Backend rejection handler. Unauthorized drags and transfers are never
   * applied optimistically forever: the affected card is restored to its
   * authoritative hand slot (or pre-drag table transform).
   */
  /**
   * M1.7.5 Part 3: restores the server-authoritative yaw after a rejected
   * interaction. The store keeps the last authoritative rotation; because the
   * server refused the change, that value is still current (any newer remote
   * rotation would have arrived as `object:moved`). Hand cards, active drags
   * and animating transfers are never touched.
   */
  applyAuthoritativeRotation(objectId: string, rotation: number): void {
    if (this._dragController.isDragging() && this._dragController.getDraggedCard()?.cardId === objectId) return;
    if (this.isCardTransferAnimating(objectId)) return;

    const card = this._cardRegistry.getCardObject(objectId);
    if (!card || card.isDisposed() || card.isInHand()) return;

    if (card.isInStack()) {
      const stack = this._stackManager.getStack(card.getStackId()!);
      if (stack) {
        stack.setRotationY(rotation);
        this.requestRender();
      }
      return;
    }

    card.rotation.order = 'XYZ';
    card.rotation.set(0, rotation, 0);
    this.requestRender();
  }

  handleServerRejection(objectId: string, _code?: string): void {
    const dragged = this._dragController.getDraggedCard();
    const isDraggingThis = dragged?.cardId === objectId;
    const isPending = this._pendingTransfers.has(objectId);

    if (isDraggingThis) {
      this._dragController.abortDrag(!isPending);
    }

    if (isPending) {
      this._restorePendingTransfer(objectId);
    } else {
      const card = this.getObject(objectId) as CardObject3D | undefined;
      if (card && !card.isDisposed() && card.isInHand()) {
        card.setLayoutControlled(false);
        const zone = this._handZoneManager.getHandZone(card.getHandZoneId()!);
        zone?.arrangeCards();
      }
    }
    this.requestRender();
  }

  restoreRejectedHandDrop(object: SandboxObject, players: PlayerInfo[]): void {
    const card = this._cardRegistry.getCardObject(object.id);
    if (!card || card.isDisposed() || card.isInHand()) return;
    const start = { position: card.position.clone(), rotation: card.rotation.clone(), scale: card.scale.clone() };
    this._transferAnimator.cancel(object.id, false);
    card.setLayoutControlled(false);
    this.syncRoomObjects([object], players);
    this._dragController.onDragSettled?.(card, start);
  }



  animateRoundDeal(): void {
    const deck = this.getOriginalDeck();
    if (!deck) return;
    const start = deck.getWorldPosition(new THREE.Vector3());
    const orientation = deck.getWorldQuaternion(new THREE.Quaternion());
    start.y += DECK_CONFIG.CARD_THICKNESS;
    for (const card of this.getAllCards()) {
      const zoneId = card.getHandZoneId();
      const zone = zoneId ? this._handZoneManager.getHandZone(zoneId) : undefined;
      if (!zone) continue;
      const index = zone.getCards().indexOf(card);
      card.position.copy(start);
      card.quaternion.copy(orientation);
      this._transferAnimator.start({
        card,
        getTarget: () => zone.getCardSlotTransform(card),
        durationMs: TRANSFER_DURATION_MIN_MS + index * DEAL_CARD_INTERVAL_MS,
      });
    }
  }

  applyHandShuffle(order: string[]): void {

    const hand = this.getLocalHandZone();
    if (!hand) return;
    const origins = new Map(hand.getCards().map(card => [card.cardId, card.position.clone()]));
    hand.reorderCards(order);
    for (const id of order) {
      const start = origins.get(id);
      if (start) {
        start.y += 0.15;
        this._animateCardFlight(id, undefined, start);
      }
    }
    this.onLocalHandChanged?.();
    this.requestRender();
  }


  syncTablePile(cardIds: string[], rotation?: number): void {
    const cards = cardIds.flatMap(id => this._cardRegistry.getCardObject(id) ?? []);
    if (cards.length < 2) return;
    const current = this._stackManager.getStackForCard(cardIds[0]!);
    const existing = current?.getCardIds();
    if (current && existing?.length === cardIds.length && existing.every((id, index) => id === cardIds[index])) {
      if (rotation !== undefined && Math.abs(current.getRotationY() - rotation) > 0.00001) current.setRotationY(rotation);
      return;
    }
    const affected = new Set(cards.flatMap(card => this._stackManager.getStackForCard(card.cardId) ?? []));
    const wasDiscard = [...affected].some(stack => stack.stackId === this._discardStackId);
    for (const stack of affected) this._stackManager.dissolveStack(stack.stackId);
    const stack = this._stackManager.createStack(cards);
    if (rotation !== undefined) stack.setRotationY(rotation);
    if (wasDiscard) this._discardStackId = stack.stackId;
    this.requestRender();
  }

  animatePileShuffle(cardIds: string[]): void {
    const lift = 0.32;
    cardIds.forEach((id, index) => {
      const card = this._cardRegistry.getCardObject(id);
      if (!card || this.isCardTransferAnimating(id)) return;
      const start = card.position.clone();
      start.y += lift;
      start.x += index % 2 ? lift : -lift;
      this._animateCardFlight(id, undefined, start);
    });
  }

  getDeckFlightStart(end?: DeckDrawEnd): THREE.Vector3 | undefined {
    const deck = this.getOriginalDeck();
    if (!deck) return;
    const start = deck.getWorldPosition(new THREE.Vector3());
    if (end !== 'BOTTOM') start.y += Math.max(0, deck.getVisualHeight() - deck.cardThickness);
    return start;
  }

  animateDeckTake(cardId: string, start = this.getDeckFlightStart()): void {
    if (start) this._animateCardFlight(cardId, undefined, start);
  }

  private _animateCardFlight(cardId: string, source?: THREE.Object3D, start?: THREE.Vector3): void {
    const card = this._cardRegistry.getCardObject(cardId);
    const deck = this.getOriginalDeck();
    if (!card || !deck) return;

    const target = {
      position: card.position.clone(),
      quaternion: card.quaternion.clone(),
      scale: card.scale.clone(),
    };

    if (source) {
      source.getWorldPosition(card.position);
      card.position.y += DECK_CONFIG.CARD_THICKNESS;
      source.getWorldQuaternion(card.quaternion);
    } else if (start) card.position.copy(start);
    const zone = card.isInHand() ? this._handZoneManager.getHandZone(card.getHandZoneId()!) : undefined;
    this._transferAnimator.start({ card, getTarget: () => zone?.getCardSlotTransform(card) ?? target });
  }

  restoreRejectedTableDrop(objectId: string, position: { x: number; y: number; z: number }, rotation: number): void {
    const card = this._cardRegistry.getCardObject(objectId);
    if (!card || card.isDisposed() || card.isInHand()) return;
    this._transferAnimator.cancel(objectId, false);
    const target = {
      position: new THREE.Vector3(position.x, position.y, position.z),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotation, 0)),
      scale: new THREE.Vector3(1, 1, 1),
    };
    this._transferAnimator.start({ card, getTarget: () => target, onComplete: () => this.requestRender() });
  }

  private _restorePendingTransfer(cardId: string): boolean {
    const pending = this._pendingTransfers.get(cardId);
    if (!pending) return false;
    this._pendingTransfers.delete(cardId);
    this._transferAnimator.cancel(cardId, false);

    const card = this.getObject(cardId) as CardObject3D | undefined;
    if (!card || card.isDisposed()) return true;

    if (pending.sourceZoneId) {
      const zone = this._handZoneManager.getHandZone(pending.sourceZoneId);
      if (zone) {
        card.setLayoutControlled(false);
        card.setFaceUp(pending.originalFaceUp);
        const zoneOwnerId = this._getZoneOwnerId(zone);
        card.setMasked(this._shouldMask('HAND', zoneOwnerId, card.isFaceUp()));
        zone.addCard(card, pending.sourceIndex >= 0 ? pending.sourceIndex : undefined);
        this.requestRender();
        return true;
      }
    }

    // Table/stack card: restore the pre-drag transform.
    const origin = this._dragController.getDragOrigin();
    card.setLayoutControlled(false);
    card.position.copy(origin?.position ?? pending.originalPosition);
    card.rotation.copy(origin?.rotation ?? pending.originalRotation);
    card.scale.copy(origin?.scale ?? pending.originalScale);
    card.setMasked(pending.originalMasked);
    card.setFaceUp(pending.originalFaceUp);
    this.requestRender();
    return true;
  }

  /**
   * Offline/single-player fallback: apply a requested hand transfer locally
   * without waiting for a server that does not exist.
   */
  completePendingTransferLocally(cardId: string, targetPlayerIndex: number): void {
    const pending = this._pendingTransfers.get(cardId);
    if (!pending) return;
    const card = this.getObject(cardId) as CardObject3D | undefined;
    if (!card || card.isDisposed()) return;
    const targetZone = this._handZoneManager.getHandZoneForPlayer(targetPlayerIndex);
    if (!targetZone) {
      this._restorePendingTransfer(cardId);
      return;
    }
    this._pendingTransfers.delete(cardId);
    if (this._cardRegistry.hasCard(cardId)) {
      const loc = this._cardRegistry.getLocation(cardId);
      if (loc === 'IN_HAND') this._cardRegistry.transferHandToHand(cardId, targetZone.zoneId);
      else this._cardRegistry.transferTableToHand(cardId, targetZone.zoneId);
    }
    this._applyHandPrivacy(card, 'HAND', this._localSessionId, undefined, false);
    card.setLayoutControlled(false);
    targetZone.addCard(card);
    this.requestRender();
  }

  /**
   * Synchronizes all room state objects (cards on table, cards in hands) received from server.
   * Ensures clients joining mid-game or after card actions see all public table cards and proper hand counts.
   */
  private _createOfflineDemoCard(): CardObject3D {
    const cardType = CARD_TYPES[0]!;
    return new CardObject3D({
      id: DEMO_TABLE_CARD_ID,
      cardType,
      title: getCardTitle(cardType),
      position: { x: DEMO_TABLE_CARD_X, y: TABLE_CONFIG.SURFACE_Y, z: 0 },
    });
  }


  setCardRoom(roomId: string | null, setup = false, spectator = false): void {
    const resetCards = this._onlineCardRoomId !== roomId || this._roundSetup !== setup;
    this._roundSetup = setup;
    this._roundSpectator = spectator;
    const deck = this.getOriginalDeck();
    if (deck) deck.visible = !setup;
    this.tableActions.visible = !setup && !spectator;
    if (!resetCards) return;
    this.requestRender();
    if (this._onlineCardRoomId !== roomId) this.tableRollEffects.clear();
    this._onlineCardRoomId = roomId;
    this.deckViewRow.clear();
    this._spectatorFlipIds.clear();
    this._dragController.abortDrag();
    this.remoteDragPreview.clear();
    this._interactionManager.clearSelection();
    for (const [id, object] of this._registeredObjects) {
      if (!(object instanceof CardObject3D)) continue;
      this._removeRoomCard(id, object);
    }
    this._cardRegistry.clear();
    this._sharedHandCards.clear();
    this._localHandAliases.clear();
    this._localHandSlotOrder = [];
    this._pendingTransfers.clear();
    this._lastTransferSeq.clear();
    this._remoteDragSeq.clear();
    this._suppressDragEndIds.clear();
    if (deck) {
      const ids = roomId ? [] : makeOfflineDeckIds();
      deck.resetLocalCards(ids, roomId !== null);
      this._cardRegistry.registerDeck(deck.getId(), ids);
      this.onDeckCountChanged?.(deck.getId(), deck.getCount());
    }
    if (!roomId) {
      this.setLocalSessionId("");
      const demo = this._createOfflineDemoCard();
      this._cardRegistry.registerTableCard(demo);
      this.addObject("demo_card", demo);
      this._interactionManager.registerObject("demo_card", demo);
    }
  }


  private _removeRoomCard(id: string, card: CardObject3D): void {
    this.remoteDragPreview.finishCard(id);
    this._transferAnimator.cancel(id, false);
    this._pendingTransfers.delete(id);
    this._remoteDragSeq.delete(id);
    this._lastTransferSeq.delete(id);
    this._handZoneManager.removeCardFromHand(id);
    if (this._cardRegistry.getLocation(id) === 'IN_HAND') this._cardRegistry.transferHandToTable(id);

    if (card.isInStack()) this._stackManager.removeCardFromStack(card);
    this.removeObject(id);
    // Mất quyền xem chỉ hủy mô hình cục bộ. Cùng ID có thể trở lại khi lá ra bàn.
    this._cardRegistry.forgetDisposedCard(id);
  }


  get isRoundSpectator(): boolean { return this._roundSpectator; }

  canFlipCard(card: CardObject3D): boolean {
    return !this._roundSpectator || this._spectatorFlipIds.has(card.cardId);
  }

  getSharedHandObject(id: string): SandboxObject | undefined {
    return this._sharedHandCards.get(id);
  }

  syncPrivateRoundObjects(objects: SandboxObject[], players: PlayerInfo[], handCounts: Record<string, number>, handSlots?: Record<string, string[]>): void {
    this._sharedHandCards.clear();
    this._localHandAliases.clear();
    for (const object of objects) {
      if (object.location !== 'HAND' || object.ownerId !== this._localSessionId || object.handIndex === undefined) continue;
      const alias = handSlots?.[object.ownerId]?.[object.handIndex];
      if (alias) this._localHandAliases.set(alias, object.id);
    }
    if (this._roundSpectator) {
      this._spectatorFlipIds.clear();
      for (const object of objects) {
        if (object.location === 'TABLE' && object.takenFromDeck) this._spectatorFlipIds.add(object.id);
      }
    }
    const visible = objects.filter(card => card.location !== 'DISCARD');
    for (const player of players) {
      if (player.id === this._localSessionId || player.spectator) continue;
      // Mã ổn định từ máy chủ dùng để chọn đúng lá úp khi kéo.
      const count = handCounts[player.id] ?? 0;
      for (let index = 0; index < count; index++) {
        const alias = handSlots?.[player.id]?.[index];
        const card: SandboxObject = {
          id: alias ?? getAnonymousHandSlotId(player.id, index),
          type: 'card', ownerId: player.id, location: 'HAND', handIndex: index,
          position: { x: 0, y: 0, z: 0 }, rotation: 0, faceUp: false, lockedBy: null,
        };
        visible.push(card);
        if (alias) this._sharedHandCards.set(alias, card);
      }
    }
    const visibleIds = new Set(visible.map(object => object.id));
    for (const [id, object] of this._registeredObjects) {
      if (object instanceof CardObject3D && !id.startsWith(DECK_VIEW_PREFIX) && !visibleIds.has(id)) this._removeRoomCard(id, object);
    }
    this.syncRoomObjects(visible, players);
    for (const player of players) {
      const slots = handSlots?.[player.id];
      const zone = this._handZoneManager.getHandZoneForPlayer(player.playerIndex ?? -1);
      if (!slots || !zone) continue;
      const local = player.id === this._localSessionId;
      if (local) {
        const previous = this._localHandSlotOrder;
        this._localHandSlotOrder = slots;
        // Chỉ ghi đè thứ tự fan cục bộ khi máy chủ đổi chỗ các lá đang có.
        if (previous.length !== slots.length || !previous.every(id => this._localHandAliases.has(id)) ||
          previous.every((id, index) => id === slots[index])) continue;
      }
      const ids = local ? slots.flatMap(id => this._localHandAliases.get(id) ?? []) : slots;
      if (ids.some((id, index) => zone.getCards()[index]?.cardId !== id)) zone.reorderCards(ids);
    }
  }


  isDiscardAtScreenPos(x: number, y: number): boolean {
    if (!this._onlineCardRoomId || this._roundSetup || !this._updateTablePointerRay(x, y)) return false;
    const display = this._discardDisplay;
    if (display?.visible && this._tablePointerRaycaster.intersectObject(display.getMesh()).length) return true;
    const point = this._getTablePointerHit();
    return !!point && this.isInsideDiscardZone(point.x, point.z);
  }

  selectDiscardPile(selected: boolean): void {
    const pile = this._discardDisplay;
    if (!pile?.visible && selected) return;
    if (pile) {
      pile.setHighlighted(selected);
      this.requestRender();
    }
  }

  animateDiscardTake(cardIds: string[]): void {
    this.syncTablePile(cardIds);
    const start = this._tableZoneManager.getDiscardPosition();
    for (const id of cardIds) this._animateCardFlight(id, undefined, start);
  }

  animateDiscardShuffle(): void {
    this._discardDisplay?.animateActivity('shuffle', () => this.requestRender());
  }

  syncDiscardPile(cards: readonly SandboxObject[]): void {
    const top = cards[0];
    if (top && !this._discardDisplay) {
      this._discardDisplay = new DeckObject3D({ id: 'discard-pile-display' });
      this._discardDisplay.resetLocalCards([], true);
      this._scene.add(this._discardDisplay);
    }
    const display = this._discardDisplay;
    if (!display) return;
    const visible = !!top;
    const changed = display.visible !== visible;
    display.visible = visible;
    if (!visible) display.setHighlighted(false);
    const position = this._tableZoneManager.getDiscardPosition();
    const moved = !display.position.equals(position);
    if (moved) display.position.copy(position);
    const countChanged = display.setOnlineCount(cards.length);
    const faceChanged = display.setOnlineTopType(top?.faceUp ? top.cardType : undefined, top?.faceUp ? top.faceImage : undefined);
    if (top && this._discardTopId === top.id && faceChanged) display.animateActivity('flip', () => this.requestRender());
    this._discardTopId = top?.id;
    if (changed || moved || countChanged || faceChanged) this.requestRender();
  }

  setOnlineDeckCount(count: number): void {
    const deck = this.getOriginalDeck();
    if (!deck) return;
    if (deck.setOnlineCount(count)) this.requestRender();
  }


  syncDeckView(state: DeckViewState | null, localId: string | null): void {
    this.deckViewRow.sync(state, localId, this.getOriginalDeck()?.position);
  }

  animateDeckShuffle(): void {
    this.getOriginalDeck()?.animateActivity('shuffle', () => this.requestRender());
  }

  animateDeckInsertion(count: number): void {
    this.getOriginalDeck()?.animateActivity('insert', () => this.requestRender(), count);
  }

  syncRoomObjects(objects: SandboxObject[], players: PlayerInfo[]): void {

    this._playerAreaManager.updateOccupants(players);
    const migrating = new Map<CardObject3D, CardSlotTransform>();
    if (this._onlineCardRoomId && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (const object of objects) {
        if (object.location !== 'HAND') continue;
        const card = this._cardRegistry.getCardObject(object.id);
        const owner = players.find(player => player.id === object.ownerId);
        const zone = this._handZoneManager.getHandZoneForPlayer(owner?.playerIndex ?? -1);
        if (!card?.isInHand() || !zone || card.getOwnerId() !== object.ownerId || card.getHandZoneId() === zone.zoneId ||
          card.isLayoutControlled() || this.isCardTransferAnimating(card.cardId)) continue;
        migrating.set(card, { position: card.position.clone(), quaternion: card.quaternion.clone(), scale: card.scale.clone() });
      }
    }
    let modified = false;

    for (const obj of objects) {
      if (obj.type !== 'card') continue;
      if (obj.location === 'DISCARD') {
        const card = this._cardRegistry.getCardObject(obj.id);
        if (card) this._removeRoomCard(obj.id, card);
        continue;
      }


      if (this.isCardTransferAnimating(obj.id)) {
        const card = this._cardRegistry.getCardObject(obj.id);
        // Vị trí mới của máy chủ được ưu tiên khi lá đã rời tay trong lúc còn animation nhận bài.
        if (obj.location !== 'TABLE' || !card?.isInHand() || !this._transferAnimator.isAnimating(obj.id)) continue;
        this._transferAnimator.cancel(obj.id, false);
      }

      if (obj.location === 'HAND') {
        const owner = players.find((p) => p.id === obj.ownerId);
        const pIndex = owner?.playerIndex ?? 0;

        let card = this._cardRegistry.getCardObject(obj.id);
        if (!card) {
          card = new CardObject3D({
            id: obj.id,
            cardType: obj.cardType,
            faceImage: obj.faceImage,
            title: (obj.faceUp && obj.cardType) ? getCardTitle(obj.cardType) : 'Card',
            faceUp: obj.faceUp,
            ownerId: obj.ownerId ?? null,
          });
          card.setMasked(this._shouldMask('HAND', obj.ownerId, obj.faceUp));
          this._cardRegistry.registerTableCard(card);
          this.addObject(obj.id, card);
          if (!obj.id.startsWith(ANONYMOUS_HAND_PREFIX) || this._sharedHandCards.has(obj.id)) {
            this._interactionManager.registerObject(obj.id, card);
          }
        }

        // M1.7.4: an in-flight transfer is authoritative for its own transform.
        if (this.isCardTransferAnimating(obj.id) || card.isLayoutControlled()) {
          continue;
        }

        if (card.isFaceUp() !== obj.faceUp) card.setFaceUp(obj.faceUp);
        card.setMasked(this._shouldMask('HAND', obj.ownerId, obj.faceUp));
        if (obj.ownerId !== undefined) card.setOwnerId(obj.ownerId);
        if (obj.cardType) {
          card.setCardType(obj.cardType, obj.faceImage);
          card.updateContent({ title: getCardTitle(obj.cardType) });
        }

        const handZone = this._handZoneManager.getHandZoneForPlayer(pIndex);
        if (handZone && card.getHandZoneId() !== handZone.zoneId) {
          const oldHandId = card.getHandZoneId();
          if (oldHandId) {
            this._handZoneManager.getHandZone(oldHandId)?.removeCard(obj.id);
          }
          if (card.isInStack()) {
            this._stackManager.removeCardFromStack(card);
          }
          if (this._cardRegistry.getLocation(obj.id) !== 'IN_HAND') {
            try { this._cardRegistry.transferTableToHand(obj.id, handZone.zoneId); } catch {}
          } else if (oldHandId && oldHandId !== handZone.zoneId) {
            try { this._cardRegistry.transferHandToHand(obj.id, handZone.zoneId); } catch {}
          }
          handZone.addCard(card);
          modified = true;
        }
      } else if (obj.location === 'TABLE') {
        let card = this._cardRegistry.getCardObject(obj.id);
        if (!card) {
          card = new CardObject3D({
            id: obj.id,
            cardType: obj.cardType,
            faceImage: obj.faceImage,
            title: obj.cardType ? getCardTitle(obj.cardType) : 'Card',
            position: { x: obj.position.x, y: obj.position.y ?? TABLE_CONFIG.SURFACE_Y, z: obj.position.z },
            faceUp: obj.faceUp,
          });
          // M1.7.5 Part 3: a card created from an authoritative snapshot (e.g.
          // reconnect) adopts its stored rotation exactly once.
          card.rotation.set(0, obj.rotation ?? 0, 0);
          card.setMasked(this._shouldMask('TABLE', null, obj.faceUp));
          this._cardRegistry.registerTableCard(card);
          this.addObject(obj.id, card);
          this._interactionManager.registerObject(obj.id, card);
          modified = true;
        } else {
          // Card was in hand or previously elsewhere — ensure placed on table
          if (card.isInHand()) {
            const oldHand = this._handZoneManager.getHandZone(card.getHandZoneId()!);
            oldHand?.removeCard(card.cardId);
            this._cardRegistry.transferHandToTable(card.cardId);
            // M1.7.5 Part 1: clear the hand-only presentation for observers too.
            this._clearHandPresentation(card);
            // M1.7.5 Part 2/3: first landing on the table — adopt the
            // authoritative rotation once (server stored it at drag-end).
            card.rotation.set(0, obj.rotation ?? 0, 0);
            this._layeringManager.syncCards(this.getAllCards());
          }
          // Existing TABLE cards keep their current rotation: room:state never
          // overwrites a manual TABLE rotation (M1.7.5 Part 3).
          // M1.7.6: TABLE ownership is always null; clear any stale hand owner
          // even when the registry already reports ON_TABLE.
          card.setOwnerId(null);
          card.position.set(obj.position.x, obj.position.y ?? TABLE_CONFIG.SURFACE_Y, obj.position.z);
          card.setMasked(this._shouldMask('TABLE', null, obj.faceUp));
          if (card.isFaceUp() !== obj.faceUp) card.setFaceUp(obj.faceUp);
          if (obj.cardType) {
            card.setCardType(obj.cardType, obj.faceImage);
            card.updateContent({ title: getCardTitle(obj.cardType) });
          }
          modified = true;
        }
      }
    }


    for (const [card, origin] of migrating) {
      const zone = this._handZoneManager.getHandZone(card.getHandZoneId()!);
      if (!zone) continue;
      card.position.copy(origin.position);
      card.quaternion.copy(origin.quaternion);
      card.scale.copy(origin.scale);
      this._transferAnimator.start({ card, getTarget: () => zone.getCardSlotTransform(card), durationMs: SEAT_CHANGE.animationMs });
    }
    if (modified) this.requestRender();
  }

  syncFlippedCard(cardId: string, faceUp: boolean, cardType?: string, ownerId?: string | null, location?: string, notifyHand = true, faceImage?: string): void {
    const card = this._cardRegistry.getCardObject(cardId);
    if (!card || card.isDisposed()) return;

    const loc = location ?? (card.isInHand() ? 'HAND' : 'TABLE');
    // Use stored _ownerId on card if not provided by caller
    const owner = ownerId !== undefined ? ownerId : card.getOwnerId();
    if (loc === 'TABLE') {
      // M1.7.6: a table card has no owner; do not let a stale hand owner leak.
      card.setOwnerId(null);
    } else if (ownerId !== undefined) {
      card.setOwnerId(ownerId);
    }
    const localOfflineHand = loc === 'HAND' && !this._onlineCardRoomId && this.isLocalHandCard(card);
    card.setMasked(localOfflineHand ? !faceUp : this._shouldMask(loc, owner, faceUp));
    if (faceUp && cardType) {
      card.setCardType(cardType, faceImage);
      card.updateContent({ title: getCardTitle(cardType) });
    }
    if (card.isFaceUp() !== faceUp) card.animateFlipTo(faceUp, { requestRender: () => this.requestRender() });
    if (notifyHand && this.isLocalHandCard(card)) this.onLocalHandChanged?.();
    this.requestRender();
  }

  getCardRegistry(): CardRegistry {
    return this._cardRegistry;
  }

  getObject(id: string): THREE.Object3D | undefined {
    const direct = this._registeredObjects.get(id);
    if (direct) return direct;
    for (const obj of this._registeredObjects.values()) {
      if ('getId' in obj && typeof (obj as { getId: () => string }).getId === 'function') {
        if ((obj as { getId: () => string }).getId() === id) return obj;
      }
    }
    return undefined;
  }

  getTable(): TableObject3D {
    return this._table;
  }

  getDemoCard(): CardObject3D | undefined {
    return this._registeredObjects.get('demo_card') as CardObject3D | undefined;
  }

  getDemoDeck(): DeckObject3D | undefined {
    return this._registeredObjects.get('demo_deck') as DeckObject3D | undefined;
  }

  getInputCanvas(): HTMLCanvasElement {
    return this._renderer.getDomElement();
  }

  getCameraController(): CameraController {
    return this._cameraController;
  }

  getInteractionManager(): RaycastInteractionManager {
    return this._interactionManager;
  }

  getDragController(): DragController {
    return this._dragController;
  }

  // ─── Card Manipulation & Arrangement (M1.3.4) ─────────────────────────────

  getAllCards(): CardObject3D[] {
    const cards: CardObject3D[] = [];
    for (const [id, obj] of this._registeredObjects) {
      if (!id.startsWith(DECK_VIEW_PREFIX) && obj instanceof CardObject3D && !obj.isDisposed()) {
        cards.push(obj);
      }
    }
    return cards;
  }

  getAllDecks(): DeckObject3D[] {
    const decks: DeckObject3D[] = [];
    for (const obj of this._registeredObjects.values()) {
      if (obj instanceof DeckObject3D && !obj.isDisposed()) {
        decks.push(obj);
      }
    }
    return decks;
  }

  getOriginalDeck(): DeckObject3D | undefined {
    return this.getDemoDeck() ?? this.getAllDecks()[0];
  }

  findNearbyDeck(
    card: CardObject3D,
    radius = INTERACTION_CONFIG.DROP_ZONE_RADIUS
  ): DeckObject3D | null {
    const decks = this.getAllDecks();
    for (const deck of decks) {
      const dx = card.position.x - deck.position.x;
      const dz = card.position.z - deck.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= radius) {
        return deck;
      }
    }
    return null;
  }

  // ─── Insertion Mode Management (M1.3.4.5 / M1.3.4.5.1) ───────────────────

  getInsertionMode(): InsertionMode {
    return this._insertionMode;
  }

  getCustomInsertionAboveCount(): number {
    return this._customInsertionAboveCount;
  }

  /** Alias for backward compatibility if any callers use the old name */
  getCustomInsertionBelowCount(): number {
    return this._customInsertionAboveCount;
  }

  setInsertionMode(mode: InsertionMode, customAboveCount?: number): void {
    this._insertionMode = mode;
    if (customAboveCount !== undefined) {
      this._customInsertionAboveCount = Math.max(0, Math.floor(customAboveCount));
    }
    logger.info(
      `Insertion mode set to "${mode}" (custom cards above: ${this._customInsertionAboveCount})`
    );
  }

  /**
   * Converts user-facing numberOfCardsAbove (cards above new card) to internal 0-indexed position.
   * internalIndex = targetCount - numberOfCardsAbove (M1.3.4.5.1)
   * 0 cards above => internalIndex = targetCount (TOP)
   * targetCount cards above => internalIndex = 0 (BOTTOM)
   */
  cardsAboveToInternalIndex(targetCount: number, cardsAbove: number): number {
    const count = Math.max(0, targetCount);
    const clampedAbove = Math.max(0, Math.min(Math.floor(cardsAbove), count));
    return count - clampedAbove;
  }

  /**
   * Converts internal 0-indexed position back to numberOfCardsAbove for UI display.
   * numberOfCardsAbove = targetCount - internalIndex (M1.3.4.5.1)
   */
  internalIndexToCardsAbove(targetCount: number, internalIndex: number): number {
    const count = Math.max(0, targetCount);
    const clampedIdx = Math.max(0, Math.min(Math.floor(internalIndex), count));
    return count - clampedIdx;
  }

  /**
   * Calculates the bottom-to-top internal array insertion index based on current mode and targetCount.
   * TOP => targetCount (0 cards above)
   * BOTTOM => 0 (targetCount cards above)
   * CUSTOM => targetCount - numberOfCardsAbove
   */
  calculateInsertionIndex(targetCount: number, mode?: InsertionMode, customVal?: number): number {
    const effectiveMode = mode ?? this._insertionMode;
    const count = Math.max(0, targetCount);

    switch (effectiveMode) {
      case 'BOTTOM':
        return 0;
      case 'TOP':
        return count;
      case 'CUSTOM': {
        const above = customVal !== undefined ? customVal : this._customInsertionAboveCount;
        return this.cardsAboveToInternalIndex(count, above);
      }
      default:
        return count;
    }
  }

  // ─── Return to Deck & Insertion APIs (M1.3.4.5) ───────────────────────────

  /**
   * Atomically returns a single card to a deck at the specified index.
   * index = number of cards below the returned card.
   * Rollback is performed if any step fails.
   */
  returnCardToDeck(card: CardObject3D, deckId?: string, index?: number): boolean {
    if (this._onlineCardRoomId) return false;
    if (!card || card.isDisposed()) return false;

    const targetDeck = deckId
      ? (this.getObject(deckId) as DeckObject3D | undefined)
      : this.getOriginalDeck();

    if (!targetDeck || !(targetDeck instanceof DeckObject3D) || targetDeck.isDisposed()) {
      logger.error('returnCardToDeck: Valid target Deck not found');
      return false;
    }

    const actualDeckId = targetDeck.getId();
    const cardId = card.cardId;

    if (!this._cardRegistry.canTransferTableToDeck(actualDeckId, cardId)) {
      logger.error(`returnCardToDeck: Cannot transfer card "${cardId}" to deck "${actualDeckId}"`);
      return false;
    }

    // Detach from stack if applicable
    let prevStackId: string | null = null;
    if (card.isInStack()) {
      prevStackId = card.getStackId();
      this._stackManager.removeCardFromStack(card);
    }

    const deckCount = targetDeck.getCount();
    const insertIdx = index !== undefined
      ? Math.max(0, Math.min(index, deckCount))
      : this.calculateInsertionIndex(deckCount);

    let registryCommitted = false;
    let deckCommitted = false;

    try {
      this._cardRegistry.transferTableToDeck(actualDeckId, cardId);
      registryCommitted = true;

      targetDeck.insertCardAt(cardId, insertIdx);
      deckCommitted = true;

      // Unregister from interaction and scene
      this._interactionManager.unregisterObject(cardId);
      this._interactionManager.deselectObject(card);
      this._scene.remove(card);
      this._registeredObjects.delete(cardId);
      card.dispose();

      this.onDeckCountChanged?.(actualDeckId, targetDeck.getCount());
      this.requestRender();
      logger.info(
        `returnCardToDeck: Returned card "${cardId}" to deck "${actualDeckId}" at index ${insertIdx}`
      );
      return true;
    } catch (err) {
      logger.error('returnCardToDeck failed, executing rollback', { error: err });
      if (deckCommitted) {
        targetDeck.removeCardId(cardId);
      }
      if (registryCommitted) {
        this._cardRegistry.rollbackDeckToTable(actualDeckId, cardId, card);
      }
      if (prevStackId) {
        const stack = this._stackManager.getStack(prevStackId);
        if (stack) stack.addCard(card);
      }
      this.requestRender();
      return false;
    }
  }

  /**
   * Atomically returns all cards in a stack into a deck at the specified index.
   * Preserves the stack's relative bottom-to-top order.
   */
  returnStackToDeck(stackId: string, deckId?: string, index?: number): boolean {
    if (this._onlineCardRoomId) return false;
    const stack = this._stackManager.getStack(stackId);
    if (!stack) return false;

    const targetDeck = deckId
      ? (this.getObject(deckId) as DeckObject3D | undefined)
      : this.getOriginalDeck();

    if (!targetDeck || !(targetDeck instanceof DeckObject3D) || targetDeck.isDisposed()) {
      logger.error('returnStackToDeck: Valid target Deck not found');
      return false;
    }

    const actualDeckId = targetDeck.getId();
    const cards = stack.getCards();
    const cardIds = cards.map((c) => c.cardId);

    // Validate ALL cards before mutating anything
    for (const card of cards) {
      if (!this._cardRegistry.canTransferTableToDeck(actualDeckId, card.cardId)) {
        logger.error(
          `returnStackToDeck: Card "${card.cardId}" cannot be transferred to deck "${actualDeckId}"`
        );
        return false;
      }
    }

    const deckCount = targetDeck.getCount();
    const insertIdx = index !== undefined
      ? Math.max(0, Math.min(index, deckCount))
      : this.calculateInsertionIndex(deckCount);

    // Dissolve the stack first
    this._stackManager.dissolveStack(stackId);

    // Insert all card IDs into deck
    targetDeck.insertCardsAt(cardIds, insertIdx);

    // Transfer each card in registry and remove from scene
    for (const card of cards) {
      this._cardRegistry.transferTableToDeck(actualDeckId, card.cardId);
      this._interactionManager.unregisterObject(card.cardId);
      this._interactionManager.deselectObject(card);
      this._scene.remove(card);
      this._registeredObjects.delete(card.cardId);
      card.dispose();
    }

    this.onDeckCountChanged?.(actualDeckId, targetDeck.getCount());
    this.requestRender();
    logger.info(
      `returnStackToDeck: Returned ${cardIds.length} cards from stack "${stackId}" to deck "${actualDeckId}" at index ${insertIdx}`
    );
    return true;
  }

  /**
   * Returns multiple cards to a deck.
   * If cards belong to the same stack and represent all its cards, returns as a stack.
   * Otherwise returns them sequentially.
   */
  returnCardsToDeck(cards: CardObject3D[], deckId?: string, index?: number): boolean {
    if (!cards || cards.length === 0) return false;

    const validCards = cards.filter((c) => !c.isDisposed());
    if (validCards.length === 0) return false;

    // Check if all cards belong to the same stack
    const firstStackId = validCards[0]!.getStackId();
    if (firstStackId && validCards.every((c) => c.getStackId() === firstStackId)) {
      const stack = this._stackManager.getStack(firstStackId);
      if (stack && stack.getCount() === validCards.length) {
        return this.returnStackToDeck(firstStackId, deckId, index);
      }
    }

    let success = true;
    for (const card of validCards) {
      if (!this.returnCardToDeck(card, deckId, index)) {
        success = false;
      }
    }
    return success;
  }

  getStackManager(): CardStackManager {
    return this._stackManager;
  }

  getLayeringManager(): LayeringManager {
    return this._layeringManager;
  }

  /**
   * M1.7.5 Part 1: clears every hand-only presentation state on a card that is
   * leaving a Hand Zone. The hand applies a local standing presentation
   * (hover lift +0.20, hover scale 1.08/1.12, X pitch, YXZ order, elevated
   * layerIndex/renderOrder) — none of that may survive onto the table.
   *
   * The HandZone itself stops controlling the card via `removeCard()`
   * (`_handZoneId = null`); this method resets the residual visual state.
   * It never touches position.x/z (drop position is authoritative) and never
   * touches selection state (TABLE select must keep working).
   */
  private _clearHandPresentation(card: CardObject3D): void {
    // M1.7.5 Part 1: drop any hover bookkeeping that still points at this card.
    this._interactionManager.clearHoverForObject(card);
    // M1.7.6: ownership is a HAND concept. Once the card is on the table the
    // stale owner id must not survive, otherwise the hover-expansion gate and
    // any future hand presentation check would treat it as still hand-owned.
    card.setOwnerId(null);
    card.rotation.order = 'XYZ';
    card.rotation.set(0, 0, 0);
    card.position.y = TABLE_CONFIG.SURFACE_Y;
    card.scale.set(1, 1, 1);
    // Hand slot layer indices (BASE + index + 200/300) map to renderOrder and
    // must not leak; the LayeringManager re-syncs table layers right after.
    card.setLayerIndex(0);
  }

  /**
   * M1.7.5 Part 2: default table orientation for a card played by a seat.
   * Derived purely from the acting player's seat coordinates via
   * `computePlayerPerspective().theta = atan2(seat.x, seat.z)` — never from
   * the camera. Deterministic for every client (2–8 seats, no hardcoding).
   *
   * Computed once at the HAND→TABLE transition; TABLE manual rotation is
   * never recomputed or reset afterwards.
   */
  getDefaultTableRotationForSeat(
    playerIndex: number = this._activePlayerIndex,
    playerCount: PlayerCount = this._activePlayerCount
  ): number {
    const safeCount = resolveTableSeatCount(playerCount);
    const safeIndex = ((Math.floor(playerIndex) % safeCount) + safeCount) % safeCount;
    return computePlayerPerspective(safeIndex, safeCount, this._table.currentParams.circumradius).theta;
  }

  private _onCardDropped(
    card: CardObject3D,
    _isGroup = false,
    followers: CardObject3D[] = []
  ): void {
    // Clear stale suppression intents from a previous drop.
    this._suppressDragEndIds.clear();

    // Clear drop target preview immediately on drop
    this._interactionManager.clearDropTargetPreview();

    const allCards = this.getAllCards();
    this._layeringManager.syncCards(allCards);

    const cardStack = card.isInStack()
      ? (this._stackManager.getStack(card.getStackId()!) ?? null)
      : null;
    const isEntireStack =
      cardStack !== null &&
      cardStack
        .getCards()
        .every((c) => c.cardId === card.cardId || followers.some((f) => f.cardId === c.cardId));

    // 1. Check if dropped onto a Deck (M1.3.4.5)
    const nearbyDeck = this.findNearbyDeck(card, INTERACTION_CONFIG.DROP_ZONE_RADIUS);

    if (this._onlineCardRoomId && this.isInsideDeckZone(card.position.x, card.position.z, 0)) {
      const group = [card, ...followers];
      const selected = this._interactionManager.getSelectedCards().filter(selectedCard => group.includes(selectedCard));
      const ordered = [...selected, ...group.filter(groupCard => !selected.includes(groupCard))];
      if (this.onOnlineDeckInsert?.(ordered)) {

        for (const item of ordered) {
          this._suppressDragEndIds.add(item.cardId);
          this._queuePendingHandTransfer(item);
        }
        return;
      }
    }
    if (nearbyDeck && !this._onlineCardRoomId) {
      if (card.isInHand()) {
        const oldHand = this._handZoneManager.getHandZone(card.getHandZoneId()!);
        oldHand?.removeCard(card.cardId);
        this._cardRegistry.transferHandToTable(card.cardId);
        // M1.7.5 Part 1: the hand presentation must not follow the card back
        // into the deck (stale hover scale/layer would resurface on the next draw).
        this._clearHandPresentation(card);
      }
      const deckCount = nearbyDeck.getCount();
      const insertIdx = this.calculateInsertionIndex(deckCount);
      if (isEntireStack && cardStack) {
        this.returnStackToDeck(cardStack.stackId, nearbyDeck.getId(), insertIdx);
      } else {
        this.returnCardToDeck(card, nearbyDeck.getId(), insertIdx);
      }
      this.requestRender();
      return;
    }

    // 1b. Check if dropped into Discard Zone (M1.4.3 Smart Discard Stack)
    if (this.isInsideDiscardZone(card.position.x, card.position.z)) {
      if (card.isInHand()) {
        const oldHand = this._handZoneManager.getHandZone(card.getHandZoneId()!);
        oldHand?.removeCard(card.cardId);
        this._cardRegistry.transferHandToTable(card.cardId);
        const yaw = this._dragController.getDropYaw(card) ?? this.getDefaultTableRotationForSeat();
        this._clearHandPresentation(card);
        card.rotation.y = yaw;
        card.setMasked(this._shouldMask('TABLE', null, card.isFaceUp()));
      }
      if (this._onlineCardRoomId) {
        // Điểm neo chung cho cả nhóm. Server xếp từng lá theo thứ tự nhận.
        const center = this._tableZoneManager.getDiscardPosition();
        for (const item of [card, ...followers]) {
          item.position.x = center.x;
          item.position.z = center.z;
        }
      } else {
        this._handleDropInDiscardZone(card, isEntireStack, cardStack);
      }
      this.requestRender();
      return;
    }

    // 1c. Check if dropped into a Hand Zone (M1.5.0 Private Hand Zone)
    const targetHandZone = this._handZoneManager.findHandZoneAtPoint(card.position.x, card.position.z);
    if (targetHandZone) {
      this._handleDropInHandZone(card, targetHandZone, isEntireStack, cardStack, followers);
      this.requestRender();
      return;
    }

    // If card was in a Hand Zone and dropped OUTSIDE any hand zone, remove it from hand
    let leftHand = false;
    if (card.isInHand()) {
      const oldHand = this._handZoneManager.getHandZone(card.getHandZoneId()!);
      oldHand?.removeCard(card.cardId);
      this._cardRegistry.transferHandToTable(card.cardId);
      // M1.7.5 Part 1: hand transforms are local presentation only. Clear the
      // residual hover/preview/lift/scale/layer state so HandZone stops
      // affecting the card — a table card resumes the canonical flat transform.
      const yaw = this._dragController.getDropYaw(card) ?? this.getDefaultTableRotationForSeat();
      this._clearHandPresentation(card);
      // M1.7.5 Part 2: default orientation derived from the acting player's
      // seat, computed once at this HAND→TABLE transition (never re-derived).
      card.rotation.set(0, yaw, 0);
      card.setMasked(this._shouldMask('TABLE', null, card.isFaceUp()));
      leftHand = true;
    }
    for (const follower of followers) {
      if (follower.isInHand()) {
        const fOldHand = this._handZoneManager.getHandZone(follower.getHandZoneId()!);
        fOldHand?.removeCard(follower.cardId);
        this._cardRegistry.transferHandToTable(follower.cardId);
        const yaw = this._dragController.getDropYaw(follower) ?? this.getDefaultTableRotationForSeat();
        this._clearHandPresentation(follower);
        follower.rotation.set(0, yaw, 0);
        follower.setMasked(this._shouldMask('TABLE', null, follower.isFaceUp()));
        leftHand = true;
      }
    }

    if (leftHand) {
      // M1.7.5 Part 1: re-sync table layers now that hand membership changed
      // (the sync above ran before the removal, so it saw stale hand layers).
      this._layeringManager.syncCards(this.getAllCards());
    }

    // 2. Check if dropped onto a CardStack or standalone Card
    const target = this._stackManager.findNearbyTarget(
      card,
      allCards,
      INTERACTION_CONFIG.DROP_ZONE_RADIUS
    );

    if (target) {
      if (isEntireStack && cardStack) {
        // Entire stack dropped on a target
        if (target instanceof CardStack) {
          // Case 4: Stack → Stack with insertion mode index (M1.3.4.5)
          const insertIdx = this.calculateInsertionIndex(target.getCount());
          this._stackManager.insertStackIntoStack(cardStack, target, insertIdx);
          this.selectStack(target.stackId);
          logger.info(
            `Inserted stack "${cardStack.stackId}" into stack "${target.stackId}" at index ${insertIdx}`
          );
        } else {
          // Case 3: Stack → Card with insertion mode index (M1.3.4.5)
          const insertIdx = this.calculateInsertionIndex(1);
          const newStack = this._stackManager.mergeStackOntoCard(cardStack, target, insertIdx);
          this.selectStack(newStack.stackId);
          logger.info(
            `Merged stack "${cardStack.stackId}" onto card "${target.cardId}" (index: ${insertIdx}) into "${newStack.stackId}"`
          );
        }
      } else {
        // Single card (or subset) dropped on a target
        if (cardStack) {
          this._stackManager.removeCardFromStack(card);
        }
        if (target instanceof CardStack) {
          // Case 2: Card → Stack with insertion mode index (M1.3.4.5)
          const insertIdx = this.calculateInsertionIndex(target.getCount());
          this._stackManager.insertCardIntoStack(card, target, insertIdx);
          logger.info(`Inserted card "${card.cardId}" into stack "${target.stackId}" at index ${insertIdx}`);
        } else {
          // Case 1: Card → Card with insertion mode index (M1.3.4.5)
          const insertIdx = this.calculateInsertionIndex(1);
          if (insertIdx === 0) {
            const { x, z } = target.position;
            const yaw = target.getRotationY();
            const newStack = this._stackManager.createStack([card, target]);
            newStack.setRotationY(yaw);
            newStack.setPosition(x, z);
            this.selectStack(newStack.stackId);
          } else {
            this._stackManager.stackCards(target, card);
          }
          logger.info(`Stacked card "${card.cardId}" onto card "${target.cardId}" (index: ${insertIdx})`);
        }
      }
    } else {
      // Dropped on empty space
      if (isEntireStack && cardStack) {
        if (this._discardStackId === cardStack.stackId && !this.isInsideDiscardZone(card.position.x, card.position.z)) {
          this._discardStackId = null;
        }
        cardStack.setPosition(card.position.x, card.position.z);
        cardStack.realignCards();
        logger.debug(`Moved stack "${cardStack.stackId}" to (${card.position.x}, ${card.position.z})`);
      } else if (cardStack) {
        // Single card was dragged away from its stack
        this._stackManager.removeCardFromStack(card);
        card.position.y = TABLE_CONFIG.SURFACE_Y;
      }
    }

    this.requestRender();
  }

  /**
   * M1.7.5 Part 3: fired after any local rotation change (wheel free rotation
   * or R 90° quick-rotate). App broadcasts these as throttled `object:move`
   * messages — the existing protocol that already carries { position, rotation }.
   */
  public onObjectsRotationChanged:
    | ((updates: Array<{ objectId: string; position: { x: number; y: number; z: number }; rotation: number }>) => void)
    | null = null;

  /**
   * Rotates currently selected card(s) or stack(s) by 90 degrees.
   * Direction: 1 = clockwise, -1 = counter-clockwise.
   * If no card selected, falls back to demo card if available.
   * M1.7.5 Part 3: emits `onObjectsRotationChanged` so the new yaw syncs.
   */
  rotateSelectedCards(direction: 1 | -1 = 1): void {
    if (this._roundSpectator) return;
    if (this._dragController.rotateDrag(direction * INTERACTION_CONFIG.ROTATION_STEP)) return;
    let targets = this._interactionManager.getSelectedCards();
    if (targets.length === 0) {
      const demo = this.getDemoCard();
      if (demo && !demo.isDisposed()) {
        targets = [demo];
      }
    }

    if (targets.length === 0) return;

    const angleDelta = direction * INTERACTION_CONFIG.ROTATION_STEP;
    this._rotateTargets(targets, angleDelta);
  }

  /**
   * M1.7.5 Part 3: wheel eligibility. The wheel rotates the selection only
   * when at least one TABLE card (loose or in a stack) is selected and no drag
   * is in progress — hand cards and empty selections leave the wheel zooming
   * the camera as before.
   */
  canRotateSelectionWithWheel(): boolean {
    if (this._roundSpectator) return false;
    if (this._dragController.isDragging()) return true;
    return this._interactionManager.getSelectedCards().some(
      (c) => !c.isDisposed() && !c.isInHand()
    );
  }

  /**
   * M1.7.5 Part 3: free rotation of the selected TABLE cards by wheel notches.
   * Up = clockwise, down = counter-clockwise (project convention: +rotation.y
   * step = clockwise, same as rotateSelectedCards(+1)); 5° per notch, 1° with
   * Shift. Never touches hand cards and never rotates unselected cards.
   * Returns true when a rotation was applied (caller should preventDefault).
   */
  rotateSelectionByWheel(notches: number, fine = false): boolean {
    if (!Number.isFinite(notches) || notches === 0) return false;

    const targets = this._interactionManager.getSelectedCards().filter(
      (c) => !c.isDisposed() && !c.isInHand()
    );
    const stepDeg = fine
      ? INTERACTION_CONFIG.WHEEL_ROTATION_STEP_FINE_DEG
      : INTERACTION_CONFIG.WHEEL_ROTATION_STEP_DEG;
    // Scroll up (deltaY < 0 → notches < 0) = clockwise (+), scroll down = CCW.
    const direction = notches < 0 ? 1 : -1;
    const angleDelta = direction * Math.abs(notches) * stepDeg * (Math.PI / 180);

    if (this._dragController.rotateDrag(angleDelta)) return true;
    if (!targets.length) return false;
    this._rotateTargets(targets, angleDelta);
    return true;
  }

  /** Shared rotation application for R-key and wheel paths (M1.7.5 Part 3). */
  private _rotateTargets(targets: CardObject3D[], angleDelta: number): void {
    const processedStacks = new Set<string>();

    for (const card of targets) {
      if (card.isDisposed()) continue;

      if (card.isInStack()) {
        const stackId = card.getStackId()!;
        if (!processedStacks.has(stackId)) {
          processedStacks.add(stackId);
          const stack = this._stackManager.getStack(stackId);
          if (stack) {
            stack.setRotationY(stack.getRotationY() + angleDelta);
          }
        }
      } else {
        card.rotateY(angleDelta);
        const clamped = clampTablePosition(
          card.position.x,
          card.position.z,
          card.getRotationY(),
          card.cardWidth,
          card.cardHeight
        );
        card.position.x = clamped.x;
        card.position.z = clamped.z;
      }
    }

    this._emitRotationUpdates(targets);
    this.requestRender();
  }

  /**
   * M1.7.5 Part 3: collects one update per affected room object (every card
   * of a rotated stack included) and notifies App for `object:move` broadcast.
   */
  private _emitRotationUpdates(targets: CardObject3D[]): void {
    if (!this.onObjectsRotationChanged) return;

    const updates = new Map<string, { objectId: string; position: { x: number; y: number; z: number }; rotation: number }>();
    const processedStacks = new Set<string>();

    for (const card of targets) {
      if (card.isDisposed()) continue;
      // Hand cards are local-only presentation — their transforms (and any
      // rotation) are never broadcast (M1.7.4 privacy, M1.7.5 Part 3).
      if (card.isInHand()) continue;

      if (card.isInStack()) {
        const stackId = card.getStackId()!;
        if (processedStacks.has(stackId)) continue;
        processedStacks.add(stackId);
        const stack = this._stackManager.getStack(stackId);
        if (!stack) continue;
        const yaw = stack.getRotationY();
        for (const member of stack.getCards()) {
          updates.set(member.cardId, {
            objectId: member.cardId,
            position: { x: member.position.x, y: member.position.y, z: member.position.z },
            rotation: yaw,
          });
        }
      } else {
        updates.set(card.cardId, {
          objectId: card.cardId,
          position: { x: card.position.x, y: card.position.y, z: card.position.z },
          rotation: card.getRotationY(),
        });
      }
    }

    if (updates.size > 0) this.onObjectsRotationChanged(Array.from(updates.values()));
  }

  /**
   * M1.7.5 Part 3: applies an authoritative `object:moved` (rotation sync) from
   * a remote peer. Skips the locally dragged card (drag is single writer) and
   * never touches hand cards (private presentation). In-stack cards update the
   * stack rotation — the stack owns its members' layout.
   */
  onRemoteObjectMoved(
    objectId: string,
    pos: { x: number; y: number; z: number },
    rotation: number
  ): void {
    if (this._dragController.isDragging() && this._dragController.getDraggedCard()?.cardId === objectId) {
      return;
    }
    if (this.isCardTransferAnimating(objectId)) return;

    const card = this._cardRegistry.getCardObject(objectId);
    if (!card || card.isDisposed()) return;
    if (card.isInHand()) return; // M1.7.4: hand transforms are never driven remotely

    if (card.isInStack()) {
      const stack = this._stackManager.getStack(card.getStackId()!);
      if (stack) {
        stack.setRotationY(rotation);
        this.requestRender();
      }
      return;
    }

    card.position.set(pos.x, pos.y, pos.z);
    card.rotation.order = 'XYZ';
    card.rotation.set(0, rotation, 0);
    this.requestRender();
  }

  /** Stacks all currently selected cards together (M1.3.4.3: works on both loose and in-stack cards) */
  stackSelectedCards(): CardStack | null {
    const selected = this._interactionManager.getSelectedCards();
    if (selected.length < 2) {
      logger.warn('stackSelectedCards requires at least 2 selected cards');
      return null;
    }

    // Detach each card from any existing stack before grouping
    const cardsToStack: CardObject3D[] = [];
    for (const card of selected) {
      if (card.isDisposed()) continue;
      if (card.isInStack()) {
        const removed = this._stackManager.removeCardFromStack(card);
        if (removed) cardsToStack.push(removed);
      } else {
        cardsToStack.push(card);
      }
    }

    if (cardsToStack.length < 2) {
      logger.warn('Not enough valid cards selected to form a new stack');
      return null;
    }

    const stack = this._stackManager.createStack(cardsToStack);
    this.selectStack(stack.stackId);
    this.requestRender();
    return stack;
  }

  /** Takes top card from the stack of the currently selected card */
  takeTopCardFromSelectedStack(): CardObject3D | null {
    const selected = this._interactionManager.getSelectedCards();
    for (const card of selected) {
      if (card.isInStack()) {
        const top = this._stackManager.takeTopCard(card.getStackId()!);
        if (top) {
          top.position.x += 0.8;
          top.position.z += 0.4;
          this.requestRender();
          return top;
        }
      }
    }
    return null;
  }

  /**
   * Takes the top card from the stack containing the given card.
   * Designed for Context Menu use where the target card is known directly
   * (the hovered card under the right-click cursor), independent of selection state.
   */
  takeTopCardFromCard(targetCard: CardObject3D): CardObject3D | null {
    if (!targetCard || targetCard.isDisposed()) return null;
    if (!targetCard.isInStack()) return null;

    const stackId = targetCard.getStackId()!;
    const top = this._stackManager.takeTopCard(stackId);
    if (top) {
      top.position.x += 0.8;
      top.position.z += 0.4;
      this.requestRender();
      logger.debug(`takeTopCardFromCard: took "${top.cardId}" from stack "${stackId}"`);
    }
    return top;
  }

  /**
   * Selects all cards in a stack (Alt+Click behavior).
   * All cards in the stack become selected with the standard highlight.
   * M1.3.4.2: Stack-level selection.
   */
  selectStack(stackId: string): void {
    const stack = this._stackManager.getStack(stackId);
    if (!stack) return;

    for (const s of this._stackManager.getAllStacks()) {
      s.setIsSelected(s.stackId === stackId);
    }

    const cards = stack.getCards();
    this._interactionManager.selectObjects(cards);
    logger.debug(`selectStack: selected ${cards.length} cards from stack "${stackId}"`);
    this.requestRender();
  }

  /**
   * Removes a card from its stack, making it standalone on the table.
   * If the stack drops to 1 card, it is dissolved.
   * M1.3.4.2: New API for context menu "Remove from Stack".
   */
  removeCardFromStack(card: CardObject3D): CardObject3D | null {
    if (!card || card.isDisposed() || !card.isInStack()) return null;
    const removed = this._stackManager.removeCardFromStack(card);
    if (removed) {
      // Offset slightly so it's visually distinct from the remaining stack
      removed.position.x += 0.5;
      removed.position.z += 0.3;
      this.requestRender();
    }
    return removed;
  }

  /**
   * Dissolves the stack containing the given card.
   * All cards become standalone on the table.
   * M1.3.4.2: New API for context menu "Dissolve Stack".
   */
  dissolveStackForCard(card: CardObject3D): void {
    if (!card || card.isDisposed() || !card.isInStack()) return;
    const stackId = card.getStackId()!;
    const stack = this._stackManager.getStack(stackId);
    if (!stack) return;

    // Fan out cards slightly before dissolving
    const cards = stack.getCards();
    for (let i = 0; i < cards.length; i++) {
      cards[i]!.position.x += i * 0.3;
      cards[i]!.position.z += i * 0.15;
    }

    this._stackManager.dissolveStack(stackId);
    this.requestRender();
    logger.info(`dissolveStackForCard: dissolved stack "${stackId}"`);
  }

  bringSelectedToFront(): void {
    const cards = this._interactionManager.getSelectedCards();
    for (const card of cards) {
      this._layeringManager.bringToFront(card);
    }
    this.requestRender();
  }

  sendSelectedToBack(): void {
    const cards = this._interactionManager.getSelectedCards();
    for (const card of cards) {
      this._layeringManager.sendToBack(card);
    }
    this.requestRender();
  }

  requestRender(): void {
    this._renderer.requestRender();
  }

  getScene(): THREE.Scene {
    return this._scene;
  }

  // ─── Player Area & Dynamic Table API (M1.4.0 / M1.4.1) ────────────────────

  getHandZoneManager(): HandZoneManager {
    return this._handZoneManager;
  }

  getPlayerAreaManager(): PlayerAreaManager {
    return this._playerAreaManager;
  }

  getTableZoneManager(): TableZoneManager {
    return this._tableZoneManager;
  }

  isInsideDiscardZone(x: number, z: number, tolerance = 0): boolean {
    const discardPos = this._tableZoneManager.getDiscardPosition();
    const layout = this._tableZoneManager.getCurrentLayout();
    const width = layout?.discardZone.width ?? ZONE_VISUAL_CONFIG.DECK_WIDTH;
    const depth = layout?.discardZone.depth ?? ZONE_VISUAL_CONFIG.DECK_DEPTH;
    return (
      Math.abs(x - discardPos.x) <= width / 2 + tolerance &&
      Math.abs(z - discardPos.z) <= depth / 2 + tolerance
    );
  }

  isInsideDeckZone(x: number, z: number, tolerance = 0.5): boolean {
    const deckPos = this._tableZoneManager.getDeckPosition();
    const layout = this._tableZoneManager.getCurrentLayout();
    const width = layout?.deckZone.width ?? ZONE_VISUAL_CONFIG.DECK_WIDTH;
    const depth = layout?.deckZone.depth ?? ZONE_VISUAL_CONFIG.DECK_DEPTH;
    return (
      Math.abs(x - deckPos.x) <= width / 2 + tolerance &&
      Math.abs(z - deckPos.z) <= depth / 2 + tolerance
    );
  }

  getDiscardStack(): CardStack | null {
    if (this._discardStackId) {
      const stack = this._stackManager.getStack(this._discardStackId);
      if (stack && stack.getCount() > 0) {
        return stack;
      }
      this._discardStackId = null;
    }
    const discardPos = this._tableZoneManager.getDiscardPosition();
    for (const stack of this._stackManager.getAllStacks()) {
      const sPos = stack.getPosition();
      if (Math.hypot(sPos.x - discardPos.x, sPos.z - discardPos.z) < 1.0) {
        this._discardStackId = stack.stackId;
        return stack;
      }
    }
    return null;
  }

  private _handleDropInDiscardZone(
    card: CardObject3D,
    isEntireStack: boolean,
    cardStack: CardStack | null
  ): void {
    const discardPos = this._tableZoneManager.getDiscardPosition();
    const existingDiscardStack = this.getDiscardStack();

    if (existingDiscardStack) {
      if (isEntireStack && cardStack) {
        if (cardStack.stackId === existingDiscardStack.stackId) {
          existingDiscardStack.setPosition(discardPos.x, discardPos.z);
          existingDiscardStack.realignCards();
          return;
        }
        this._stackManager.mergeStacks(cardStack, existingDiscardStack);
        this._discardStackId = existingDiscardStack.stackId;
        existingDiscardStack.setPosition(discardPos.x, discardPos.z);
        existingDiscardStack.realignCards();
        logger.info(
          `Merged stack "${cardStack.stackId}" into discard stack "${existingDiscardStack.stackId}" (total: ${existingDiscardStack.getCount()})`
        );
      } else {
        if (card.isInStack()) {
          this._stackManager.removeCardFromStack(card);
        }
        this._stackManager.addCardToStack(card, existingDiscardStack);
        this._discardStackId = existingDiscardStack.stackId;
        existingDiscardStack.setPosition(discardPos.x, discardPos.z);
        existingDiscardStack.realignCards();
        logger.info(
          `Added card "${card.cardId}" into discard stack "${existingDiscardStack.stackId}" (total: ${existingDiscardStack.getCount()})`
        );
      }
    } else {
      if (isEntireStack && cardStack) {
        cardStack.setPosition(discardPos.x, discardPos.z);
        cardStack.realignCards();
        this._discardStackId = cardStack.stackId;
        logger.info(`Stack "${cardStack.stackId}" established as discard stack`);
      } else {
        if (card.isInStack()) {
          this._stackManager.removeCardFromStack(card);
        }
        const allCards = this.getAllCards();
        const existingCard = allCards.find(
          (c) =>
            c.cardId !== card.cardId &&
            !c.isInStack() &&
            Math.hypot(c.position.x - discardPos.x, c.position.z - discardPos.z) < 1.5
        );

        if (existingCard) {
          const newStack = this._stackManager.createStack([existingCard, card]);
          newStack.setPosition(discardPos.x, discardPos.z);
          newStack.realignCards();
          this._discardStackId = newStack.stackId;
          logger.info(`Created discard stack "${newStack.stackId}" from 2 cards`);
        } else {
          const newStack = this._stackManager.createStack([card]);
          newStack.setPosition(discardPos.x, discardPos.z);
          newStack.realignCards();
          this._discardStackId = newStack.stackId;
          logger.info(`Created discard stack "${newStack.stackId}" for card "${card.cardId}"`);
        }
      }
    }
  }

  private _handleDropInHandZone(
    card: CardObject3D,
    targetHandZone: HandZoneObject3D,
    isEntireStack: boolean,
    cardStack: CardStack | null,
    followers: CardObject3D[]
  ): void {
    const insertIdx = targetHandZone.findInsertionIndex(card.position.x, card.position.z);
    const localPlayerIdx = this._activePlayerIndex ?? 0;
    const isTargetingOpponent = targetHandZone.playerIndex !== localPlayerIdx;

    if (isTargetingOpponent) {
      // M1.7.4: Request an authoritative transfer. Do not mutate zone membership
      // here; wait for the server confirmation and animate the accepted move.
      const transferCards = new Map<string, CardObject3D>();
      if (isEntireStack && cardStack) {
        for (const stackCard of cardStack.getCards()) {
          transferCards.set(stackCard.cardId, stackCard);
        }
      } else {
        transferCards.set(card.cardId, card);
        for (const follower of followers) transferCards.set(follower.cardId, follower);
      }

      for (const transferCard of transferCards.values()) {
        // M1.7.4.2: snapshot the authoritative rollback state. Preserve faceUp state.
        this._suppressDragEndIds.add(transferCard.cardId);
        if (this._sharedHandCards.has(transferCard.cardId) && transferCard.getHandZoneId() === targetHandZone.zoneId) {
          transferCard.setLayoutControlled(false);
          targetHandZone.arrangeCards();
          this.onCardTransferRequested?.(transferCard.cardId, targetHandZone.playerIndex, insertIdx);
          continue;
        }
        this._queuePendingHandTransfer(transferCard, targetHandZone.playerIndex);
        transferCard.setMasked(this._shouldMask('HAND', null, transferCard.isFaceUp()));
        this.onCardTransferRequested?.(transferCard.cardId, targetHandZone.playerIndex);
      }
      return;
    }

    card.setLayoutControlled(false);
    card.setMasked(this._shouldMask('HAND', this._localSessionId, card.isFaceUp()));

    if (card.isInHand()) {
      const oldHandId = card.getHandZoneId();
      if (oldHandId === targetHandZone.zoneId) {
        // Dragged within same hand zone — reorder
        targetHandZone.moveCard(card.cardId, insertIdx);
      } else {
        // Moved from another hand zone
        const oldZone = this._handZoneManager.getHandZone(oldHandId!);
        oldZone?.removeCard(card.cardId);
        this._cardRegistry.transferHandToHand(card.cardId, targetHandZone.zoneId);
        targetHandZone.addCard(card, insertIdx);
      }
    } else {
      // Dragged from table / stack into hand zone
      if (isEntireStack && cardStack) {
        const stackCards = [...cardStack.getCards()];
        this._stackManager.dissolveStack(cardStack.stackId);
        for (let i = 0; i < stackCards.length; i++) {
          const c = stackCards[i]!;
          c.setLayoutControlled(false);
          c.setMasked(this._shouldMask('HAND', this._localSessionId, c.isFaceUp()));
          this._cardRegistry.transferTableToHand(c.cardId, targetHandZone.zoneId);
          targetHandZone.addCard(c, insertIdx + i);
        }
      } else {
        if (cardStack) {
          this._stackManager.removeCardFromStack(card);
        }
        this._cardRegistry.transferTableToHand(card.cardId, targetHandZone.zoneId);
        targetHandZone.addCard(card, insertIdx);
      }
    }

    // Process any group followers
    for (let i = 0; i < followers.length; i++) {
      const follower = followers[i]!;
      follower.setLayoutControlled(false);
      follower.setMasked(this._shouldMask('HAND', this._localSessionId, follower.isFaceUp()));
      if (follower.isInHand()) {
        const fOldZone = this._handZoneManager.getHandZone(follower.getHandZoneId()!);
        fOldZone?.removeCard(follower.cardId);
        this._cardRegistry.transferHandToHand(follower.cardId, targetHandZone.zoneId);
      } else {
        if (follower.isInStack()) {
          this._stackManager.removeCardFromStack(follower);
        }
        this._cardRegistry.transferTableToHand(follower.cardId, targetHandZone.zoneId);
      }
      targetHandZone.addCard(follower, insertIdx + 1 + i);
    }
  }

  /**
   * Detaches a card from layout control while its transfer is awaiting server
   * authorization. The card keeps its current world transform; source layout
   * closes immediately so it cannot be pulled back to its old slot.
   */
  private _queuePendingHandTransfer(card: CardObject3D, targetPlayerIndex?: number): void {
    if (this._pendingTransfers.has(card.cardId)) return;

    const sourceZone = card.isInHand()
      ? this._handZoneManager.getHandZone(card.getHandZoneId()!)
      : null;
    const sourceIndex = sourceZone ? sourceZone.getCardIndex(card.cardId) : -1;

    this._pendingTransfers.set(card.cardId, {
      cardId: card.cardId,
      sourceZoneId: sourceZone?.zoneId ?? null,
      sourceIndex,
      targetPlayerIndex,
      originalPosition: card.position.clone(),
      originalRotation: card.rotation.clone(),
      originalScale: card.scale.clone(),
      originalFaceUp: card.isFaceUp(),
      originalMasked: card.isMasked(),
      wasInHand: sourceZone !== null,
    });

    if (sourceZone) {
      sourceZone.removeCard(card.cardId);
      sourceZone.arrangeCards();
    }
    card.setLayoutControlled(true);
    this.requestRender();
  }

  /**
   * Rebuilds the 3D table shape, repositions player areas, sets up table zones,
   * and adaptively zooms camera (M1.4.1 / M1.4.2).
   */
  rebuildTable(playerCount: PlayerCount, labels?: string[]): void {
    this._activePlayerCount = playerCount;

    // 1. Rebuild table geometry & legs
    this._table.rebuild(playerCount);

    const shapeParams = this._table.currentParams;
    const outerRadius = getTableOuterRadius(shapeParams);

    // 2. Setup table zones (Deck Zone, Discard Zone, Card Placement Zones)
    this._tableZoneManager.setupZones(playerCount, shapeParams.circumradius);

    // 3. Move demo_deck to adapted deck zone position if present
    const demoDeck = this.getObject('demo_deck') as DeckObject3D | undefined;
    if (demoDeck) {
      const deckPos = this._tableZoneManager.getDeckPosition();
      demoDeck.position.set(deckPos.x, TABLE_CONFIG.SURFACE_Y, deckPos.z);
    }

    const actionAnchor = this._tableZoneManager.getDeckPosition();
    this.tableActions.setAnchor(actionAnchor.x, actionAnchor.z, this._cameraController.getTheta());

    // 3b. Reposition discard stack if present (M1.4.3)
    const discardStack = this.getDiscardStack();
    if (discardStack) {
      const discardPos = this._tableZoneManager.getDiscardPosition();
      discardStack.setPosition(discardPos.x, discardPos.z);
      discardStack.realignCards();
    }

    // 4. Reposition player areas along perimeter
    this._playerAreaManager.setupLayout(playerCount, labels, shapeParams.circumradius);

    // 4b. Rebuild hand zones and migrate existing cards into new layout (M1.5.0)
    this._handZoneManager.rebuildHandZones(playerCount, labels, shapeParams.circumradius);

    // 5. Adaptively adjust camera radius based on actual table outer radius and viewport aspect
    const cameraAspect = this._renderer.getCamera().aspect;
    const computedCameraRadius = this._cameraController.computeAdaptiveRadius(
      outerRadius,
      cameraAspect
    );
    this._cameraController.setAdaptiveRadius(computedCameraRadius);

    // 6. Request frame render
    this.requestRender();

    logger.info('Table rebuilt and adaptively scaled', {
      playerCount,
      shapeType: shapeParams.shapeType,
      circumradius: shapeParams.circumradius,
      outerRadius,
      cameraRadius: computedCameraRadius,
    });
  }

  setupPlayerLayout(playerCount: PlayerCount, labels?: string[]): void {
    this.rebuildTable(playerCount, labels);
  }

  /**
   * Seats the local camera at its authoritative player index without enabling manual orbit.
   * M1.7.7 Part 1: re-applies the adaptive camera radius for the current table shape so the
   * full felt area stays in frame. The camera keeps the Offline table-centre target;
   * only its azimuth changes by seat so the Online P1 framing matches Offline P1.
   */
  setPlayerPerspective(playerIndex: number, playerCount: PlayerCount, animate = true, seatTransition = false): void {
    this._activePlayerIndex = playerIndex;
    this._activePlayerCount = playerCount;
    this.applyLocalPlayerPerspective(animate, seatTransition);
  }

  /**
   * M1.7.10: centralises the local-player camera perspective application so the
   * Online entry path and the manual reset share one source of truth.
   * Applies the seated perspective from the current scene state.
   */
  applyLocalPlayerPerspective(animate = true, seatTransition = false): void {
    const playerIndex = this._activePlayerIndex ?? 0;
    const playerCount = this._activePlayerCount;
    // M1.7.8: a seat change invalidates the old local-hand hover/fan state.
    this._resetLocalHandHover();
    this.onLocalHandChanged?.();
    const perspective = computePlayerPerspective(playerIndex, playerCount, this._table.currentParams.circumradius);
    const shapeParams = this._table.currentParams;
    const outerRadius = getTableOuterRadius(shapeParams);
    const cameraAspect = this._renderer.getCamera().aspect;
    const computedCameraRadius = this._cameraController.computeAdaptiveRadius(outerRadius, cameraAspect);
    this._cameraController.setAdaptiveRadius(computedCameraRadius);
    this._cameraController.setPlayerPerspective(perspective.theta, true, animate && seatTransition, SEAT_CHANGE.animationMs);
    const actionAnchor = this._tableZoneManager.getDeckPosition();
    this.tableActions.setAnchor(actionAnchor.x, actionAnchor.z, perspective.theta);
    // Offline starts from the table centre. Preserve that framing online and
    // rotate only around the centre for each local seat.
    const tableTarget = new THREE.Vector3(0, TABLE_CONFIG.SURFACE_Y, 0);
    this._cameraController.setTarget(tableTarget);
    this._cameraController.setDefaultTarget(tableTarget);
    this._handZoneManager.setLocalPlayerIndex(playerIndex);
    this.requestRender();
    logger.info('SceneManager: Player perspective set', {
      playerIndex,
      playerCount,
      cameraRadius: computedCameraRadius,
      seat: perspective.seatPosition,
      target: tableTarget.toArray(),
    });
  }

  getActivePlayerIndex(): number | null {
    return this._activePlayerIndex;
  }

  // ─── M1.7.8: Local hand fan preview support ────────────────────────────────

  /** True when the card currently belongs to the local player's own hand. */
  isLocalHandCard(card: CardObject3D | DeckObject3D | null | undefined): boolean {
    if (this._roundSpectator || !(card instanceof CardObject3D) || card.isDisposed()) return false;
    if (!card.isInHand()) return false;
    const zoneId = card.getHandZoneId();
    if (!zoneId) return false;
    const zone = this._handZoneManager.getHandZone(zoneId);
    return !!zone && zone.playerIndex === (this._activePlayerIndex ?? 0);
  }

  /** Snapshot of the local player's hand, in authoritative HAND order. */
  getLocalHandCards(): CardObject3D[] {
    const zone = this.getLocalHandZone();
    if (!zone) return [];
    return zone.getCards().filter((card) => !card.isDisposed());
  }

  /** Local hand zone for operations that need to preserve authoritative card IDs/order. */
  getLocalHandZone(): HandZoneObject3D | undefined {
    return this._roundSpectator || this._roundSetup ? undefined : this._handZoneManager.getHandZoneForPlayer(this._activePlayerIndex ?? 0);
  }

  /** True while the pointer is on a card of the local player's hand. */
  isLocalHandHovered(): boolean {
    return this._localHandHovered;
  }

  /** True while a local-hand drag session is in progress (M1.7.10). */
  isLocalHandDragActive(): boolean {
    return this._localHandDragActive;
  }

  /** Keeps local hand hover/fan state alive during a screen-space reorder gesture. */
  setLocalHandFanDragActive(active: boolean): void {
    this._localHandDragActive = active;
    if (active) return;
    if (this._handPointer && this.isLocalHandPreviewOpen?.()) {
      // Đợi lá bài về slot mới trước khi đo vùng rê sau khi nhả chuột.
      if (this._handLeaveTimer !== null) clearTimeout(this._handLeaveTimer);
      this._handLeaveTimer = setTimeout(() => {
        this._handLeaveTimer = null;
        if (!this._localHandDragActive) this._updateLocalHandHover(null, true);
      }, SceneManager.HAND_PREVIEW_SETTLE_MS);
      return;
    }
    if (this._handPointer) {
      this._updateLocalHandHover(null);
      return;
    }
    if (this.getLocalHandCards().length > 0) {
      this._localHandHovered = true;
      this.onLocalHandHoverChanged?.(true);
    } else {
      this._updateLocalHandHover(null);
    }
  }

  private _updateLocalHandHover(card: CardObject3D | DeckObject3D | null, checkPreviewBoundary = false): void {
    const overHand = this._isPointerOverHandRegion();
    if (!overHand) this._handPreviewDismissed = false;
    const pointer = this._handPointer;
    const previewOpen = this.isLocalHandPreviewOpen?.() && pointer;
    const overPreview = pointer && this.getLocalHandCards().length > 0 &&
      this.isPointOverLocalHandPreview?.(pointer.clientX, pointer.clientY);
    if (checkPreviewBoundary && previewOpen && !overPreview && overHand) this._handPreviewDismissed = true;
    // Chỉ đóng vì rời biên khi có chuột thật, không đóng vì lá đang chuyển động vào fan.
    const next = previewOpen ? !!overPreview || (!checkPreviewBoundary && this._localHandHovered) :
      !this._handPreviewDismissed && (this.isLocalHandCard(card) || overHand || !!overPreview);
    if (next === this._localHandHovered) return;
    this._localHandHovered = next;
    this.onLocalHandHoverChanged?.(next);
  }

  private _isPointerOverHandRegion(): boolean {
    const pointer = this._handPointer;
    if (!pointer || this.getLocalHandCards().length === 0) return false;
    const point = this.getTableIntersectionAtScreenPos(pointer.clientX, pointer.clientY);
    return !!point && !!this.getLocalHandZone()?.containsPoint(point.x, point.z);
  }

  /** Resets the local hand hover presentation state (drag start / seat change). */
  private _resetLocalHandHover(): void {
    this._handPreviewDismissed = false;
    if (!this._localHandHovered) return;
    this._localHandHovered = false;
    this.onLocalHandHoverChanged?.(false);
  }

  togglePlayerAreas(): void {
    const newVisible = !this._playerAreaManager.isVisible();
    this._playerAreaManager.setAllVisible(newVisible);
  }

  /**
   * Raycasts the table plane (y=0) from a mouse event and returns
   * the PlayerAreaObject3D under the cursor, or null.
   */
  findPlayerAreaAtScreenPos(event: MouseEvent): PlayerAreaObject3D | null {
    const domEl = this._renderer.getDomElement();
    const rect = domEl.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._renderer.getCamera());

    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(tablePlane, hitPoint);
    if (!hit) return null;

    return this._playerAreaManager.findAreaAtPoint(hitPoint.x, hitPoint.z);
  }

  /**
   * Raycasts the table surface plane (y=0) at the given screen coordinates.
   * Returns world {x, z} coordinates on the tabletop, or null if no hit or outside valid interaction bounds. (M1.5.3 / M1.7.3 Fix)
   */
  getTableIntersectionAtScreenPos(clientX: number, clientY: number): { x: number; z: number } | null {
    if (!this._updateTablePointerRay(clientX, clientY)) return null;
    return this._getTablePointerHit();
  }

  private _updateTablePointerRay(clientX: number, clientY: number): boolean {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

    const domEl = this._renderer.getDomElement();
    const rect = domEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._tablePointerNdc.set(ndcX, ndcY);
    this._tablePointerRaycaster.setFromCamera(this._tablePointerNdc, this._renderer.getCamera());
    return true;
  }

  private _getTablePointerHit(): { x: number; z: number } | null {
    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    const hit = this._tablePointerRaycaster.ray.intersectPlane(tablePlane, hitPoint);
    if (!hit) return null;

    if (!Number.isFinite(hitPoint.x) || !Number.isFinite(hitPoint.z)) return null;

    // Maximum interaction area: tabletop with rail and player areas extends to ~22 units radius.
    // Rays grazing the horizon produce gigantic values (thousands). Safe ceiling: 35.0 (well within server [-50, 50]).
    const MAX_TABLE_INTERACTION_RADIUS = 35.0;
    if (Math.abs(hitPoint.x) > MAX_TABLE_INTERACTION_RADIUS || Math.abs(hitPoint.z) > MAX_TABLE_INTERACTION_RADIUS) {
      return null;
    }

    return { x: hitPoint.x, z: hitPoint.z };
  }

  /**
   * Sets up mousemove and click listeners for PlayerArea hover/select.
   * Does NOT modify RaycastInteractionManager to avoid breaking Card/Deck interaction.
   */

  describeSeat?: (index: number) => string | undefined;
  onChooseSeat?: (index: number) => void;

  getSeatAt(event: MouseEvent): number {
    const area = this.findPlayerAreaAtScreenPos(event);
    return area ? this._playerAreaManager.getAllAreas().indexOf(area) : -1;
  }

  private _setupPlayerAreaInteraction(): void {
    const domEl = this._renderer.getDomElement();
    const signal = this._playerAreaAbortController.signal;
    let _clickStartX = 0;
    let _clickStartY = 0;
    const CLICK_THRESHOLD = 5;

    domEl.addEventListener('mousemove', (e: MouseEvent) => {

      if (this.isLocalHandPreviewOpen?.() || this._dragController.isDragging() || this._interactionManager.getHoveredObject() !== null) {
        domEl.title = '';
        this._playerAreaManager.hoverArea(null);
        return;
      }
      const area = this.findPlayerAreaAtScreenPos(e);

      const index = area ? this._playerAreaManager.getAllAreas().indexOf(area) : -1;
      const title = index >= 0 ? this.describeSeat?.(index) : undefined;
      domEl.title = title ?? '';
      this._playerAreaManager.hoverArea(area && (title || !this._onlineCardRoomId) ? area.areaId : null);
    }, { signal });

    domEl.addEventListener('mousedown', (e: MouseEvent) => {
      _clickStartX = e.clientX;
      _clickStartY = e.clientY;
    }, { signal });

    domEl.addEventListener('click', (e: MouseEvent) => {
      const dx = e.clientX - _clickStartX;
      const dy = e.clientY - _clickStartY;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) return;

      if (this.isLocalHandPreviewOpen?.() || this._dragController.isDragging() ||
        this._interactionManager.getObjectAt(e.clientX, e.clientY) || this.tableActions.hitsAt(e) || this.deckViewRow.hitsAt(e)) return;

      const area = this.findPlayerAreaAtScreenPos(e);
      if (this._onlineCardRoomId) {
        if (area) this.onChooseSeat?.(this._playerAreaManager.getAllAreas().indexOf(area));
        return;
      }
      if (area) {
        this._playerAreaManager.selectArea(area.areaId);
      } else {
        this._playerAreaManager.deselectAll();
      }
    }, { signal });
  }

  // ── M1.5.3: Remote Drag Sync ────────────────────────────────────────────

  private readonly _remoteDragSeq = new Map<string, number>();

  /**
   * Called when a remote player begins dragging an object.
   * Lifts the card visually to indicate it is being moved.
   */
  onRemoteDragStart(objectId: string, pos: { x: number; y: number; z: number }): void {
    if (this._dragController.isDragging() && this._dragController.getDraggedCard()?.cardId === objectId) {
      return;
    }
    if (this.isCardTransferAnimating(objectId)) return;

    const card = this._cardRegistry.getCardObject(objectId);
    if (!card || card.isDisposed() || card.isLayoutControlled()) return;

    // M1.7.4: hand transforms are private presentation data. Never drive an
    // in-hand card from a remote raw drag position.
    if (card.isInHand()) return;

    card.position.set(pos.x, pos.y, pos.z);
    this.requestRender();
    logger.debug('Remote drag start', { objectId, pos });
  }

  /**
   * Called during a remote drag move — smoothly repositions the card.
   */
  onRemoteDragMove(objectId: string, pos: { x: number; y: number; z: number }, seq?: number): void {
    if (this._dragController.isDragging() && this._dragController.getDraggedCard()?.cardId === objectId) {
      return;
    }
    if (this.isCardTransferAnimating(objectId)) return;

    if (seq !== undefined) {
      const lastSeq = this._remoteDragSeq.get(objectId) ?? 0;
      if (seq < lastSeq) return;
      this._remoteDragSeq.set(objectId, seq);
    }
    const card = this._cardRegistry.getCardObject(objectId);
    if (!card || card.isDisposed() || card.isLayoutControlled()) return;

    // Hand cards keep their authoritative hand slot; raw remote hand drag
    // positions are intentionally ignored.
    if (card.isInHand()) return;

    card.position.set(pos.x, pos.y, pos.z);
    this.requestRender();
  }

  /**
   * Called when a remote drag ends — snaps card to final position and updates face orientation.
   * M1.7.5 Part 2/3: `rotation` carries the actor's authoritative table yaw
   * (seat default at HAND→TABLE, or the current manual yaw for table drags).
   */
  onRemoteDragEnd(
    objectId: string,
    pos: { x: number; y: number; z: number },
    faceUp?: boolean,
    seq?: number,
    rotation?: number,
    authoritativeTable = false,
  ): void {
    if (seq !== undefined) {
      const lastSeq = this._remoteDragSeq.get(objectId) ?? 0;
      if (seq < lastSeq) return;
      this._remoteDragSeq.set(objectId, seq);
    }

    if (this._dragController.isDragging() && this._dragController.getDraggedCard()?.cardId === objectId) {
      return;
    }

    // An authorized transfer/room-state path already owns this card.
    if (this.isCardTransferAnimating(objectId)) return;

    const targetHand = authoritativeTable ? undefined : this._handZoneManager.findHandZoneAtPoint(pos.x, pos.z);
    let card = this._cardRegistry.getCardObject(objectId);

    if (targetHand) {
      if (card && card.getHandZoneId() === targetHand.zoneId) {
        // Already in the authoritative slot: reconcile privacy and re-arrange.
        const targetOwnerId = targetHand.playerIndex === this._activePlayerIndex ? this._localSessionId : null;
        this._applyHandPrivacy(card, 'HAND', targetOwnerId, undefined, faceUp ?? card.isFaceUp());
        card.setLayoutControlled(false);
        targetHand.arrangeCards();
        this.requestRender();
        logger.debug('Remote drag end reconciled in hand', { objectId, zoneId: targetHand.zoneId });
        return;
      }

      // Legacy/defensive path: never write a raw hand coordinate. Reuse the
      // single transfer animator so the card lands on the exact hand slot.
      this.syncTransferredCard(
        objectId,
        -1,
        targetHand.playerIndex,
        undefined,
        faceUp ?? false,
        seq
      );
      return;
    }

    if (!card) {
      card = new CardObject3D({
        id: objectId,
        title: 'Card',
        position: { x: pos.x, y: pos.y, z: pos.z },
        faceUp: faceUp ?? true,
      });
      if (rotation !== undefined) card.rotation.set(0, rotation, 0);
      this._cardRegistry.registerTableCard(card);
      this.addObject(objectId, card);
      this._interactionManager.registerObject(objectId, card);
      this.requestRender();
      return;
    }

    if (card.isDisposed() || card.isLayoutControlled()) return;

    const wasInHand = card.isInHand();
    if (wasInHand) {
      const oldHand = this._handZoneManager.getHandZone(card.getHandZoneId()!);
      oldHand?.removeCard(card.cardId);
      if (this._cardRegistry.hasCard(card.cardId)) {
        try { this._cardRegistry.transferHandToTable(card.cardId); } catch {}
      }
      // M1.7.5 Part 1: the hand's elevated layer/renderOrder must not survive;
      // the animator owns transform, the LayeringManager owns layer order.
      // Any observer-side hover on this card is dropped as well.
      this._interactionManager.clearHoverForObject(card);
      // M1.7.6: table cards are unowned — never keep the old hand owner.
      card.setOwnerId(null);
      card.rotation.order = 'XYZ';
      card.setLayerIndex(0);
      this._layeringManager.syncCards(this.getAllCards());
    }

    card.setMasked(this._shouldMask('TABLE', null, faceUp ?? card.isFaceUp()));
    if (faceUp !== undefined) card.setFaceUp(faceUp);

    const yaw = rotation ?? 0;
    if (wasInHand) {
      // Preserve the current world transform, then animate to the public table
      // destination. The transfer animator is the only writer until completion.
      const destination = {
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'XYZ')),
        scale: new THREE.Vector3(1, 1, 1),
      };
      this._transferAnimator.start({
        card,
        getTarget: () => destination,
        onComplete: () => {
          card!.position.copy(destination.position);
          card!.quaternion.copy(destination.quaternion);
          card!.scale.copy(destination.scale);
          card!.rotation.order = 'XYZ';
          card!.setLayoutControlled(false);
          this.requestRender();
        },
      });
    } else {
      card.position.set(pos.x, pos.y, pos.z);
      // M1.7.5: apply the authoritative yaw only when the sender provided one
      // (drag-end always does; legacy senders without rotation are ignored).
      if (rotation !== undefined) {
        card.rotation.order = 'XYZ';
        card.rotation.set(0, yaw, 0);
      }
    }

    this.requestRender();
    logger.debug('Remote drag end', { objectId, pos, faceUp });
  }

  // ── M1.5.3: Card Owner Tagging (for HoverExpansionController) ───────────

  /**
   * Attaches an ownerId to a CardObject3D instance so HoverExpansionController
   * can determine whether a hovered card belongs to the local player.
   * Uses a lightweight property on the card object (not stored in CardRegistry).
   */
  setCardOwnerId(card: { _ownerId?: string | null }, ownerId: string | null): void {
    card._ownerId = ownerId;
  }

  dispose(): void {
    this._running = false;
    this._localHandHovered = false;
    this._resizeAbortController.abort();
    if (this._handLeaveTimer !== null) clearTimeout(this._handLeaveTimer);
    this.isLocalHandPreviewOpen = null;
    this._playerAreaAbortController.abort();
    this.onDeckCountChanged = null;
    this.onCardTransferRequested = null;
    this.onLocalHandHoverChanged = null;
    this.onLocalHandChanged = null;
    this.isPointOverLocalHandPreview = null;
    this.remoteDragPreview.clear();
    this._discardDisplay?.removeFromParent();
    this._discardDisplay?.dispose();
    this.deckViewRow.dispose();
    this.tableRollEffects.dispose();
    this._transferAnimator.dispose();
    this._pendingTransfers.clear();
    this._lastTransferSeq.clear();
    this._suppressDragEndIds.clear();
    this._remoteDragSeq.clear();
    this._tableZoneManager.dispose();
    this._playerAreaManager.dispose();
    this._handZoneManager.dispose();
    this._stackManager.dispose();
    this._layeringManager.dispose();
    this._dragController.dispose();
    this._interactionManager.dispose();
    this._table.dispose();
    this._lightingManager.dispose();
    this._cameraController.dispose();
    this._renderer.dispose();
    this._cardRegistry.clear();
    this._registeredObjects.forEach((obj) => {
      if ('dispose' in obj && typeof (obj as { dispose: () => void }).dispose === 'function') {
        (obj as { dispose: () => void }).dispose();
      }
    });
    this._registeredObjects.clear();
    logger.info('SceneManager disposed');
  }
}
