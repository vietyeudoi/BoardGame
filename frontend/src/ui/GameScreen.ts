/**
 * GameScreen.ts — In-game HUD Component
 * Displays top status, camera control buttons, and interactive tabletop hints.
 */
import type { DeckViewState } from '@shared/types/protocol';
import type { PublicDeckState, RoundSetup } from '@shared/types/room';
import { DeckAlterStrip } from './components/DeckAlterStrip';
import { RoundSetupPanel } from './RoundSetupPanel';
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
  readonly roundSetup: RoundSetupPanel;
  readonly deckAlterStrip: DeckAlterStrip;

  onCloseDeckView?: (confirm: boolean) => void;
  onSwapDeckView?: (first: number, second: number) => void;
  onDeckAffectedCount?: (count: number) => void;
  onDeckPosition?: (position: number) => void;
  private _deckState?: PublicDeckState;
  onResetRound?: () => void;
  private _errorTimeout?: ReturnType<typeof setTimeout>;
  private readonly _abortController = new AbortController();

  public onResetCamera: (() => void) | null = null;
  public onFlipCard: (() => void) | null = null;
  public onRotateCard: (() => void) | null = null;
  public onStackCards: (() => void) | null = null;
  public onToLobby: (() => void) | null = null;
  public onSetInsertionMode: ((mode: InsertionMode, customVal?: number) => void) | null = null;
  public onRequestCustomModal: (() => void) | null = null;

  constructor(private readonly _container: HTMLElement) {
    this._element = this._buildDOM();
    this._container.appendChild(this._element);
    this.roundSetup = new RoundSetupPanel(this._element);
    this.deckAlterStrip = new DeckAlterStrip(this._element);
    this._setupEvents();
  }

  private _buildDOM(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'game-screen';
    el.style.cssText = 'display:none;width:100%;height:100%;position:relative;pointer-events:none;';
    el.innerHTML = `
      <style>#game-screen [data-round-hidden] { display: none !important; }</style>
      <!-- Top Bar: Status and Navigation -->
      <div id="hud-top" style="
        position:absolute;top:14px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 36px);box-sizing:border-box;
        background:rgba(18,18,32,0.85);backdrop-filter:blur(8px);
        border:1px solid #3d3d5c;border-radius:24px;
        padding:8px 20px;font-size:0.85rem;color:#e0e0f0;
        display:flex;flex-wrap:wrap;align-items:center;gap:8px;
        box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:auto;
      ">
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="conn-dot" style="width:8px;height:8px;border-radius:50%;background:#888;display:inline-block;"></span>
          <span id="conn-text" style="font-weight:600;">Cat Boom Online</span>
          <span id="hud-room-badge" style="background:#1e293b;border:1px solid #3b82f6;color:#93c5fd;border-radius:12px;padding:2px 8px;font-size:0.72rem;font-weight:600;display:none;"></span>
          <span id="hud-player-badge" style="background:#1e293b;border:1px solid #10b981;color:#6ee7b7;border-radius:12px;padding:2px 8px;font-size:0.72rem;font-weight:600;display:none;"></span>
        </div>
        <div style="width:1px;height:16px;background:#3d3d5c;"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-width:0;">
          <span id="hud-deck-pill" style="
            background:#0f172a;color:#cbd5e1;border:1px solid #334155;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;font-weight:600;
            display:flex;align-items:center;gap:4px;
          ">📦 Chồng bài: 30 lá</span>

          <!-- Insertion Mode Control Group (M1.3.4.5) -->
          <div id="hud-insert-mode-group" style="
            display:flex;flex-wrap:wrap;align-items:center;gap:3px;background:#0f172a;border:1px solid #334155;
            border-radius:6px;padding:2px 4px;font-size:0.75rem;
          ">
            <span style="color:#94a3b8;font-weight:600;padding:0 4px;font-size:0.7rem;">Chèn:</span>
            <button id="btn-insert-top" aria-pressed="true" title="Chèn lên đỉnh (Mặc định)" style="
              background:#1d4ed8;color:#eff6ff;border:1px solid #3b82f6;border-radius:4px;
              padding:3px 6px;font-size:0.7rem;cursor:pointer;font-weight:600;
            ">Đỉnh (Top)</button>
            <button id="btn-insert-bottom" aria-pressed="false" title="Chèn xuống đáy" style="
              background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;
              padding:3px 6px;font-size:0.7rem;cursor:pointer;font-weight:600;
            ">Đáy (Bottom)</button>
            <button id="btn-insert-custom" aria-pressed="false" title="Chèn vào vị trí tùy chọn..." style="
              background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:4px;
              padding:3px 6px;font-size:0.7rem;cursor:pointer;font-weight:600;
            ">Tùy chọn...</button>
          </div>


          <div id="hud-deck-controls" hidden style="font-size:.75rem;color:#cbd5e1">
            <label id="hud-deck-position-label" hidden>Vị trí chèn
              <input id="hud-deck-position" type="number" min="1" step="1" style="width:3rem">
            </label>
            <label for="hud-affected-count">Số lá tác động</label>
            <button id="hud-affected-minus" aria-label="Giảm số lá tác động" type="button">−</button>
            <input id="hud-affected-count" type="number" min="1" step="1" style="width:3rem">
            <button id="hud-affected-plus" aria-label="Tăng số lá tác động" type="button">+</button>
            <output id="hud-deck-status" aria-live="polite"></output>
          </div>

          <div id="hud-deck-view" hidden style="font-size:.78rem;color:#fcd34d">
            <span id="hud-deck-view-lock" role="status"></span>
            <span id="hud-deck-view-swap" hidden>
              <input id="deck-view-from" type="number" min="1" value="1" aria-label="Vị trí thứ nhất" style="width:3rem">
              <input id="deck-view-to" type="number" min="1" value="2" aria-label="Vị trí thứ hai" style="width:3rem">
              <button id="btn-deck-view-swap" type="button">Đổi chỗ</button>
            </span>
            <button id="btn-deck-view-confirm" hidden type="button">Xác nhận</button>
            <button id="btn-deck-view-close" hidden type="button">Xong</button>
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
          <button id="btn-reset-cam" title="Reset Camera góc nhìn mặc định" style="
            background:#334155;color:#e2e8f0;border:1px solid #475569;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
            display:flex;align-items:center;gap:4px;
          ">🎥 Reset Camera</button>
          <button id="btn-round-reset" hidden type="button" style="pointer-events:auto">Làm lại ván</button>
          <button id="btn-to-lobby" title="Return to Main Lobby" style="
            background:#1e293b;color:#94a3b8;border:1px solid #334155;
            border-radius:6px;padding:4px 8px;font-size:0.75rem;cursor:pointer;
          ">🚪 Sảnh</button>
        </div>
      </div>


      <div id="hud-game-error" role="alert" hidden style="
        position:absolute;top:88px;left:50%;transform:translateX(-50%);
        max-width:85%;padding:8px 14px;border-radius:8px;background:#450a0a;
        border:1px solid #b91c1c;color:#fee2e2;font-size:0.85rem;
      "></div>
      <!-- Bottom Helper Pill -->
      <div id="hud-bottom-hint" style="
        position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
        background:rgba(15,15,28,0.85);backdrop-filter:blur(6px);
        border:1px solid #2e2e48;border-radius:20px;
        padding:6px 18px;font-size:0.75rem;color:#cbd5e1;
        box-shadow:0 2px 10px rgba(0,0,0,0.3);pointer-events:none;user-select:none;
        white-space:nowrap;max-width:80%;overflow:hidden;
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

    return el;
  }

  private _setupEvents(): void {


    const opts = { signal: this._abortController.signal };
    this._element.querySelector('#btn-deck-view-confirm')?.addEventListener('click', () => this.onCloseDeckView?.(true), opts);
    this._element.querySelector('#btn-deck-view-close')?.addEventListener('click', () => this.onCloseDeckView?.(false), opts);
    this._element.querySelector('#btn-deck-view-swap')?.addEventListener('click', () => {
      const from = this._element.querySelector<HTMLInputElement>('#deck-view-from')!;
      const to = this._element.querySelector<HTMLInputElement>('#deck-view-to')!;
      if (from.reportValidity() && to.reportValidity()) this.onSwapDeckView?.(from.valueAsNumber - 1, to.valueAsNumber - 1);
    }, opts);
    const count = this._element.querySelector<HTMLInputElement>('#hud-affected-count')!;
    count.addEventListener('change', () => {
      const requested = count.valueAsNumber;
      // Giữ số đã xác nhận nếu máy chủ từ chối thao tác khi chồng bị khóa.
      count.value = String(this._deckState?.affectedCount ?? '');
      if (Number.isInteger(requested)) this.onDeckAffectedCount?.(requested);
    }, opts);
    for (const [id, delta] of [['hud-affected-minus', -1], ['hud-affected-plus', 1]] as const) {
      this._element.querySelector('#' + id)?.addEventListener('click', () => {
        if (this._deckState?.count) this.onDeckAffectedCount?.(this._deckState.affectedCount + delta);
      }, opts);
    }
    const position = this._element.querySelector<HTMLInputElement>('#hud-deck-position')!;
    position.addEventListener('change', () => {
      this.onDeckPosition?.(Number.isFinite(position.valueAsNumber) ? Math.trunc(position.valueAsNumber) : 1);
    }, opts);
    this._element.querySelector('#btn-round-reset')?.addEventListener('click', () => this.onResetRound?.(), opts);

    if (this._btnInsertTop) {
      this._btnInsertTop.addEventListener('click', () => {
        logger.debug('Insert top button clicked');
        this.onSetInsertionMode?.('TOP');
      }, opts);
    }

    if (this._btnInsertBottom) {
      this._btnInsertBottom.addEventListener('click', () => {
        logger.debug('Insert bottom button clicked');
        this.onSetInsertionMode?.('BOTTOM');
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



  updateRound(round: RoundSetup | undefined, isHost: boolean, spectator = false): void {
    this.roundSetup.update(round, isHost);
    const inactive = round?.phase === 'SETUP' || spectator;
    for (const id of ['hud-insert-mode-group', 'btn-rotate-card', 'btn-stack-cards', 'hud-bottom-hint']) {
      this._element.querySelector('#' + id)?.toggleAttribute('data-round-hidden', inactive);
    }
    this._flipCardBtn?.toggleAttribute('data-round-hidden', round?.phase === 'SETUP');
    this._deckPill?.toggleAttribute('data-round-hidden', round?.phase === 'SETUP');
    const reset = this._element.querySelector<HTMLButtonElement>('#btn-round-reset');
    if (reset) reset.hidden = !isHost || round?.phase !== 'PLAYING';
  }


  updateDeckControls(deck?: PublicDeckState, customPosition?: number, readOnly = false): void {
    this._deckState = deck;
    this._element.querySelector<HTMLElement>('#hud-deck-controls')!.hidden = !deck;
    if (!deck) {
      this._element.querySelector('#hud-deck-status')!.textContent = '';
      return;
    }
    const count = this._element.querySelector<HTMLInputElement>('#hud-affected-count')!;
    count.max = String(deck.count);
    count.value = deck.count ? String(deck.affectedCount) : '';
    count.disabled = readOnly || deck.count === 0;
    this._element.querySelector<HTMLButtonElement>('#hud-affected-minus')!.disabled = count.disabled || deck.affectedCount <= 1;
    this._element.querySelector<HTMLButtonElement>('#hud-affected-plus')!.disabled = count.disabled || deck.affectedCount >= deck.count;
    const position = this._element.querySelector<HTMLInputElement>('#hud-deck-position')!;
    this._element.querySelector<HTMLElement>('#hud-deck-position-label')!.hidden = customPosition === undefined || readOnly;
    position.max = String(deck.count + 1);
    position.value = String(customPosition ?? 1);
  }


  updateDeckView(view: DeckViewState | null, localId: string | null): void {
    this._element.querySelector<HTMLElement>('#hud-deck-view')!.hidden = !view;
    const own = view?.viewerId === localId && Boolean(view);
    const alter = own && view?.mode === 'alter';
    this.deckAlterStrip.sync(alter ? view : null);
    const status = this._element.querySelector('#hud-deck-view-lock')!;
    status.textContent = view ? '🔒 ' + view.viewerName + (view.mode === 'alter' ? ' đang xếp bài' : ' đang xem bài') : '';
    this._element.querySelector<HTMLButtonElement>('#btn-deck-view-confirm')!.hidden = !alter;
    const close = this._element.querySelector<HTMLButtonElement>('#btn-deck-view-close')!;
    close.hidden = !own;
    close.textContent = alter ? 'Hủy' : 'Xong';
    this._element.querySelector<HTMLElement>('#hud-deck-view-swap')!.hidden = !alter || (view?.cards.length ?? 0) < 2;
    for (const id of ['deck-view-from', 'deck-view-to']) {
      this._element.querySelector<HTMLInputElement>('#' + id)!.max = String(view?.cards.length ?? 0);
    }
  }

  showDeckShuffle(playerName: string): void {
    this._element.querySelector('#hud-deck-status')!.textContent = playerName + ' vừa xáo bài';
  }

  showError(message: string): void {
    const alert = this._element.querySelector<HTMLElement>('#hud-game-error');
    if (!alert) return;
    clearTimeout(this._errorTimeout);
    alert.textContent = message;
    alert.hidden = false;
    this._errorTimeout = setTimeout(() => { alert.hidden = true; }, 3200);
  }

  setInsertionModeState(mode: InsertionMode, customVal?: number): void {
    if (!this._btnInsertTop || !this._btnInsertBottom || !this._btnInsertCustom) return;

    this._btnInsertTop.setAttribute('aria-pressed', String(mode === 'TOP'));
    this._btnInsertBottom.setAttribute('aria-pressed', String(mode === 'BOTTOM'));
    this._btnInsertCustom.setAttribute('aria-pressed', String(mode === 'CUSTOM'));

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
      const seat = playerIndex < 0 ? 'Khán giả' : 'P' + (playerIndex + 1);
      this._playerBadge.textContent = '👤 ' + playerName + ' (' + seat + ')';
      this._playerBadge.style.display = 'inline-flex';
    }
  }

  updateDeckCount(count: number): void {
    if (!this._deckPill) return;
    this._deckPill.textContent = count > 0 ? `📦 Chồng bài: ${count} lá` : '📦 Chồng bài: Hết bài';
    logger.debug(`HUD deck count updated to ${count}`);
  }

  dispose(): void {
    clearTimeout(this._errorTimeout);
    this.roundSetup.dispose();
    this.deckAlterStrip.dispose();
    this._abortController.abort();
    this.onResetCamera = null;
    this.onFlipCard = null;
    this.onToLobby = null;
    this._element.remove();
  }
}
