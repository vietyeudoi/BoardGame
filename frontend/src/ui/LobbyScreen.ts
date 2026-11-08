/**
 * LobbyScreen.ts — Lobby UI Component
 * Provides room options, player name, join/create room, and quick entry to 3D Tabletop Sandbox.
 */
import type { ConnectionStatus } from '../network/NetworkClient';
import { Logger } from '../utils/Logger';

const logger = Logger.create('LobbyScreen');

export class LobbyScreen {
  private readonly _element: HTMLElement;
  private _statusEl: HTMLElement | null = null;
  private _enterSandboxBtn: HTMLButtonElement | null = null;
  private _createRoomBtn: HTMLButtonElement | null = null;
  private _joinRoomBtn: HTMLButtonElement | null = null;
  private _playerNameInput: HTMLInputElement | null = null;
  private _roomNameInput: HTMLInputElement | null = null;
  private _roomIdInput: HTMLInputElement | null = null;
  private _errorEl: HTMLElement | null = null;
  private readonly _abortController = new AbortController();

  public onEnterSandbox: (() => void) | null = null;
  public onCreateRoom: ((roomName: string, playerName: string, doubleDeck: boolean) => void) | null = null;
  public onJoinRoom: ((roomId: string, playerName: string) => void) | null = null;
  public onRetryConnect: (() => void) | null = null;

  constructor(private readonly _container: HTMLElement) {
    this._element = this._buildDOM();
    this._container.appendChild(this._element);
    this._setupEvents();
  }

  private _buildDOM(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'lobby-screen';
    el.style.cssText = [
      'display:none',
      'position:absolute',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%)',
      'background:rgba(20,20,38,0.96)',
      'backdrop-filter:blur(10px)',
      'border:1px solid #3d3d5c',
      'border-radius:14px',
      'padding:32px 36px',
      'width:440px',
      'max-width:92vw',
      'text-align:center',
      'box-shadow:0 16px 40px rgba(0,0,0,0.7)',
      'color:#f0f0f5',
    ].join(';');

    el.innerHTML = `
      <div style="font-size:2.2rem;margin-bottom:4px;">🐱💥</div>
      <h2 style="font-size:1.5rem;color:#f3c95f;margin:0 0 2px;letter-spacing:0.5px;">Cat Boom Online</h2>
      <p style="color:#9a9ab5;margin:0 0 16px;font-size:0.82rem;">Digital Tabletop Sandbox 3D • Multiplayer</p>

      <!-- Player Name Input -->
      <div style="margin-bottom:16px;text-align:left;">
        <label style="font-size:0.75rem;color:#cbd5e1;font-weight:600;display:block;margin-bottom:4px;">TÊN NGƯỜI CHƠI</label>
        <input id="input-player-name" type="text" value="Player 1" maxlength="16" style="
          width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;
          border-radius:6px;padding:8px 12px;color:#f8fafc;font-size:0.9rem;outline:none;
        " placeholder="Nhập tên người chơi..." />
      </div>

      <!-- Multiplayer Actions -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid #2a2a44;border-radius:10px;padding:14px;margin-bottom:16px;text-align:left;">
        <div style="font-size:0.78rem;font-weight:700;color:#60a5fa;margin-bottom:10px;text-transform:uppercase;">Phòng Chơi Multiplayer</div>
        
        <!-- Create Room -->
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <input id="input-room-name" type="text" value="Bàn Chơi Mèo Nổ" style="
            flex:1;background:#0f172a;border:1px solid #334155;border-radius:6px;
            padding:7px 10px;color:#f8fafc;font-size:0.85rem;outline:none;
          " placeholder="Tên phòng..." />
          <button id="btn-create-room" style="
            background:#2563eb;color:#fff;border:none;border-radius:6px;
            padding:7px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;
          ">Tạo phòng</button>
        </div>


        <label style="display:block;margin:0 0 10px;color:#cbd5e1;font-size:0.8rem;cursor:pointer">
          <input id="input-double-deck" type="checkbox" />
          Nhân đôi bộ bài <small>(trừ Mèo Nổ và Gỡ Bom)</small>
        </label>

        <!-- Join Room -->
        <div style="display:flex;gap:6px;">
          <input id="input-room-id" type="text" maxlength="6" style="
            flex:1;background:#0f172a;border:1px solid #334155;border-radius:6px;
            padding:7px 10px;color:#f8fafc;font-size:0.85rem;text-transform:uppercase;outline:none;letter-spacing:1px;
          " placeholder="MÃ PHÒNG (VD: 9WB4E2)" />
          <button id="btn-join-room" style="
            background:#059669;color:#fff;border:none;border-radius:6px;
            padding:7px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;white-space:nowrap;
          ">Vào phòng</button>
        </div>
      </div>

      <!-- Offline Sandbox Option -->
      <div style="margin-bottom:16px;">
        <button id="btn-enter-sandbox" style="
          width:100%;background:#334155;color:#e2e8f0;border:1px solid #475569;
          border-radius:8px;padding:9px 16px;font-size:0.85rem;font-weight:600;
          cursor:pointer;transition:background 0.2s;
        ">🕹️ Chơi Offline (Sandbox cục bộ)</button>
      </div>

      <!-- Error message container -->
      <div id="lobby-error" style="color:#ef4444;font-size:0.75rem;margin-bottom:8px;display:none;"></div>

      <!-- Status Footer -->
      <div id="lobby-status" style="color:#94a3b8;font-size:0.75rem;border-top:1px solid #2a2a44;padding-top:12px;">
        🟡 Đang kết nối tới máy chủ...
      </div>
    `;

    this._statusEl = el.querySelector<HTMLElement>('#lobby-status');
    this._errorEl = el.querySelector<HTMLElement>('#lobby-error');
    this._enterSandboxBtn = el.querySelector<HTMLButtonElement>('#btn-enter-sandbox');
    this._createRoomBtn = el.querySelector<HTMLButtonElement>('#btn-create-room');
    this._joinRoomBtn = el.querySelector<HTMLButtonElement>('#btn-join-room');
    this._playerNameInput = el.querySelector<HTMLInputElement>('#input-player-name');
    this._roomNameInput = el.querySelector<HTMLInputElement>('#input-room-name');
    this._roomIdInput = el.querySelector<HTMLInputElement>('#input-room-id');

    return el;
  }

  private _setupEvents(): void {
    const signal = this._abortController.signal;

    this._enterSandboxBtn?.addEventListener(
      'click',
      () => {
        logger.info('Offline Sandbox button clicked');
        this.onEnterSandbox?.();
      },
      { signal }
    );

    this._createRoomBtn?.addEventListener(
      'click',
      () => {
        const playerName = this._playerNameInput?.value.trim() || 'Player';
        const roomName = this._roomNameInput?.value.trim() || 'Phòng Chơi';
        this.clearError();
        logger.info('Create Room clicked', { roomName, playerName });
        const doubleDeck = this._element.querySelector<HTMLInputElement>('#input-double-deck')?.checked ?? false;
        this.onCreateRoom?.(roomName, playerName, doubleDeck);
      },
      { signal }
    );

    this._joinRoomBtn?.addEventListener(
      'click',
      () => {
        const playerName = this._playerNameInput?.value.trim() || 'Player';
        const roomId = this._roomIdInput?.value.trim().toUpperCase() || '';
        if (!roomId) {
          this.showError('Vui lòng nhập mã phòng (6 ký tự)');
          return;
        }
        this.clearError();
        logger.info('Join Room clicked', { roomId, playerName });
        this.onJoinRoom?.(roomId, playerName);
      },
      { signal }
    );
  }

  show(): void {
    this._element.style.display = 'block';
    logger.debug('LobbyScreen shown');
  }

  hide(): void {
    this._element.style.display = 'none';
  }

  showError(msg: string): void {
    if (this._errorEl) {
      this._errorEl.textContent = `⚠️ ${msg}`;
      this._errorEl.style.display = 'block';
    }
  }

  clearError(): void {
    if (this._errorEl) {
      this._errorEl.textContent = '';
      this._errorEl.style.display = 'none';
    }
  }

  updateConnectionStatus(status: ConnectionStatus, detail?: string): void {
    if (!this._statusEl) return;
    const labels: Record<ConnectionStatus, string> = {
      connecting:   '🟡 Đang kết nối tới máy chủ...',
      connected:    '🟢 Đã kết nối máy chủ Multiplayer',
      disconnected: '🔴 Mất kết nối (Chế độ Offline Sandbox khả dụng)',
      error:        `❌ Lỗi kết nối máy chủ${detail ? ` (${detail})` : ''}`,
    };
    this._statusEl.textContent = labels[status];
  }

  getPlayerName(): string {
    return this._playerNameInput?.value.trim() || 'Player';
  }

  setPlayerName(name: string): void {
    if (this._playerNameInput) {
      this._playerNameInput.value = name;
    }
  }

  dispose(): void {
    this._abortController.abort();
    this.onEnterSandbox = null;
    this.onCreateRoom = null;
    this.onJoinRoom = null;
    this.onRetryConnect = null;
    this._element.remove();
  }
}
