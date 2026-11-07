/**
 * GameScreen.ts — In-game HUD Component
 * Displays top status, camera control buttons, and interactive tabletop hints.
 */
import type { ConnectionStatus } from '../network/NetworkClient';
import type { InsertionMode } from '../interaction/InteractionConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('GameScreen');

export class GameScreen {
  private readonly _element: HTMLElement;
  private _statusDot: HTMLElement | null = null;
  private _statusText: HTMLElement | null = null;
  private _roomBadge: HTMLElement | null = null;
  private _playerBadge: HTMLElement | null = null;
  private _resetCamBtn: HTMLButtonElement | null = null;
  private _flipCardBtn: HTMLButtonElement | null = null;
  private _rotateCardBtn: HTMLButtonElement | null = null;
  private _stackCardsBtn: HTMLButtonElement | null = null;
  private _toLobbyBtn: HTMLButtonElement | null = null;
  private _deckPill: HTMLElement | null = null;
  private _btnInsertTop: HTMLButtonElement | null = null;
  private _btnInsertBottom: HTMLButtonElement | null = null;
  private _btnInsertCustom: HTMLButtonElement | null = null;
  private _drawToHandBtn: HTMLButtonElement | null = null;
  private readonly _abortController = new AbortController();

  public onResetCamera: (() => void) | null = null;
  public onFlipCard: (() => void) | null = null;
  public onRotateCard: (() => void) | null = null;
  public onStackCards: (() => void) | null = null;
  public onToLobby: (() => void) | null = null;
  public onSetInsertionMode: ((mode: InsertionMode, customVal?: number) => void) | null = null;
  public onRequestCustomModal: (() => void) | null = null;
  public onDrawToHand: (() => void) | null = null;

  constructor(private readonly _container: HTMLElement) {
    this._element = this._buildDOM();
    this._container.appendChild(this._element);
    this._setupEvents();
  }

  private _buildDOM(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'game-screen';
    el.style.cssText = 'display:none;width:100%;height:100%;position:relative;pointer-events:none;';
    el.innerHTML = `
      <!-- Top Bar: Status and Navigation -->
      <div id="hud-top" style="
        position:absolute;top:14px;left:50%;transform:translateX(-50%);
        background:rgba(18,18,32,0.85);backdrop-filter:blur(8px);
        border:1px solid #3d3d5c;border-radius:24px;
        padding:8px 20px;font-size:0.85rem;color:#e0e0f0;
        display:flex;align-items:center;gap:12px;
        box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:auto;
      ">
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="conn-dot" style="width:8px;height:8px;border-radius:50%;background:#888;display:inline-block;"></span>
          <span id="conn-text" style="font-weight:600;">Cat Boom Online</span>
          <span id="hud-room-badge" style="background:#1e293b;border:1px solid #3b82f6;color:#93c5fd;border-radius:12px;padding:2px 8px;font-size:0.72rem;font-weight:600;display:none;"></span>
          <span id="hud-player-badge" style="background:#1e293b;border:1px solid #10b981;color:#6ee7b7;border-radius:12px;padding:2px 8px;font-size:0.72rem;font-weight:600;display:none;"></span>
        </div>
        <div style="width:1px;height:16px;background:#3d3d5c;"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span id="hud-deck-pill" style="
            background:#0f172a;color:#cbd5e1;border:1px solid #334155;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;font-weight:600;
            display:flex;align-items:center;gap:4px;
          ">📦 Chồng bài: 30 lá</span>

          <!-- Insertion Mode Control Group (M1.3.4.5) -->
          <div id="hud-insert-mode-group" style="
            display:flex;align-items:center;gap:3px;background:#0f172a;border:1px solid #334155;
            border-radius:6px;padding:2px 4px;font-size:0.75rem;
          ">
            <span style="color:#94a3b8;font-weight:600;padding:0 4px;font-size:0.7rem;">Chèn:</span>
            <button id="btn-insert-top" title="Chèn lên đỉnh (Mặc định)" style="
              background:#1d4ed8;color:#eff6ff;border:1px solid #3b82f6;border-radius:4px;
              padding:3px 6px;font-size:0.7rem;cursor:pointer;font-weight:600;
            ">Đỉnh (Top)</button>
            <button id="btn-insert-bottom" title="Chèn xuống đáy" style="
              background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;
              padding:3px 6px;font-size:0.7rem;cursor:pointer;font-weight:600;
            ">Đáy (Bottom)</button>
            <button id="btn-insert-custom" title="Chèn vào vị trí tùy chọn..." style="
              background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;
              padding:3px 6px;font-size:0.7rem;cursor:pointer;font-weight:600;
            ">Tùy chọn...</button>
          </div>

          <button id="btn-flip-card" title="Lật bài (Phím F)" style="
            background:#1e3a5f;color:#60a5fa;border:1px solid #2563eb;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
            display:flex;align-items:center;gap:4px;font-weight:600;
          ">🎴 Lật bài (F)</button>
          <button id="btn-rotate-card" title="Xoay bài 90° (Phím R)" style="
            background:#2e1065;color:#c084fc;border:1px solid #7c3aed;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
            display:flex;align-items:center;gap:4px;font-weight:600;
          ">🔄 Xoay 90° (R)</button>
          <button id="btn-stack-cards" title="Xếp chồng các lá bài đang chọn" style="
            background:#14532d;color:#86efac;border:1px solid #16a34a;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
            display:flex;align-items:center;gap:4px;font-weight:600;
          ">📦 Xếp chồng</button>
          <button id="btn-draw-to-hand" title="Rút bài vào tay (Phím H)" style="
            background:#312e81;color:#a5b4fc;border:1px solid #6366f1;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
            display:flex;align-items:center;gap:4px;font-weight:600;
          ">🖐 Rút vào tay (H)</button>
          <button id="btn-reset-cam" title="Reset Camera góc nhìn mặc định" style="
            background:#334155;color:#e2e8f0;border:1px solid #475569;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
            display:flex;align-items:center;gap:4px;
          ">🎥 Reset Camera</button>
          <button id="btn-to-lobby" title="Return to Main Lobby" style="
            background:#1e293b;color:#94a3b8;border:1px solid #334155;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
          ">🚪 Sảnh</button>
        </div>
      </div>

      <!-- Bottom Helper Pill -->
      <div id="hud-bottom-hint" style="
        position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
        background:rgba(15,15,28,0.85);backdrop-filter:blur(6px);
        border:1px solid #2e2e48;border-radius:20px;
        padding:6px 18px;font-size:0.75rem;color:#cbd5e1;
        box-shadow:0 2px 10px rgba(0,0,0,0.3);pointer-events:none;user-select:none;
        white-space:nowrap;
      ">
        🖱️ <b>Kéo trái:</b> Di chuyển bài &nbsp;|&nbsp; 
        ⌨️ <b>R / Shift+R:</b> Xoay 90° &nbsp;|&nbsp; 
        🖱️ <b>Lăn chuột:</b> Xoay tự do (Shift = 1°) &nbsp;|&nbsp; 
        ⌨️ <b>Ctrl + Click:</b> Chọn nhiều &nbsp;|&nbsp; 
        ⌨️ <b>F:</b> Lật bài &nbsp;|&nbsp; 
        ⌨️ <b>H:</b> Rút vào tay &nbsp;|&nbsp; 
        🖱️ <b>Chuột phải:</b> Menu thao tác
      </div>
    `;

    this._statusDot = el.querySelector<HTMLElement>('#conn-dot');
    this._statusText = el.querySelector<HTMLElement>('#conn-text');
    this._roomBadge = el.querySelector<HTMLElement>('#hud-room-badge');
    this._playerBadge = el.querySelector<HTMLElement>('#hud-player-badge');
    this._resetCamBtn = el.querySelector<HTMLButtonElement>('#btn-reset-cam');
    this._flipCardBtn = el.querySelector<HTMLButtonElement>('#btn-flip-card');
    this._rotateCardBtn = el.querySelector<HTMLButtonElement>('#btn-rotate-card');
    this._stackCardsBtn = el.querySelector<HTMLButtonElement>('#btn-stack-cards');
    this._toLobbyBtn = el.querySelector<HTMLButtonElement>('#btn-to-lobby');
    this._deckPill = el.querySelector<HTMLElement>('#hud-deck-pill');
    this._btnInsertTop = el.querySelector<HTMLButtonElement>('#btn-insert-top');
    this._btnInsertBottom = el.querySelector<HTMLButtonElement>('#btn-insert-bottom');
    this._btnInsertCustom = el.querySelector<HTMLButtonElement>('#btn-insert-custom');
    this._drawToHandBtn = el.querySelector<HTMLButtonElement>('#btn-draw-to-hand');

    return el;
  }

  private _setupEvents(): void {
    const opts = { signal: this._abortController.signal };

    if (this._btnInsertTop) {
      this._btnInsertTop.addEventListener('click', () => {
        logger.debug('Insert top button clicked');
        this.onSetInsertionMode?.('TOP');
        this.setInsertionModeState('TOP');
      }, opts);
    }

    if (this._btnInsertBottom) {
      this._btnInsertBottom.addEventListener('click', () => {
        logger.debug('Insert bottom button clicked');
        this.onSetInsertionMode?.('BOTTOM');
        this.setInsertionModeState('BOTTOM');
      }, opts);
    }

    if (this._btnInsertCustom) {
      this._btnInsertCustom.addEventListener('click', () => {
        logger.debug('Insert custom button clicked');
        this.onRequestCustomModal?.();
      }, opts);
    }

    if (this._flipCardBtn) {
      this._flipCardBtn.addEventListener('click', () => {
        logger.debug('Flip card button clicked');
        this.onFlipCard?.();
      }, opts);
    }

    if (this._rotateCardBtn) {
      this._rotateCardBtn.addEventListener('click', () => {
        logger.debug('Rotate card button clicked');
        this.onRotateCard?.();
      }, opts);
    }

    if (this._stackCardsBtn) {
      this._stackCardsBtn.addEventListener('click', () => {
        logger.debug('Stack cards button clicked');
        this.onStackCards?.();
      }, opts);
    }

    if (this._drawToHandBtn) {
      this._drawToHandBtn.addEventListener('click', () => {
        logger.debug('Draw to hand button clicked');
        this.onDrawToHand?.();
      }, opts);
    }

    if (this._resetCamBtn) {
      this._resetCamBtn.addEventListener('click', () => {
        logger.debug('Reset camera button clicked');
        this.onResetCamera?.();
      }, opts);
    }

    if (this._toLobbyBtn) {
      this._toLobbyBtn.addEventListener('click', () => {
        logger.info('To lobby button clicked');
        this.onToLobby?.();
      }, opts);
    }
  }

  setInsertionModeState(mode: InsertionMode, customVal?: number): void {
    if (!this._btnInsertTop || !this._btnInsertBottom || !this._btnInsertCustom) return;

    // Reset styles
    const defaultBg = '#1e293b';
    const defaultColor = '#94a3b8';
    const defaultBorder = '#334155';
    const activeBg = '#1d4ed8';
    const activeColor = '#eff6ff';
    const activeBorder = '#3b82f6';

    this._btnInsertTop.style.background = defaultBg;
    this._btnInsertTop.style.color = defaultColor;
    this._btnInsertTop.style.borderColor = defaultBorder;

    this._btnInsertBottom.style.background = defaultBg;
    this._btnInsertBottom.style.color = defaultColor;
    this._btnInsertBottom.style.borderColor = defaultBorder;

    this._btnInsertCustom.style.background = defaultBg;
    this._btnInsertCustom.style.color = defaultColor;
    this._btnInsertCustom.style.borderColor = defaultBorder;
    this._btnInsertCustom.textContent = 'Tùy chọn...';

    if (mode === 'TOP') {
      this._btnInsertTop.style.background = activeBg;
      this._btnInsertTop.style.color = activeColor;
      this._btnInsertTop.style.borderColor = activeBorder;
    } else if (mode === 'BOTTOM') {
      this._btnInsertBottom.style.background = activeBg;
      this._btnInsertBottom.style.color = activeColor;
      this._btnInsertBottom.style.borderColor = activeBorder;
    } else if (mode === 'CUSTOM') {
      this._btnInsertCustom.style.background = activeBg;
      this._btnInsertCustom.style.color = activeColor;
      this._btnInsertCustom.style.borderColor = activeBorder;
      if (customVal !== undefined) {
        this._btnInsertCustom.textContent = `Tùy chọn (${customVal})...`;
      }
    }
  }

  show(): void {
    this._element.style.display = 'block';
    logger.debug('GameScreen shown');
  }

  hide(): void {
    this._element.style.display = 'none';
  }

  updateConnectionStatus(status: ConnectionStatus): void {
    if (!this._statusDot || !this._statusText) return;
    const colors: Record<ConnectionStatus, string> = {
      connecting:   '#f0c040',
      connected:    '#40c040',
      disconnected: '#94a3b8',
      error:        '#c04040',
    };
    this._statusDot.style.background = colors[status];
  }

  updateRoomInfo(roomId: string | null, playerName: string, playerIndex: number, playerCount?: number, maxPlayers?: number): void {
    if (this._roomBadge) {
      if (roomId) {
        const capacity = playerCount !== undefined && maxPlayers !== undefined ? ` • ${playerCount} / ${maxPlayers} Players` : '';
        this._roomBadge.textContent = `🏠 Phòng: ${roomId}${capacity}`;
        this._roomBadge.style.display = 'inline-flex';
      } else {
        this._roomBadge.textContent = '🕹️ Offline Sandbox';
        this._roomBadge.style.display = 'inline-flex';
      }
    }
    if (this._playerBadge) {
      this._playerBadge.textContent = `👤 ${playerName} (P${playerIndex + 1})`;
      this._playerBadge.style.display = 'inline-flex';
    }
  }

  updateDeckCount(count: number): void {
    if (!this._deckPill) return;
    this._deckPill.textContent = count > 0 ? `📦 Chồng bài: ${count} lá` : '📦 Chồng bài: Hết bài';
    logger.debug(`HUD deck count updated to ${count}`);
  }

  dispose(): void {
    this._abortController.abort();
    this.onResetCamera = null;
    this.onFlipCard = null;
    this.onToLobby = null;
    this.onDrawToHand = null;
    this._element.remove();
  }
}
