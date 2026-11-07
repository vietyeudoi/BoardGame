/**
 * UIManager.ts — HTML Overlay UI Controller
 * Manages screen transitions. Completely independent from Three.js scene.
 */
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

  public onResetCameraRequested: (() => void) | null = null;
  public onFlipCardRequested: (() => void) | null = null;
  public onRotateCardRequested: (() => void) | null = null;
  public onStackCardsRequested: (() => void) | null = null;
  public onSetInsertionModeRequested: ((mode: InsertionMode, customVal?: number) => void) | null = null;
  public onRequestCustomModal: (() => void) | null = null;
  public onDrawToHandRequested: (() => void) | null = null;
  public onCreateRoomRequested: ((roomName: string, playerName: string, maxPlayers: number) => void) | null = null;
  public onJoinRoomRequested: ((roomId: string, playerName: string) => void) | null = null;
  public onToLobbyRequested: (() => void) | null = null;

  constructor(
    private readonly _container: HTMLElement,
    _store: ClientStore
  ) {
    this._lobby = new LobbyScreen(this._container);
    this._game = new GameScreen(this._container);

    this._lobby.onEnterSandbox = () => {
      this.show('game');
    };

    this._lobby.onCreateRoom = (roomName, playerName, maxPlayers) => {
      this.onCreateRoomRequested?.(roomName, playerName, maxPlayers);
    };

    this._lobby.onJoinRoom = (roomId, playerName) => {
      this.onJoinRoomRequested?.(roomId, playerName);
    };

    this._game.onToLobby = () => {
      this.onToLobbyRequested?.();
      this.show('lobby');
    };

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

    this._game.onDrawToHand = () => {
      this.onDrawToHandRequested?.();
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

  showLobbyError(msg: string): void {
    this._lobby.showError(msg);
  }

  updateRoomInfo(roomId: string | null, playerName: string, playerIndex: number, playerCount?: number, maxPlayers?: number): void {
    this._game.updateRoomInfo(roomId, playerName, playerIndex, playerCount, maxPlayers);
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
    this.onDrawToHandRequested = null;
    this.onCreateRoomRequested = null;
    this.onJoinRoomRequested = null;
    this.onToLobbyRequested = null;
    this._lobby.dispose();
    this._game.dispose();
    logger.info('UIManager disposed');
  }
}
