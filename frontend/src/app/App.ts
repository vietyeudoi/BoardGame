/**
 * App.ts — Root Application Controller
 * Coordinates: SceneManager, UIManager, NetworkClient
 */
import type { DeckViewState } from '@shared/types/protocol';
import { DEFAULT_DECK_DRAW_END } from '@shared/types/room';
import { SceneManager } from '../scene/SceneManager';
import { UIManager } from '../ui/UIManager';
import { ContextMenu } from '../ui/ContextMenu';
import { InsertionModal } from '../ui/components/InsertionModal';
import { PlayerAreaHUD } from '../ui/PlayerAreaHUD';
import { NetworkClient } from '../network/NetworkClient';
import { MessageHandler } from '../network/MessageHandler';
import { ClientStore } from '../store/ClientStore';
import { CardObject3D } from '../objects/CardObject3D';
import { HoverExpansionController } from '../interaction/HoverExpansionController';
import { FullHandFanPreviewUI } from '../ui/components/FullHandFanPreviewUI';
import type { FanCardData } from '../ui/components/FullHandFanPreviewUI';
import { RemoteCursorManager } from '../scene/RemoteCursorManager';
import { CursorBroadcaster } from '../network/CursorBroadcaster';
import { getWebSocketUrl } from '../network/NetworkConfig';
import { normalizeWheelNotches } from '../interaction/InteractionConfig';
import { SHARED_CONFIG } from '../../../shared/constants/config';
import { resolveTableSeatCount, type PlayerCount } from '../objects/TableShapeConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('App');

export class App {
  private readonly _sceneManager: SceneManager;
  private readonly _uiManager: UIManager;
  private readonly _contextMenu: ContextMenu;
  private readonly _insertionModal: InsertionModal;
  private readonly _playerAreaHUD: PlayerAreaHUD;
  private readonly _networkClient: NetworkClient;
  private readonly _messageHandler: MessageHandler;
  private readonly _store: ClientStore;
  private readonly _hoverExpansionController: HoverExpansionController;
  private readonly _fullHandFanPreviewUI: FullHandFanPreviewUI;
  private readonly _remoteCursorManager: RemoteCursorManager;
  private readonly _cursorPointerListeners = new AbortController();
  private readonly _cursorBroadcaster: CursorBroadcaster;
  private _started = false;
  private _lastConfiguredPlayerCount: PlayerCount | null = null;
  private _lastConfiguredCameraKey: string | null = null;

  constructor(_container: HTMLElement) {
    this._store = new ClientStore();

    const canvasContainer = _container.querySelector<HTMLElement>('#canvas-container');
    const uiContainer = _container.querySelector<HTMLElement>('#ui-overlay');

    if (!canvasContainer || !uiContainer) {
      throw new Error('App: Required DOM containers (#canvas-container, #ui-overlay) not found');
    }

    this._sceneManager = new SceneManager(canvasContainer);
    this._uiManager = new UIManager(uiContainer, this._store);
    this._contextMenu = new ContextMenu(_container);
    this._insertionModal = new InsertionModal(_container);
    this._networkClient = new NetworkClient();
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) this._networkClient.disconnect();
    }, { signal: this._cursorPointerListeners.signal });
    this._messageHandler = new MessageHandler(this._store, this._sceneManager);

    // M1.5.3: Remote Cursor & Multiplayer Interaction managers
    this._remoteCursorManager = new RemoteCursorManager(this._sceneManager.getScene(), () =>
      this._sceneManager.requestRender()
    );
    this._messageHandler.remoteCursorManager = this._remoteCursorManager;
    this._cursorBroadcaster = new CursorBroadcaster(this._networkClient, this._store);
    this._hoverExpansionController = new HoverExpansionController(() =>
      this._sceneManager.requestRender()
    );

    // M1.7.6: the expansion presentation must use authoritative registry
    // location/ownership, never the stale `_ownerId` mirror on a card that
    // just left a hand for the table.
    this._hoverExpansionController.setEligibilityCheck((card) =>
      this._sceneManager.isTableCardOwnedByLocalPlayer(card)
    );

    // Wire local hover expansion for owned table cards (M1.5.3)
    this._sceneManager.getInteractionManager().onTableCardHoverChanged = (card, isHovering) => {
      const allCards = this._sceneManager.getCardRegistry().getCardsOnTable();
      this._hoverExpansionController.onTableCardHoverChanged(card, isHovering, allCards);
    };

    // Con trỏ trên bàn và trạng thái rê nút dùng hai kênh riêng.
    canvasContainer.addEventListener("mousemove", (event) => {
      if (!this._store.getRoomId()) return;
      const hit = this._sceneManager.getTableIntersectionAtScreenPos(event.clientX, event.clientY);
      if (hit) this._cursorBroadcaster.onCursorMoved(hit.x, hit.z);
    }, { signal: this._cursorPointerListeners.signal });
    this._sceneManager.tableActions.onDrawHover = (hovering) => {
      if (!this._store.getRoomId()) return;
      if (hovering) this._cursorBroadcaster.resetPosition();
      this._networkClient.send({ type: "draw:hover", payload: { hovering } });
    };
    this._messageHandler.onDrawHoverChanged = ({ playerId, playerName, hovering }) => {
      this._sceneManager.tableActions.updateRemoteHover(playerId, playerName, hovering);
    };

    // Wire multiplayer real-time drag sync (M1.5.3)
    const dragCtrl = this._sceneManager.getDragController();
    let previewDragId: number | undefined;
    let nextPreviewDragId = 0;
    let previewFrame: number | undefined;
    let lastPreviewMove = 0;
    const previewCards = new Set<string>();
    const previewPositions = () => dragCtrl.getDraggedCards().filter(card => previewCards.has(card.cardId)).map(card => ({
      objectId: card.cardId, x: card.position.x, y: Math.max(0, card.position.y), z: card.position.z,
      rotation: card.getRotationY(), faceUp: card.isFaceUp(),
    }));
    dragCtrl.onDragPreviewStart = () => {
      this._hoverExpansionController.cancelExpansion();
      const room = this._store.getRoomState();
      if (!room) return;
      for (const card of dragCtrl.getDraggedCards()) {
        if (room.objects.some(obj => obj.id === card.cardId && obj.type === "card")) previewCards.add(card.cardId);
      }
      if (!previewCards.size) return;
      previewDragId = ++nextPreviewDragId;
      this._networkClient.send({ type: "object:drag-preview", payload: { dragId: previewDragId, phase: "start", cards: previewPositions() } });
    };
    const flushPreviewMove = (now: number): void => {
      previewFrame = undefined;
      if (previewDragId === undefined) return;
      if (now - lastPreviewMove < 16) {
        previewFrame = requestAnimationFrame(flushPreviewMove);
        return;
      }
      lastPreviewMove = now;
      this._networkClient.send({ type: "object:drag-preview", payload: { dragId: previewDragId, phase: "move", cards: previewPositions() } });
    };
    dragCtrl.onDragPreviewMove = () => {
      if (previewDragId !== undefined && previewFrame === undefined) previewFrame = requestAnimationFrame(flushPreviewMove);
    };
    dragCtrl.onDragPreviewStop = () => {
      if (previewFrame !== undefined) cancelAnimationFrame(previewFrame);
      previewFrame = undefined;
      if (previewDragId !== undefined) this._networkClient.send({ type: "object:drag-preview-stop", payload: { dragId: previewDragId } });
      previewDragId = undefined;
      previewCards.clear();
    };
    dragCtrl.onDragStartBroadcast = (objectId, pos) => {
      this._hoverExpansionController.cancelExpansion();
      if (this._store.getRoomId() && !previewCards.has(objectId)) {
        this._networkClient.send({
          type: 'object:drag-start',
          payload: { objectId, x: pos.x, y: pos.y, z: pos.z, seq: Date.now() },
        });
      }
    };
    dragCtrl.onDragMoveBroadcast = (objectId, pos) => {
      if (this._store.getRoomId() && !previewCards.has(objectId)) {
        this._networkClient.send({
          type: 'object:drag-move',
          payload: { objectId, x: pos.x, y: pos.y, z: pos.z, seq: Date.now() },
        });
      }
    };
    dragCtrl.onDragEndBroadcast = (objectId, pos, faceUp, targetPlayerIndex, rotation) => {
      if (this._store.getRoomId()) {
        this._networkClient.send({
          type: 'object:drag-end',
          payload: { objectId, x: pos.x, y: pos.y, z: pos.z, seq: Date.now(), faceUp, targetPlayerIndex, rotation, dragId: previewCards.has(objectId) ? previewDragId : undefined },
        });
      }
    };

    // M1.7.8: screen-space Full Hand Fan Preview (overlay only, 3D hand untouched)
    this._fullHandFanPreviewUI = new FullHandFanPreviewUI(uiContainer);

    // M1.7.9 Part B: fan interactions delegate to the REAL card pipeline
    // (hover / select / drag) — no gameplay copy of the fan is created.
    this._fullHandFanPreviewUI.setHandlers({
      onCardHover: (sourceCardId) => {
        const card = this._sceneManager.getObject(sourceCardId) as CardObject3D | undefined;
        if (!card) return;
        // M1.7.9 Part B: forward the fan hover into the real hover pipeline
        // (hover highlight + local-hand fan boundary) via the interaction manager.
        this._sceneManager.getInteractionManager().setHoveredObject(card);
      },
      onCardSelect: (sourceCardId, addToSelection) => {
        const card = this._sceneManager.getObject(sourceCardId) as CardObject3D | undefined;
        if (!card) return;
        const interaction = this._sceneManager.getInteractionManager();
        if (addToSelection) {
          if (!interaction.isSelected(card)) interaction.selectObject(card, true);
        } else {
          const selectedCards = interaction.getSelectedCards();
          const isAloneSelected = selectedCards.length === 1 && selectedCards[0]!.cardId === card.cardId;
          if (isAloneSelected) {
            interaction.deselectObject(card);
          } else {
            interaction.selectObject(card, false);
          }
        }
        // M1.7.10: sync the fan selected visuals with the real selection state.
        this._fullHandFanPreviewUI.setSelectedSourceIds(
          interaction.getSelectedCards().map((c) => c.cardId)
        );
      },
      onCardDragStart: (sourceCardId, event, previewOffset) => {
        const card = this._sceneManager.getObject(sourceCardId) as CardObject3D | undefined;
        if (!card) return;
        const drag = this._sceneManager.getDragController();
        // Bài đang được server/animator giữ không được để lại cờ drag của fan.
        if (drag.canDragCard && !drag.canDragCard(card)) {
          this._fullHandFanPreviewUI.setDraggingSourceId(null);
          this._sceneManager.setLocalHandFanDragActive(false);
          return;
        }
        if (previewOffset) drag.beginPreviewDrag(card, event, previewOffset);
        else drag.beginDrag(card, event);
        if (drag.isDragging()) this._fullHandFanPreviewUI.closeAfterHandoff();
      },
      onCardReorder: (sourceCardId, targetIndex) => {
        const hand = this._sceneManager.getLocalHandZone();
        if (!hand || !hand.hasCard(sourceCardId)) return;
        const ids = hand.getCardIds();
        const sourceIndex = ids.indexOf(sourceCardId);
        if (sourceIndex < 0) return;
        ids.splice(sourceIndex, 1);
        ids.splice(Math.max(0, Math.min(ids.length, targetIndex)), 0, sourceCardId);
        hand.reorderCards(ids);
      },
      onFanDragStateChanged: (sourceCardId) => {
        void sourceCardId;
        this._sceneManager.setLocalHandFanDragActive(sourceCardId !== null);
      },
      onFanDragCancelled: (handedOff) => {
        if (handedOff) this._sceneManager.getDragController().cancelDrag();
        this._sceneManager.setLocalHandFanDragActive(false);
      },
    });

    // M1.7.10 Part A: the fan overlay is the Preview half of the HAND + Preview
    // interaction zone. SceneManager asks this when a drag ends so the fan closes
    // only when the pointer is outside both.
    this._sceneManager.isPointOverLocalHandPreview = (clientX, clientY) =>
      this._fullHandFanPreviewUI.containsPoint(clientX, clientY) ||
      (this._contextMenu.isOpen() && !!document.elementFromPoint?.(clientX, clientY)?.closest("#tabletop-context-menu"));
    this._sceneManager.isLocalHandPreviewOpen = () => this._fullHandFanPreviewUI.isOpen();

    // Wire local hand hover → open/close the full fan preview.
    this._sceneManager.onLocalHandHoverChanged = (hovering) => {
      if (!hovering) {
        this._fullHandFanPreviewUI.hide();
        return;
      }
      const hand = this._sceneManager.getLocalHandCards();
      if (hand.length === 0) {
        this._fullHandFanPreviewUI.hide();
        return;
      }
      this._fullHandFanPreviewUI.show(
        hand.map((card: CardObject3D): FanCardData => ({
          id: card.cardId,
          cardType: card.getCardType(),
          title: card.getContent().title ?? '',
          masked: card.isMasked() || !card.isFaceUp(),
        }))
      );
    };

    // M1.7.8: hand membership/order changes refresh the open fan preview.
    this._sceneManager.onLocalHandChanged = () => {
      if (!this._fullHandFanPreviewUI.isOpen()) return;
      const hand = this._sceneManager.getLocalHandCards();
      if (hand.length === 0) {
        this._fullHandFanPreviewUI.hide();
        return;
      }
      this._fullHandFanPreviewUI.show(
        hand.map((card: CardObject3D): FanCardData => ({
          id: card.cardId,
          cardType: card.getCardType(),
          title: card.getContent().title ?? '',
          masked: card.isMasked() || !card.isFaceUp(),
        }))
      );
    };

    // M1.7.5 Part 3: rotation sync via the existing object:move protocol.
    // Throttled per object (trailing) so wheel bursts and R quick-rotates cost
    // one message each; the server validates membership/lock and broadcasts
    // `object:moved` (sender excluded) to the other clients.
    const rotationMoveTimers = new Map<string, number>();
    this._sceneManager.onObjectsRotationChanged = (updates) => {
      if (!this._store.getRoomId()) return;
      const roomObjects = this._store.getRoomState()?.objects;
      for (const update of updates) {
        if (roomObjects && !roomObjects.some((o) => o.id === update.objectId)) continue;
        const pending = rotationMoveTimers.get(update.objectId);
        if (pending !== undefined) window.clearTimeout(pending);
        rotationMoveTimers.set(
          update.objectId,
          window.setTimeout(() => {
            rotationMoveTimers.delete(update.objectId);
            this._networkClient.send({
              type: 'object:move',
              payload: { objectId: update.objectId, position: update.position, rotation: update.rotation },
            });
            // The server excludes the sender from the `object:moved` echo, so
            // mirror the rotation into the local store here — otherwise the
            // sender's authoritative snapshot (used by rejection-restore)
            // would lag behind the value every other client already has.
            this._store.updateObjectPosition({
              id: update.objectId,
              position: update.position,
              rotation: update.rotation,
            });
          }, 80)
        );
      }
    };

    // M1.4.0: Player Area HUD
    this._playerAreaHUD = new PlayerAreaHUD(_container);
    this._playerAreaHUD.onToggleVisibility = () => {
      this._sceneManager.togglePlayerAreas();
    };
    // Khởi tạo bàn mặc định.
    this._sceneManager.setupPlayerLayout(SHARED_CONFIG.MAX_PLAYERS_PER_ROOM);


    let activeDeckView: DeckViewState | null = null;
    let pendingViewOrder: number[] | undefined;
    const applyDeckView = (view: DeckViewState | null): void => {
      activeDeckView = view;
      pendingViewOrder = undefined;
      const localId = this._store.getPlayerId();
      this._sceneManager.syncDeckView(view, localId);
      this._uiManager.updateDeckView(view, localId);
    };
    const submitViewOrder = (order: number[]): void => {
      if (!activeDeckView || pendingViewOrder || activeDeckView.viewerId !== this._store.getPlayerId()) return;
      pendingViewOrder = order;
      this._networkClient.send({ type: 'deck:view-order', payload: { id: activeDeckView.id, order } });
    };
    const closeDeckView = (confirm: boolean): void => {
      const view = activeDeckView;
      if (!view || view.viewerId !== this._store.getPlayerId()) return;
      const order = confirm ? pendingViewOrder ?? view.cards.map(card => card.token) : undefined;
      this._networkClient.send({ type: 'deck:view-close', payload: { id: view.id, order } });
    };
    this._messageHandler.onDeckView = applyDeckView;
    this._sceneManager.deckViewRow.onOrder = submitViewOrder;
    this._uiManager.onOrderDeckView = submitViewOrder;
    this._uiManager.onCloseDeckView = closeDeckView;
    this._uiManager.onSwapDeckView = (first, second) => {
      if (!activeDeckView || first === second) return;
      const order = activeDeckView.cards.map(card => card.token);
      if (order[first] === undefined || order[second] === undefined) return;
      [order[first], order[second]] = [order[second], order[first]];
      submitViewOrder(order);
    };
    this._sceneManager.tableActions.onSee = () => this._networkClient.send({ type: 'deck:view-open', payload: { mode: 'see' } });
    this._sceneManager.tableActions.onAlter = () => this._networkClient.send({ type: 'deck:view-open', payload: { mode: 'alter' } });
    this._networkClient.onMessage = (msg) => this._messageHandler.handle(msg);
    this._networkClient.onConnectionChange = (status) => {
      this._uiManager.updateConnectionStatus(status);
      this._store.setConnectionStatus(status);
      if (status !== "connected") {
        applyDeckView(null);
        this._sceneManager.tableActions.clearRemoteHover();
        this._sceneManager.remoteDragPreview.clear();
      }
    };

    // Wire multiplayer card draws and errors (M1.5.1)
    this._messageHandler.onCardDrawn = (card, playerIndex) => {
      this._sceneManager.syncDrawnCard(card.id, playerIndex, card.cardType, card.faceUp, card.ownerId ?? undefined);
    };
    // Wire multiplayer card transfers (M1.5.4 / M1.7.4)
    this._messageHandler.onCardTransferred = (payload) => {
      this._sceneManager.syncTransferredCard(
        payload.cardId,
        payload.fromPlayerIndex,
        payload.toPlayerIndex,
        payload.card.cardType,
        payload.card.faceUp,
        payload.seq,
        payload.card.handIndex,
        payload.card.ownerId ?? undefined
      );
    };
    this._sceneManager.onCardTransferRequested = (cardId, targetPlayerIndex) => {
      if (this._store.getRoomId()) {
        this._networkClient.send({
          type: 'card:transfer',
          payload: { cardId, targetPlayerIndex, seq: Date.now(), dragId: previewCards.has(cardId) ? previewDragId : undefined },
        });
      } else {
        // Single-player sandbox: no server exists, so commit locally.
        this._sceneManager.completePendingTransferLocally(cardId, targetPlayerIndex);
      }
    };
    const pendingFlips = new Set<string>();
    this._messageHandler.onFlipConfirmed = id => { pendingFlips.delete(id); };
    this._messageHandler.onRejection = (objectId, code) => {
      if ((code === "FLIP_REJECTED" || code === "INVALID_OPERATION" || code === "OBJECT_NOT_FOUND") && pendingFlips.delete(objectId)) {
        const object = this._store.getRoomState()?.objects.find(card => card.id === objectId);
        if (object) this._sceneManager.syncFlippedCard(objectId, object.faceUp, object.cardType, object.ownerId, object.location);
        return;
      }
      this._sceneManager.handleServerRejection(objectId, code);
      // M1.7.5 Part 3: a rejected drag-end may have applied a local yaw the
      // server refused — restore the authoritative rotation from the store.
      const room = this._store.getRoomState();
      const authoritative = room?.objects.find((o) => o.id === objectId);
      if (room && authoritative?.location === "HAND" && (code === "DRAG_END_FAILED" || code === "OBJECT_LOCKED")) {
        this._sceneManager.restoreRejectedHandDrop(authoritative, room.players);
      }
      if (authoritative && authoritative.location === 'TABLE') {
        if (code === "DRAG_END_FAILED" || code === "OBJECT_LOCKED" || code === "TRANSFER_FAILED" || code === "TARGET_PLAYER_NOT_FOUND") {
          this._sceneManager.restoreRejectedTableDrop(objectId, authoritative.position, authoritative.rotation);
        } else this._sceneManager.applyAuthoritativeRotation(objectId, authoritative.rotation);
      }
    };
    this._messageHandler.onError = (msg) => {
      pendingViewOrder = undefined;
      this._uiManager.showError(msg);
    };


    this._uiManager.onConfigureRound = setup => this._networkClient.send({ type: 'round:configure', payload: setup });
    this._uiManager.onDealRound = () => this._networkClient.send({ type: 'round:deal' });
    this._uiManager.onResetRound = () => this._networkClient.send({ type: 'round:reset' });

    // Wire Room Create / Join / Leave (M1.5.1)
    this._uiManager.onCreateRoomRequested = (roomName, playerName, doubleDeck) => {
      this._store.setPlayerName(playerName);
      this._networkClient.send({
        type: 'room:create',
        payload: { roomName, playerName, doubleDeck },
      });
    };

    this._uiManager.onJoinRoomRequested = (roomId, playerName) => {
      this._store.setPlayerName(playerName);
      this._networkClient.send({
        type: 'room:join',
        payload: { roomId, playerName },
      });
    };

    let customDrawRoomId: string | null = null;
    this._uiManager.onToLobbyRequested = () => {
      customDrawRoomId = null;
      applyDeckView(null);
      if (this._store.getRoomId()) {
        this._networkClient.send({ type: 'room:leave' });
        this._store.clearRoom();
        this._sceneManager.setCardRoom(null);
        this._uiManager.updateRound(undefined, false);
        this._uiManager.updateDeckControls();
        this._sceneManager.tableActions.setShuffleEnabled(false);
        this._sceneManager.tableActions.setViewEnabled(false);
        this._uiManager.updateRoomInfo(null, this._store.getPlayerName(), 0);
      }
      pendingFlips.clear();
      this._cursorBroadcaster.disable();
      this._remoteCursorManager.removeAllCursors();
      this._sceneManager.remoteDragPreview.clear();
      this._sceneManager.tableActions.clearRemoteHover();
      this._hoverExpansionController.cancelExpansion();
      this._lastConfiguredPlayerCount = null;
      this._lastConfiguredCameraKey = null;
      this._sceneManager.setupPlayerLayout(SHARED_CONFIG.MAX_PLAYERS_PER_ROOM);
      this._sceneManager.setPlayerPerspective(0, SHARED_CONFIG.MAX_PLAYERS_PER_ROOM, false);
    };

    // Wire UI actions to SceneManager
    this._uiManager.onResetCameraRequested = () => {
      // M1.7.10 Part C: same seated-perspective path as Online initial entry.
      this._sceneManager.applyLocalPlayerPerspective(true);
    };

    // Suppress camera reset key when a card is selected (so R key rotates the card instead)
    this._sceneManager.getCameraController().shouldHandleResetKey = () => {
      const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
      return selectedCards.length === 0 && !dragCtrl.isDragging();
    };

    // M1.7.5 Part 3: block camera zoom while the wheel is rotating a selected
    // table card; zoom stays completely normal otherwise (and always consumes
    // the wheel so the page never scrolls over the canvas).
    this._sceneManager.getCameraController().shouldHandleWheel = () =>
      !this._sceneManager.canRotateSelectionWithWheel();

    this._uiManager.onRotateCardRequested = () => {
      this._sceneManager.rotateSelectedCards(1);
    };

    this._uiManager.onStackCardsRequested = () => {
      this._sceneManager.stackSelectedCards();
    };


    const applyInsertionMode = (mode: ReturnType<SceneManager['getInsertionMode']>, cardsAbove?: number): void => {
      this._sceneManager.setInsertionMode(mode, cardsAbove);
      this._uiManager.setInsertionModeState(mode, cardsAbove);
    };
    this._uiManager.onSetInsertionModeRequested = (mode) => {
      if (mode === 'CUSTOM') return;
      if (this._store.getRoomId()) {
        customDrawRoomId = null;
        this._networkClient.send({ type: 'deck:set-draw-end', payload: { end: mode } });
      } else {
        applyInsertionMode(mode);
      }
    };


    const setOnlineDeckPosition = (position: number): void => {
      const room = this._store.getRoomState();
      if (!room?.deck || room.round?.phase !== 'PLAYING') return;
      const bounded = Math.max(1, Math.min(position, room.deck.count + 1));
      customDrawRoomId = room.id;
      applyInsertionMode('CUSTOM', bounded - 1);
      this._uiManager.updateDeckControls(room.deck, bounded);
    };
    this._uiManager.onDeckPosition = setOnlineDeckPosition;
    this._uiManager.onDeckAffectedCount = count => this._networkClient.send({
      type: 'deck:set-affected-count', payload: { count },
    });
    this._messageHandler.onDeckShuffled = playerName => this._uiManager.showDeckShuffle(playerName);
    this._sceneManager.tableActions.onShuffle = () => this._networkClient.send({ type: 'deck:shuffle' });
    this._sceneManager.onOnlineDeckInsert = cards => {
      const room = this._store.getRoomState();
      if (room?.round?.phase !== 'PLAYING' || cards.length > 30) return false;
      const cardIds = cards.map(card => card.cardId);
      const dragId = cardIds.every(id => previewCards.has(id)) ? previewDragId : undefined;
      const cardsAbove = customDrawRoomId === room.id ? this._sceneManager.getCustomInsertionAboveCount() : undefined;
      this._networkClient.send({ type: 'deck:insert', payload: { cardIds, dragId, cardsAbove } });
      return true;
    };
    this._uiManager.onRequestCustomModal = () => {
      if (this._store.getRoomState()?.deck) {
        setOnlineDeckPosition(this._sceneManager.getCustomInsertionAboveCount() + 1);
        return;
      }
      const origDeck = this._sceneManager.getOriginalDeck();
      const roomId = this._store.getRoomId();
      const maxCount = origDeck ? origDeck.getCount() : 30;
      this._insertionModal.show({

        title: roomId ? 'Vị trí lấy bài tùy chọn' : 'Vị trí chèn tùy chọn',
        description: roomId
          ? 'Số lá nằm phía trên lá muốn lấy (0 = lá trên cùng). Chỉ áp dụng cho bạn.'
          : 'Số lá bài nằm phía trên vị trí chèn (0 = Trên cùng, 1 = Dưới 1 lá, ...):',
        currentCount: roomId ? Math.max(0, maxCount - 1) : maxCount,
        initialValue: Math.min(this._sceneManager.getCustomInsertionAboveCount(), roomId ? Math.max(0, maxCount - 1) : maxCount),
        onConfirm: (cardsAbove) => {
          if (roomId !== this._store.getRoomId()) return;
          customDrawRoomId = roomId;
          applyInsertionMode('CUSTOM', cardsAbove);
        },
      });
    };

    const flipTargetCard = (): void => {
      const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
      if (selectedCards.length > 0) {
        for (const card of selectedCards) {
          if (card.isDisposed() || !this._sceneManager.canFlipCard(card)) continue;

          // M1.7.4.2: Free sandbox flip for any card in room (hand or table).
          this._sceneManager.syncFlippedCard(card.cardId, !card.isFaceUp(), undefined, undefined, undefined, false);
          if (dragCtrl.isDragging()) dragCtrl.onDragPreviewMove?.();

          if (this._store.getRoomId()) {
            pendingFlips.add(card.cardId);
            this._networkClient.send({
              type: 'object:flip',
              payload: { objectId: card.cardId },
            });
          }
        }
        this._sceneManager.onLocalHandChanged?.();
        this._sceneManager.requestRender();
      }
    };

    this._uiManager.onFlipCardRequested = flipTargetCard;

    // Wire deck count changes from SceneManager to HUD
    this._sceneManager.onDeckCountChanged = (_deckId, count) => {
      if (!this._store.getRoomId()) this._uiManager.updateDeckCount(count);
    };

    const performDrawToHand = (): void => {
      if (this._store.getRoomId()) {
        const state = this._store.getRoomState();
        if (state?.round?.phase === 'SETUP' || state?.players.find(player => player.id === this._store.getPlayerId())?.spectator) return;
        if (!this._sceneManager.getOriginalDeck()?.getCount()) return;
        this._networkClient.send({ type: 'card:draw' });
      } else {
        this._sceneManager.drawCardToHand('demo_deck_1', 0);
      }
    };

    // Wire "Draw to Hand" action (M1.5 / M1.5.1)

    this._sceneManager.onOnlineDeckClick = () => {
      // Tùy chọn chỉ đi kèm thao tác lấy của máy này, không đổi cài đặt phòng.
      if (customDrawRoomId !== null && customDrawRoomId === this._store.getRoomId()) {
        const count = this._sceneManager.getOriginalDeck()?.getCount() ?? 0;
        const cardsAbove = Math.min(this._sceneManager.getCustomInsertionAboveCount(), Math.max(0, count - 1));
        this._networkClient.send({ type: 'deck:take', payload: { cardsAbove } });
      } else {
        this._networkClient.send({ type: 'deck:take' });
      }
    };
    this._sceneManager.tableActions.onDraw = () => {
      if (this._uiManager.getCurrentScreen() === "game") performDrawToHand();
    };

    // M1.7.5 Part 3: mouse-wheel free rotation of the selected TABLE card(s).
    // Up = clockwise, down = counter-clockwise, 5°/notch (Shift = 1°).
    // passive:false → we can preventDefault to suppress zoom/page-scroll here
    // (the CameraController hook independently skips the zoom math).
    canvasContainer.addEventListener(
      'wheel',
      (e) => {
        if (this._uiManager.getCurrentScreen() !== 'game') return;
        if (!this._sceneManager.canRotateSelectionWithWheel()) return;
        e.preventDefault();
        const notches = normalizeWheelNotches(e.deltaY, e.deltaMode);
        this._sceneManager.rotateSelectionByWheel(notches, e.shiftKey);
      },
      { passive: false }
    );

    // Keyboard Shortcuts (F, R, Shift+R, H) — M1.7.5 Part 4: G removed with Snap-to-Grid

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeDeckView?.viewerId === this._store.getPlayerId()) {
        closeDeckView(false);
        return;
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (this._uiManager.getCurrentScreen() !== 'game') return;

      const key = e.key.toLowerCase();

      if (key === 'f') {
        flipTargetCard();
      } else if (key === 'r') {
        const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
        if (selectedCards.length > 0 || dragCtrl.isDragging()) {
          const dir = e.shiftKey ? -1 : 1;
          this._sceneManager.rotateSelectedCards(dir);
        }
      } else if (key === 'h') {
        performDrawToHand();
      }
    });

    // Right-click context menu over cards
    _container.addEventListener('contextmenu', (e) => {
      if (this._uiManager.getCurrentScreen() !== 'game') return;

      const fanCardId = e.target instanceof Element ? e.target.closest<HTMLElement>(".fhfp-card")?.dataset.fanCardId : undefined;
      const hovered = fanCardId ? this._sceneManager.getObject(fanCardId) : this._sceneManager.getInteractionManager().getHoveredObject();
      if (hovered && hovered instanceof CardObject3D && !hovered.isDisposed()) {
        e.preventDefault();

        // Ensure the hovered card is selected (so actions apply to it)
        if (!this._sceneManager.getInteractionManager().isSelected(hovered)) {
          this._sceneManager.getInteractionManager().selectObject(hovered);
        }


        if (this._sceneManager.isRoundSpectator) {
          this._contextMenu.show(e.clientX, e.clientY, [
            { label: 'Lật bài', icon: '🎴', shortcut: 'F', action: flipTargetCard },
          ]);
          return;
        }

        const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
        const isInStack = hovered.isInStack();
        const deck = this._sceneManager.getOriginalDeck();
        const deckAvailable = !this._store.getRoomId() && deck !== undefined && !deck.isDisposed();
        const deckCount = deck ? deck.getCount() : 0;
        const stackObj = isInStack
          ? this._sceneManager.getStackManager().getStack(hovered.getStackId()!) ?? null
          : null;
        const isEntireStack =
          stackObj !== null &&
          stackObj.getCards().every((c) => selectedCards.some((s) => s.cardId === c.cardId));

        this._contextMenu.show(e.clientX, e.clientY, [
          {
            label: 'Lật bài',
            icon: '🎴',
            shortcut: 'F',
            action: () => flipTargetCard(),
          },
          {
            label: 'Xoay 90° (Phải)',
            icon: '🔄',
            shortcut: 'R',
            action: () => this._sceneManager.rotateSelectedCards(1),
          },
          {
            label: 'Xoay 90° (Trái)',
            icon: '↩️',
            shortcut: 'Shift+R',
            action: () => this._sceneManager.rotateSelectedCards(-1),
          },
          {
            label: 'Đưa lên trên cùng',
            icon: '🔝',
            action: () => this._sceneManager.bringSelectedToFront(),
          },
          {
            label: 'Đưa xuống dưới cùng',
            icon: '🔻',
            action: () => this._sceneManager.sendSelectedToBack(),
          },
          {
            label: 'Xếp chồng bài',
            icon: '📦',
            disabled: selectedCards.length < 2,
            action: () => this._sceneManager.stackSelectedCards(),
          },
          {
            label: 'Rút bài trên cùng',
            icon: '📤',
            disabled: !isInStack,
            action: () => this._sceneManager.takeTopCardFromCard(hovered),
          },
          // M1.3.4.2: Stack-specific actions
          {
            label: 'Chọn toàn bộ Stack',
            icon: '🗂️',
            disabled: !isInStack,
            action: () => this._sceneManager.selectStack(hovered.getStackId()!),
          },
          {
            label: 'Tách bài khỏi Stack',
            icon: '✂️',
            disabled: !isInStack,
            action: () => this._sceneManager.removeCardFromStack(hovered),
          },
          {
            label: 'Giải phóng Stack',
            icon: '💥',
            disabled: !isInStack,
            action: () => this._sceneManager.dissolveStackForCard(hovered),
          },
          // M1.3.4.5: Stack In-Place Insertion
          {
            label: 'Chèn lên Đỉnh Stack',
            icon: '⬆️',
            disabled: !isInStack || !stackObj || stackObj.getCount() <= 1,
            action: () => {
              if (stackObj && stackObj.getCount() > 1) {
                stackObj.removeCard(hovered.cardId);
                stackObj.addCard(hovered);
                this._sceneManager.requestRender();
              }
            },
          },
          {
            label: 'Chèn xuống Đáy Stack',
            icon: '⬇️',
            disabled: !isInStack || !stackObj || stackObj.getCount() <= 1,
            action: () => {
              if (stackObj && stackObj.getCount() > 1) {
                stackObj.removeCard(hovered.cardId);
                stackObj.insertCardAt(hovered, 0);
                this._sceneManager.requestRender();
              }
            },
          },
          {
            label: 'Chèn vào Vị trí Stack...',
            icon: '🔢',
            disabled: !isInStack || !stackObj || stackObj.getCount() <= 1,
            action: () => {
              if (!stackObj) return;
              const remainingCount = stackObj.getCount() - 1;
              this._insertionModal.show({
                title: 'Chèn vào Vị trí trong Stack',
                description: 'Số lá bài nằm phía trên vị trí chèn (tính từ đỉnh xuống):',
                currentCount: remainingCount,
                onConfirm: (cardsAbove) => {
                  const internalIndex = this._sceneManager.cardsAboveToInternalIndex(
                    remainingCount,
                    cardsAbove
                  );
                  stackObj.removeCard(hovered.cardId);
                  stackObj.insertCardAt(hovered, internalIndex);
                  this._sceneManager.requestRender();
                },
              });
            },
          },
          // M1.3.4.5: Return to Original Deck
          {
            label: 'Trả về Chồng bài (Đỉnh)',
            icon: '📥',
            disabled: !deckAvailable,
            action: () => {
              if (isEntireStack && stackObj) {
                this._sceneManager.returnStackToDeck(stackObj.stackId, deck?.getId(), deckCount);
              } else {
                this._sceneManager.returnCardToDeck(hovered, deck?.getId(), deckCount);
              }
            },
          },
          {
            label: 'Trả về Chồng bài (Đáy)',
            icon: '⏬',
            disabled: !deckAvailable,
            action: () => {
              if (isEntireStack && stackObj) {
                this._sceneManager.returnStackToDeck(stackObj.stackId, deck?.getId(), 0);
              } else {
                this._sceneManager.returnCardToDeck(hovered, deck?.getId(), 0);
              }
            },
          },
          {
            label: 'Trả về Chồng bài (Vị trí...)',
            icon: '🎯',
            disabled: !deckAvailable,
            action: () => {
              if (!deck) return;
              this._insertionModal.show({
                title: 'Trả về Chồng bài bốc',
                description: 'Số lá bài nằm phía trên vị trí chèn (tính từ đỉnh xuống):',
                currentCount: deck.getCount(),
                onConfirm: (cardsAbove) => {
                  const internalIndex = this._sceneManager.cardsAboveToInternalIndex(
                    deck.getCount(),
                    cardsAbove
                  );
                  if (isEntireStack && stackObj) {
                    this._sceneManager.returnStackToDeck(stackObj.stackId, deck.getId(), internalIndex);
                  } else {
                    this._sceneManager.returnCardToDeck(hovered, deck.getId(), internalIndex);
                  }
                },
              });
            },
          },
        ]);
      }
    });

    let setupRoomId: string | null = null;
    // Subscribe to room state changes to show game screen when room is joined
    this._store.subscribe(() => {
      const roomId = this._store.getRoomId();
      if (roomId) {
        const roomState = this._store.getRoomState();
        const localPlayerId = this._store.getPlayerId();
        // A room ID can be set before the authoritative room snapshot arrives.
        // Do not commit a guessed seat/table layout as the camera baseline.
        const localPlayer = roomState?.players.find((player) => player.id === localPlayerId);
        if (!roomState || roomState.id !== roomId || !localPlayer) return;

        const setup = roomState.round?.phase === 'SETUP';
        const animateDeal = setupRoomId === roomId && roomState.round?.phase === 'PLAYING';
        setupRoomId = setup ? roomId : null;
        if (setup) {
          customDrawRoomId = null;
          pendingFlips.clear();
          this._insertionModal.hide();
          this._fullHandFanPreviewUI.hide(true);
          this._hoverExpansionController.cancelExpansion();
          this._sceneManager.tableActions.clearRemoteHover();
        }
        this._uiManager.updateRound(roomState.round, localPlayer.isHost, localPlayer.spectator);
        const drawEnd = roomState.deckDrawEnd ?? DEFAULT_DECK_DRAW_END;
        if (customDrawRoomId !== roomId && this._sceneManager.getInsertionMode() !== drawEnd) {
          applyInsertionMode(drawEnd);
        }
        this._sceneManager.setCardRoom(roomId, setup, localPlayer.spectator);
        if (this._uiManager.getCurrentScreen() !== "game") this._uiManager.show("game");
        const safeCount = resolveTableSeatCount(roomState.maxPlayers);
        const playerIndex = localPlayer.spectator ? 0 : Number.isInteger(localPlayer.playerIndex)
          ? localPlayer.playerIndex!
          : this._store.getPlayerIndex();

        // 1. Only rebuild table geometry if player count actually changed or first join
        const countChanged = safeCount !== this._lastConfiguredPlayerCount;
        if (countChanged) {
          this._lastConfiguredPlayerCount = safeCount;
          this._sceneManager.setupPlayerLayout(safeCount);
        }

        // M1.7.10: seat the local camera once per (room, seat, player-count) via the
        // centralised perspective application — guarantees the Online entry view is
        // correct from the first frame without waiting for a manual Reset Camera.
        const cameraKey = `${roomId}|${playerIndex}|${safeCount}`;
        const cameraKeyChanged = cameraKey !== this._lastConfiguredCameraKey;
        if (cameraKeyChanged) {
          this._lastConfiguredPlayerCount = safeCount;
          this._lastConfiguredCameraKey = cameraKey;
          this._sceneManager.setPlayerPerspective(playerIndex, safeCount, true);
        }

        this._sceneManager.setLocalSessionId(this._store.getPlayerId() ?? '');

        // 3. Enable cursor broadcasting & update local player ID (M1.5.3)
        this._cursorBroadcaster.enable();
        this._remoteCursorManager.setLocalPlayerId(this._store.getPlayerId());
        this._hoverExpansionController.setLocalPlayerId(this._store.getPlayerId());

        // 4. Synchronize all room state objects (cards on table, opponent/local hands)
        if (roomState?.objects) {
          if (roomState.handCounts) this._sceneManager.syncPrivateRoundObjects(roomState.objects, roomState.players, roomState.handCounts);
          else this._sceneManager.syncRoomObjects(roomState.objects, roomState.players);
          const count = roomState.deckCount ?? roomState.objects.filter((obj) => obj.type === "card" && obj.location === "DECK").length;

          this._sceneManager.setOnlineDeckCount(count, roomState.deck?.topCardType);
          const deck = roomState.round?.phase === 'PLAYING' ? roomState.deck : undefined;
          const position = customDrawRoomId === roomId && deck
            ? Math.min(this._sceneManager.getCustomInsertionAboveCount(), deck.count) + 1
            : undefined;
          if (position !== undefined && position - 1 !== this._sceneManager.getCustomInsertionAboveCount()) {
            applyInsertionMode('CUSTOM', position - 1);
          }
          this._uiManager.updateDeckControls(deck, position, localPlayer.spectator);
          this._sceneManager.tableActions.setShuffleEnabled(Boolean(deck && count > 1 && !localPlayer.spectator));
          this._sceneManager.tableActions.setViewEnabled(Boolean(deck && count > 0 && !localPlayer.spectator));
          if (animateDeal) this._sceneManager.animateRoundDeal();
          this._uiManager.updateDeckCount(count);
        }

        this._uiManager.updateRoomInfo(
          roomId,
          this._store.getPlayerName(),
          localPlayer.spectator ? -1 : playerIndex,
          roomState?.players.filter(player => !player.spectator).length,
          roomState?.maxPlayers
        );
      }
    });
  }

  start(): void {
    if (this._started) {
      logger.warn('App.start() called more than once — ignoring');
      return;
    }
    this._started = true;
    logger.info('Cat Boom Online starting (M1.5.1: Multiplayer Room & Private Hand)');
    this._sceneManager.start();
    this._uiManager.show('lobby');

    // Initiate WebSocket connection dynamically (M1.5.1)
    const wsUrl = getWebSocketUrl();
    this._networkClient.connect(wsUrl);

    logger.info('App started successfully, connecting to server', { wsUrl });
  }

  getSceneManager(): SceneManager {
    return this._sceneManager;
  }

  getUIManager(): UIManager {
    return this._uiManager;
  }

  dispose(): void {
    this._cursorPointerListeners.abort();
    this._cursorBroadcaster.dispose();
    this._remoteCursorManager.dispose();
    this._hoverExpansionController.dispose();
    this._networkClient.disconnect();
    this._insertionModal.dispose();
    this._contextMenu.dispose();
    this._playerAreaHUD.dispose();
    this._sceneManager.dispose();
    this._fullHandFanPreviewUI.dispose();
    this._uiManager.dispose();
    logger.info('App disposed');
  }
}
