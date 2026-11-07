/**
 * App.ts — Root Application Controller
 * Coordinates: SceneManager, UIManager, NetworkClient
 */
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
import type { PlayerCount } from '../objects/TableShapeConfig';
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

    // Wire table pointer tracking for cursor broadcaster (M1.5.3)
    canvasContainer.addEventListener('mousemove', (e) => {
      if (this._store.getRoomId()) {
        const hit = this._sceneManager.getTableIntersectionAtScreenPos(e.clientX, e.clientY);
        if (hit) {
          this._cursorBroadcaster.onCursorMoved(hit.x, hit.z);
        }
      }
    });

    // Wire multiplayer real-time drag sync (M1.5.3)
    const dragCtrl = this._sceneManager.getDragController();
    dragCtrl.onDragStartBroadcast = (objectId, pos) => {
      this._hoverExpansionController.cancelExpansion();
      if (this._store.getRoomId()) {
        this._networkClient.send({
          type: 'object:drag-start',
          payload: { objectId, x: pos.x, y: pos.y, z: pos.z, seq: Date.now() },
        });
      }
    };
    dragCtrl.onDragMoveBroadcast = (objectId, pos) => {
      if (this._store.getRoomId()) {
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
          payload: { objectId, x: pos.x, y: pos.y, z: pos.z, seq: Date.now(), faceUp, targetPlayerIndex, rotation },
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
      onCardDragStart: (sourceCardId, event) => {
        const card = this._sceneManager.getObject(sourceCardId) as CardObject3D | undefined;
        if (!card) return;
        // M1.7.10: mark the fan card as dragging while the fan drag pipeline runs;
        // the fan preview itself stays open during the whole drag.
        this._fullHandFanPreviewUI.setDraggingSourceId(sourceCardId);
        this._sceneManager.getDragController().beginDrag(card, event);
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
      this._fullHandFanPreviewUI.containsPoint(clientX, clientY);

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
          masked: card.isMasked(),
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
          masked: card.isMasked(),
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
    this._playerAreaHUD.onSetPlayerCount = (count) => {
      this._sceneManager.setupPlayerLayout(count);
      this._playerAreaHUD.setPlayerCount(count);
    };
    this._playerAreaHUD.onToggleVisibility = () => {
      this._sceneManager.togglePlayerAreas();
    };
    // Initialize with 4 players by default
    this._sceneManager.setupPlayerLayout(4);

    this._networkClient.onMessage = (msg) => this._messageHandler.handle(msg);
    this._networkClient.onConnectionChange = (status) => {
      this._uiManager.updateConnectionStatus(status);
      this._store.setConnectionStatus(status);
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
          payload: { cardId, targetPlayerIndex, seq: Date.now() },
        });
      } else {
        // Single-player sandbox: no server exists, so commit locally.
        this._sceneManager.completePendingTransferLocally(cardId, targetPlayerIndex);
      }
    };
    this._messageHandler.onRejection = (objectId, code) => {
      this._sceneManager.handleServerRejection(objectId, code);
      // M1.7.5 Part 3: a rejected drag-end may have applied a local yaw the
      // server refused — restore the authoritative rotation from the store.
      const authoritative = this._store.getRoomState()?.objects.find((o) => o.id === objectId);
      if (authoritative && authoritative.location === 'TABLE') {
        this._sceneManager.applyAuthoritativeRotation(objectId, authoritative.rotation);
      }
    };
    this._messageHandler.onError = (msg) => {
      this._uiManager.showLobbyError(msg);
    };

    // Wire Room Create / Join / Leave (M1.5.1)
    this._uiManager.onCreateRoomRequested = (roomName, playerName, maxPlayers) => {
      this._store.setPlayerName(playerName);
      this._networkClient.send({
        type: 'room:create',
        payload: { roomName, maxPlayers },
      });
    };

    this._uiManager.onJoinRoomRequested = (roomId, playerName) => {
      this._store.setPlayerName(playerName);
      this._networkClient.send({
        type: 'room:join',
        payload: { roomId, playerName },
      });
    };

    this._uiManager.onToLobbyRequested = () => {
      if (this._store.getRoomId()) {
        this._networkClient.send({ type: 'room:leave' });
        this._store.clearRoom();
      }
      this._cursorBroadcaster.disable();
      this._remoteCursorManager.removeAllCursors();
      this._hoverExpansionController.cancelExpansion();
      this._lastConfiguredPlayerCount = null;
      this._lastConfiguredCameraKey = null;
      this._sceneManager.setPlayerPerspective(0, 4, false);
    };

    // Wire UI actions to SceneManager
    this._uiManager.onResetCameraRequested = () => {
      // M1.7.10 Part C: same seated-perspective path as Online initial entry.
      this._sceneManager.applyLocalPlayerPerspective(true);
    };

    // Suppress camera reset key when a card is selected (so R key rotates the card instead)
    this._sceneManager.getCameraController().shouldHandleResetKey = () => {
      const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
      return selectedCards.length === 0;
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

    // Wire insertion mode changes between UI and SceneManager (M1.3.4.5)
    this._uiManager.onSetInsertionModeRequested = (mode, customVal) => {
      this._sceneManager.setInsertionMode(mode, customVal);
    };

    this._uiManager.onRequestCustomModal = () => {
      const origDeck = this._sceneManager.getOriginalDeck();
      const maxCount = origDeck ? origDeck.getCount() : 30;
      this._insertionModal.show({
        title: 'Vị trí chèn tùy chọn (Toolbar)',
        description: 'Số lá bài nằm phía trên vị trí chèn (0 = Trên cùng, 1 = Dưới 1 lá, ...):',
        currentCount: maxCount,
        initialValue: this._sceneManager.getCustomInsertionAboveCount(),
        onConfirm: (cardsAbove) => {
          this._sceneManager.setInsertionMode('CUSTOM', cardsAbove);
          this._uiManager.setInsertionModeState('CUSTOM', cardsAbove);
        },
      });
    };

    const flipTargetCard = (): void => {
      const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
      if (selectedCards.length > 0) {
        for (const card of selectedCards) {
          if (card.isDisposed()) continue;

          // M1.7.4.2: Free sandbox flip for any card in room (hand or table).
          card.animateFlipTo(!card.isFaceUp(), {
            requestRender: () => this._sceneManager.requestRender(),
          });

          if (this._store.getRoomId()) {
            this._networkClient.send({
              type: 'object:flip',
              payload: { objectId: card.cardId },
            });
          }
        }
        this._sceneManager.requestRender();
      }
    };

    this._uiManager.onFlipCardRequested = flipTargetCard;

    // Wire deck count changes from SceneManager to HUD
    this._sceneManager.onDeckCountChanged = (_deckId, count) => {
      this._uiManager.updateDeckCount(count);
    };

    const performDrawToHand = (): void => {
      if (this._store.getRoomId()) {
        this._networkClient.send({ type: 'card:draw' });
      } else {
        this._sceneManager.drawCardToHand('demo_deck_1', 0);
      }
    };

    // Wire "Draw to Hand" action (M1.5 / M1.5.1)
    this._uiManager.onDrawToHandRequested = performDrawToHand;

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
        if (selectedCards.length > 0) {
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

      const hovered = this._sceneManager.getInteractionManager().getHoveredObject();
      if (hovered && hovered instanceof CardObject3D && !hovered.isDisposed()) {
        e.preventDefault();

        // Ensure the hovered card is selected (so actions apply to it)
        if (!this._sceneManager.getInteractionManager().isSelected(hovered)) {
          this._sceneManager.getInteractionManager().selectObject(hovered);
        }

        const selectedCards = this._sceneManager.getInteractionManager().getSelectedCards();
        const isInStack = hovered.isInStack();
        const deck = this._sceneManager.getOriginalDeck();
        const deckAvailable = deck !== undefined && !deck.isDisposed();
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

    // Subscribe to room state changes to show game screen when room is joined
    this._store.subscribe(() => {
      const roomId = this._store.getRoomId();
      if (roomId) {
        if (this._uiManager.getCurrentScreen() !== 'game') {
          this._uiManager.show('game');
        }
        const roomState = this._store.getRoomState();
        const localPlayerId = this._store.getPlayerId();
        // A room ID can be set before the authoritative room snapshot arrives.
        // Do not commit a guessed seat/table layout as the camera baseline.
        const localPlayer = roomState?.players.find((player) => player.id === localPlayerId);
        if (!roomState || !localPlayer) return;
        const count = roomState?.maxPlayers ?? 4;
        const safeCount = Math.max(2, Math.min(8, count)) as PlayerCount;
        const playerIndex = Number.isInteger(localPlayer.playerIndex)
          ? localPlayer.playerIndex!
          : this._store.getPlayerIndex();

        // 1. Only rebuild table geometry if player count actually changed or first join
        const countChanged = safeCount !== this._lastConfiguredPlayerCount;
        if (countChanged) {
          this._lastConfiguredPlayerCount = safeCount;
          this._sceneManager.setupPlayerLayout(safeCount);
          this._playerAreaHUD.setPlayerCount(safeCount);
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
          this._sceneManager.syncRoomObjects(roomState.objects, roomState.players);
        }

        this._uiManager.updateRoomInfo(
          roomId,
          this._store.getPlayerName(),
          playerIndex,
          roomState?.players.length,
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
