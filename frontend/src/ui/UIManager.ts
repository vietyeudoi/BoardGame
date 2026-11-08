/**
 * UIManager.ts — HTML Overlay UI Controller
 * Manages screen transitions. Completely independent from Three.js scene.
 */
import type { TableRollKind } from '@shared/types/tableRoll';
import type { DeckViewState } from '@shared/types/protocol';
import type { DeckSetup, PublicDeckState, RoundSetup } from '@shared/types/room';
import type { ClientStore } from '../store/ClientStore';
import { LobbyScreen } from './LobbyScreen';
import { GameScreen } from './GameScreen';
import type { ConnectionStatus } from '../network/NetworkClient';
import type { InsertionMode } from '../interaction/InteractionConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('UIManager');

export type ScreenName = 'lobby' | 'game';

export class UIManager {
  private readonly _lobby: LobbyScreen;
  private readonly _game: GameScreen;
  private _currentScreen: ScreenName | null = null;

  public onOrderDeckView?: (order: number[]) => void;
  public onCloseDeckView?: (confirm: boolean) => void;
  public onSwapDeckView?: (first: number, second: number) => void;
  public onDeckAffectedCount?: (count: number) => void;
  public onDeckPosition?: (position: number) => void;
  public onConfigureRound?: (setup: DeckSetup) => void;
  public onDealRound?: () => void;
  public onResetRound?: () => void;
  onTableRoll?: (kind: TableRollKind) => void;
  onShuffleHand?: () => void;
  onGatherBombs?: () => void;
  public onResetCameraRequested: (() => void) | null = null;
  public onFlipCardRequested: (() => void) | null = null;
  public onRotateCardRequested: (() => void) | null = null;
  public onStackCardsRequested: (() => void) | null = null;
  public onSetInsertionModeRequested: ((mode: InsertionMode, customVal?: number) => void) | null = null;
  public onRequestCustomModal: (() => void) | null = null;
  public onCreateRoomRequested: ((roomName: string, playerName: string, doubleDeck: boolean) => void) | null = null;
  public onJoinRoomRequested: ((roomId: string, playerName: string) => void) | null = null;
  public onToLobbyRequested: (() => void) | null = null;

  constructor(
    private readonly _container: HTMLElement,
    _store: ClientStore
  ) {
    this._lobby = new LobbyScreen(this._container);
    this._game = new GameScreen(this._container);
    this._game.roundSetup.onConfigure = setup => this.onConfigureRound?.(setup);
    this._game.roundSetup.onDeal = () => this.onDealRound?.();
    this._game.deckAlterStrip.onOrder = order => this.onOrderDeckView?.(order);
    this._game.onCloseDeckView = confirm => this.onCloseDeckView?.(confirm);
    this._game.onSwapDeckView = (first, second) => this.onSwapDeckView?.(first, second);
    this._game.onDeckAffectedCount = count => this.onDeckAffectedCount?.(count);
    this._game.onDeckPosition = position => this.onDeckPosition?.(position);
    this._game.onResetRound = () => this.onResetRound?.();

    this._lobby.onEnterSandbox = () => {
      this.show('game');
    };

    this._lobby.onCreateRoom = (roomName, playerName, doubleDeck) => {
      this.onCreateRoomRequested?.(roomName, playerName, doubleDeck);
    };

    this._lobby.onJoinRoom = (roomId, playerName) => {
      this.onJoinRoomRequested?.(roomId, playerName);
    };

    this._game.onToLobby = () => {
      this.onToLobbyRequested?.();
      this.show('lobby');
    };

    this._game.onGatherBombs = () => this.onGatherBombs?.();
    this._game.onTableRoll = kind => this.onTableRoll?.(kind);
    this._game.onShuffleHand = () => this.onShuffleHand?.();
    this._game.onResetCamera = () => {
      this.onResetCameraRequested?.();
    };

    this._game.onFlipCard = () => {
      this.onFlipCardRequested?.();
    };

    this._game.onRotateCard = () => {
      this.onRotateCardRequested?.();
    };

    this._game.onStackCards = () => {
      this.onStackCardsRequested?.();
    };

    this._game.onSetInsertionMode = (mode, customVal) => {
      this.onSetInsertionModeRequested?.(mode, customVal);
    };

    this._game.onRequestCustomModal = () => {
      this.onRequestCustomModal?.();
    };


    logger.info('UIManager initialized');
  }

  show(screen: ScreenName): void {
    if (this._currentScreen === screen) return;
    this._hideAll();
    this._currentScreen = screen;
    switch (screen) {
      case 'lobby': this._lobby.show(); break;
      case 'game':  this._game.show();  break;
    }
    logger.info(`Screen changed to: ${screen}`);
  }

  getCurrentScreen(): ScreenName | null {
    return this._currentScreen;
  }

  updateConnectionStatus(status: ConnectionStatus, detail?: string): void {
    this._lobby.updateConnectionStatus(status, detail);
    this._game.updateConnectionStatus(status);
  }

  showError(msg: string): void {
    if (this.getCurrentScreen() === 'game') this._game.showError(msg);
    else this.showLobbyError(msg);
  }

  showLobbyError(msg: string): void {
    this._lobby.showError(msg);
  }

  updateRoomInfo(roomId: string | null, playerName: string, playerIndex: number, playerCount?: number, maxPlayers?: number, isHost?: boolean): void {
    this._game.updateRoomInfo(roomId, playerName, playerIndex, playerCount, maxPlayers, isHost);
  }

  updateRound(round: RoundSetup | undefined, isHost: boolean, spectator?: boolean): void {
    this._game.updateRound(round, isHost, spectator);
  }


  updateDeckControls(deck?: PublicDeckState, customPosition?: number, readOnly = false): void {
    this._game.updateDeckControls(deck, customPosition, readOnly);
  }

  updateDeckView(view: DeckViewState | null, localId: string | null): void {
    this._game.updateDeckView(view, localId);
  }


  updateGatherBombs(visible: boolean, enabled: boolean): void {
    this._game.updateGatherBombs(visible, enabled);
  }

  updateTableRollActions(enabled: boolean, reason?: string): void {
    this._game.updateTableRollActions(enabled, reason);
  }

  getGameOverlay(): HTMLElement {
    return this._game.getOverlayElement();
  }

  showInfo(message: string): void {
    this._game.showInfo(message);
  }

  showDrawEndNotice(end: 'TOP' | 'BOTTOM'): void {
    this._game.showDrawEndNotice(end);
  }

  showTableRollNotice(message: string): void {
    this._game.showTableRollNotice(message);
  }

  updateHandShuffle(visible: boolean, enabled: boolean): void {
    this._game.updateHandShuffle(visible, enabled);
  }

  showShuffleNotice(message: string): void {
    this._game.showShuffleNotice(message);
  }

  showDeckShuffle(playerName: string): void {
    this._game.showDeckShuffle(playerName);
  }

  updateDeckCount(count: number): void {
    this._game.updateDeckCount(count);
  }

  setInsertionModeState(mode: InsertionMode, customVal?: number): void {
    this._game.setInsertionModeState(mode, customVal);
  }

  private _hideAll(): void {
    this._lobby.hide();
    this._game.hide();
  }

  dispose(): void {
    this.onResetCameraRequested = null;
    this.onFlipCardRequested = null;
    this.onRotateCardRequested = null;
    this.onStackCardsRequested = null;
    this.onSetInsertionModeRequested = null;
    this.onRequestCustomModal = null;
    this.onCreateRoomRequested = null;
    this.onJoinRoomRequested = null;
    this.onToLobbyRequested = null;
    this._lobby.dispose();
    this._game.dispose();
    logger.info('UIManager disposed');
  }
}
