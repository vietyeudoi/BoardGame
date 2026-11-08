/**
 * GameScreen.ts — In-game HUD Component
 * Displays top status, camera control buttons, and interactive tabletop hints.
 */
import type { TableRollKind } from '@shared/types/tableRoll';
import type { DeckViewState } from '@shared/types/protocol';
import type { PublicDeckState, RoundSetup } from '@shared/types/room';
import { DeckAlterStrip } from './components/DeckAlterStrip';
import { RoundSetupPanel } from './RoundSetupPanel';
import type { ConnectionStatus } from '../network/NetworkClient';
import type { InsertionMode } from '../interaction/InteractionConfig';
import { GAME_HUD_MARKUP, hudIcon } from './GameHudMarkup';
import './GameHud.css';
import { Logger } from '../utils/Logger';

const logger = Logger.create('GameScreen');
const HUD_PREFS = { help: 'cat-boom:hud-help', seatHint: 'cat-boom:hud-seat-hint' } as const;
const MAX_NOTICES = 3;
const NOTICE_MS = 3500;

function readPreference(key: string): boolean {
  try { return localStorage.getItem(key) === 'true'; }
  catch (error) { logger.debug('Không đọc được tùy chọn HUD', { key, error }); return false; }
}

function savePreference(key: string, value: boolean): void {
  try { localStorage.setItem(key, String(value)); }
  catch (error) { logger.debug('Không lưu được tùy chọn HUD', { key, error }); }
}


export class GameScreen {
  private readonly _element: HTMLElement;
  private _statusDot: HTMLElement | null = null;
  private _statusText: HTMLElement | null = null;
  private _roomBadge: HTMLButtonElement | null = null;
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
  private _seatHintShown = readPreference(HUD_PREFS.seatHint);
  private _canShowSeatHint = false;
  private readonly _abortController = new AbortController();

  onTableRoll?: (kind: TableRollKind) => void;
  private readonly _notices = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  onShuffleHand?: () => void;
  onGatherBombs?: () => void;
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
    const panels = this._element.querySelector<HTMLElement>('#hud-panels')!;
    this.roundSetup = new RoundSetupPanel(panels);
    this.deckAlterStrip = new DeckAlterStrip(this._element);
    this.deckAlterStrip.mountControls(...['hud-deck-view-swap', 'btn-deck-view-confirm', 'btn-deck-view-close']
      .map(id => this._element.querySelector<HTMLElement>('#' + id)!));
    this._setupEvents();
  }

  private _buildDOM(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'game-screen';
    el.style.cssText = 'display:none;width:100%;height:100%;position:relative;pointer-events:none;';
    el.innerHTML = GAME_HUD_MARKUP;

    this._statusDot = el.querySelector<HTMLElement>('#conn-dot');
    this._statusText = el.querySelector<HTMLElement>('#conn-text');
    this._roomBadge = el.querySelector<HTMLButtonElement>('#hud-room-badge');
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
    const help = this._element.querySelector<HTMLDetailsElement>('#hud-bottom-hint')!;
    const system = this._element.querySelector<HTMLDetailsElement>('#hud-system-menu')!;
    help.open = readPreference(HUD_PREFS.help);
    help.addEventListener('toggle', () => savePreference(HUD_PREFS.help, help.open), opts);
    window.addEventListener('keydown', event => {
      if (this._element.style.display === 'none') return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable ||
        event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (event.key === 'Escape') {
        for (const id of ['hud-bottom-hint', 'hud-system-menu', 'player-area-hud']) {
          const panel = this._element.querySelector<HTMLDetailsElement>('#' + id);
          if (!panel?.open) continue;
          panel.open = false;
          if (panel.contains(document.activeElement)) panel.querySelector('summary')?.focus();
        }
      }
      if (event.key !== '?' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      help.open = !help.open;
    }, opts);
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !system.contains(event.target)) system.open = false;
    }, opts);
    system.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) system.open = false;
    }, opts);
    this._roomBadge?.addEventListener('click', async () => {
      const roomId = this._roomBadge?.dataset.roomId;
      if (!roomId) return;
      try {
        await navigator.clipboard.writeText(roomId);
        if (this._roomBadge?.dataset.roomId === roomId) this._showNotice('Đã sao chép mã phòng ' + roomId);
      } catch (error) {
        logger.warn('Không sao chép được mã phòng', { error });
        this._showNotice('Không sao chép được. Mã phòng: ' + roomId);
      }
    }, opts);

    this._element.querySelector('#btn-gather-bombs')?.addEventListener('click', () => this.onGatherBombs?.(), opts);
    this._element.querySelector('#btn-roll-dice')?.addEventListener('click', () => this.onTableRoll?.('dice'), opts);
    this._element.querySelector('#btn-roll-coin')?.addEventListener('click', () => this.onTableRoll?.('coin'), opts);
    this._element.querySelector('#btn-shuffle-hand')?.addEventListener('click', () => this.onShuffleHand?.(), opts);
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
    this._canShowSeatHint = round?.phase === 'PLAYING' && !spectator;
    if (round?.phase !== 'PLAYING' || spectator) {
      this.updateHandShuffle(false, false);
      this.updateGatherBombs(false, false);
    }
    const inactive = round?.phase === 'SETUP' || spectator;
    for (const id of ['hud-insert-mode-group', 'btn-rotate-card', 'btn-stack-cards']) {
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
    const own = view?.viewerId === localId && Boolean(view);
    const alter = own && view?.mode === 'alter';
    this._element.querySelector<HTMLElement>('#hud-deck-view')!.hidden = !view || own;
    this.deckAlterStrip.sync(own ? view : null);
    const status = this._element.querySelector('#hud-deck-view-lock')!;
    status.textContent = view ? '🔒 ' + view.viewerName + (view.mode === 'alter' ? ' đang xếp bài' : ' đang xem bài') : '';
    this._element.querySelector<HTMLButtonElement>('#btn-deck-view-confirm')!.hidden = !alter;
    const close = this._element.querySelector<HTMLButtonElement>('#btn-deck-view-close')!;
    close.hidden = !own;
    close.textContent = alter ? 'Hủy (Esc)' : 'Xong (Esc)';
    this._element.querySelector<HTMLElement>('#hud-deck-view-swap')!.hidden = !alter || (view?.cards.length ?? 0) < 2;
    for (const id of ['deck-view-from', 'deck-view-to']) {
      this._element.querySelector<HTMLInputElement>('#' + id)!.max = String(view?.cards.length ?? 0);
    }
  }


  updateGatherBombs(visible: boolean, enabled: boolean): void {
    const button = this._element.querySelector<HTMLButtonElement>('#btn-gather-bombs')!;
    button.hidden = !visible;
    button.disabled = !enabled;
  }

  updateTableRollActions(enabled: boolean, reason?: string): void {
    for (const [id, title] of [
      ['btn-roll-dice', 'Tung xúc xắc 6 mặt (D)'],
      ['btn-roll-coin', 'Tung đồng xu Ngửa hoặc Sấp (C)'],
    ] as const) {
      const button = this._element.querySelector<HTMLButtonElement>('#' + id)!;
      button.disabled = !enabled;
      button.title = reason ? title + ' · ' + reason : title;
    }
  }

  showTableRollNotice(message: string): void {
    const split = message.lastIndexOf(': ');
    if (split < 0) { this._showNotice(message); return; }
    const result = document.createElement('strong');
    result.textContent = message.slice(split + 2);
    this._showNotice(message.slice(0, split + 2), result);
  }

  private _showNotice(message: string, result?: HTMLElement): void {
    const notice = document.createElement('div');
    notice.className = 'hud-toast';
    notice.append(message);
    if (result) notice.append(result);
    this._pushNotice(notice);
  }

  private _pushNotice(notice: HTMLElement): void {
    this._removeNotice(notice);
    if (this._notices.size >= MAX_NOTICES) {
      const oldest = this._notices.keys().next().value;
      if (oldest) this._removeNotice(oldest);
    }
    notice.hidden = false;
    this._element.querySelector('#hud-roll-notices')!.append(notice);
    this._notices.set(notice, setTimeout(() => this._removeNotice(notice), NOTICE_MS));
  }

  private _removeNotice(notice: HTMLElement): void {
    clearTimeout(this._notices.get(notice));
    this._notices.delete(notice);
    if (notice.id === 'hud-game-error') notice.hidden = true;
    else notice.remove();
  }

  showInfo(message: string): void {
    this._showNotice(message);
  }

  showDrawEndNotice(end: 'TOP' | 'BOTTOM'): void {
    this._showNotice(end === 'TOP' ? 'Vị trí chèn chung: Đỉnh' : 'Vị trí chèn chung: Đáy');
  }

  getOverlayElement(): HTMLElement {
    return this._element;
  }

  updateHandShuffle(visible: boolean, enabled: boolean): void {
    const button = this._element.querySelector<HTMLButtonElement>('#btn-shuffle-hand')!;
    button.hidden = !visible;
    button.disabled = !enabled;
  }

  showShuffleNotice(message: string): void {
    this._element.querySelector('#hud-deck-status')!.textContent = message;
    this._showNotice(message);
  }

  showDeckShuffle(playerName: string): void {
    this.showShuffleNotice(playerName + ' vừa xáo bài');
  }

  showError(message: string): void {
    const alert = this._element.querySelector<HTMLElement>('#hud-game-error')!;
    alert.textContent = message;
    this._pushNotice(alert);
  }

  setInsertionModeState(mode: InsertionMode, customVal?: number): void {
    this._btnInsertTop?.setAttribute('aria-pressed', String(mode === 'TOP'));
    this._btnInsertBottom?.setAttribute('aria-pressed', String(mode === 'BOTTOM'));
    this._btnInsertCustom?.setAttribute('aria-pressed', String(mode === 'CUSTOM'));
    if (this._btnInsertCustom) {
      this._btnInsertCustom.textContent = mode === 'CUSTOM' && customVal !== undefined
        ? 'Riêng (' + customVal + ')' : 'Tùy chọn';
    }
  }

  show(): void {
    this._element.style.display = 'block';
    logger.debug('GameScreen shown');
  }

  hide(): void {
    for (const notice of this._notices.keys()) this._removeNotice(notice);
    this._element.style.display = 'none';
  }

  updateConnectionStatus(status: ConnectionStatus): void {
    if (!this._statusDot || !this._statusText) return;
    const labels: Record<ConnectionStatus, string> = {
      connecting: 'Đang kết nối', connected: 'Đã kết nối', disconnected: 'Mất kết nối', error: 'Lỗi kết nối',
    };
    this._statusDot.dataset.state = status;
    this._statusDot.setAttribute('aria-label', labels[status]);
    this._statusDot.title = labels[status];
  }

  updateRoomInfo(roomId: string | null, playerName: string, playerIndex: number, playerCount?: number, maxPlayers?: number, isHost = false): void {
    if (this._roomBadge) {
      if (roomId) {
        const capacity = document.createElement('span');
        capacity.id = 'hud-room-capacity';
        capacity.textContent = playerCount !== undefined && maxPlayers !== undefined ? playerCount + '/' + maxPlayers : '';
        this._roomBadge.replaceChildren(roomId, capacity);
        this._roomBadge.insertAdjacentHTML('afterbegin', hudIcon('copy'));
        this._roomBadge.dataset.roomId = roomId;
        this._roomBadge.disabled = false;
        this._roomBadge.title = 'Sao chép mã phòng · Bấm vào ghế để đổi chỗ';
        if (this._canShowSeatHint && !this._seatHintShown) {
          this._seatHintShown = true;
          savePreference(HUD_PREFS.seatHint, true);
          this._showNotice('Bấm vào ghế để đổi chỗ.');
        }
      } else {
        this._roomBadge.textContent = 'Offline Sandbox';
        delete this._roomBadge.dataset.roomId;
        this._roomBadge.disabled = true;
        this._roomBadge.title = 'Chế độ offline';
      }
      this._roomBadge.style.display = 'inline-flex';
    }
    if (this._playerBadge) {
      const seat = playerIndex < 0 ? 'Khán giả' : 'P' + (playerIndex + 1);
      const name = document.createElement('span');
      name.className = 'hud-player-name';
      name.textContent = playerName;
      const position = document.createElement('span');
      position.textContent = ' (' + seat + ')';
      this._playerBadge.replaceChildren(name, position);
      const role = playerIndex < 0 ? seat : (isHost ? 'Chủ phòng · ' : '') + 'Ghế ' + (playerIndex + 1);
      this._playerBadge.title = playerName + ' · ' + role;
      this._playerBadge.setAttribute('aria-label', this._playerBadge.title);
      this._playerBadge.toggleAttribute('data-host', isHost && playerIndex >= 0);
      this._playerBadge.style.display = 'inline-flex';
    }
  }

  updateDeckCount(count: number): void {
    if (!this._deckPill) return;
    this._deckPill.innerHTML = hudIcon('deck');
    this._deckPill.append(String(count) + ' lá');
    this._deckPill.setAttribute('aria-label', 'Chồng bài: ' + count + ' lá');
    logger.debug(`HUD deck count updated to ${count}`);
  }

  dispose(): void {
    for (const notice of this._notices.keys()) this._removeNotice(notice);
    this.roundSetup.dispose();
    this.deckAlterStrip.dispose();
    this._abortController.abort();
    this.onResetCamera = null;
    this.onFlipCard = null;
    this.onToLobby = null;
    this._element.remove();
  }
}
