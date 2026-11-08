/**
 * FullHandFanPreviewUI.ts — M1.7.8 Full Hand Fan Preview (screen-space overlay)
 *
 * A purely visual HTML overlay: when the local player hovers ANY card in their
 * own HAND, the entire hand is shown as a poker-style fan at the bottom of the
 * viewport. It never touches the 3D card transforms, the CardRegistry or the
 * game state, and it is never broadcast to other clients.
 *
 * Khi mở, overlay nhận chuột trên toàn vùng fan để HAND 3D không nhận nhầm.
 * Các callback vẫn ánh xạ về đúng id bài thật để chọn và kéo thả.
 */
import { paintCardFace } from './CardFaceDOM';
import { FAN_PREVIEW_LAYOUT } from '../FanPreviewConfig';

/** Minimal display data the overlay needs. */
export interface FanCardData {
  id: string;
  cardType: string | null;
  title: string;
  masked?: boolean;
}

export interface FanCardLayout {
  x: number;
  y: number;
  angleDeg: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface FanLayoutResult {
  cardWidth: number;
  cardHeight: number;
  cards: FanCardLayout[];
  totalWidth: number;
}

/**
 * App-level interaction handlers (M1.7.9 Part B).
 *
 * The fan only knows how to map a rendered fan card back to its source real
 * card (the fan's card `id` IS the authoritative card id — no gameplay copy or
 * preview-only card is ever created). The app resolves the source id into the
 * real `CardObject3D` and reuses the existing hover / selection / drag pipelines,
 * so a drag from the fan behaves exactly like a drag from the real 3D hand.
 */
export interface FullHandFanPreviewHandlers {
  /** A fan card was hovered — forward the hover to the real card pipeline. */
  onCardHover: (sourceCardId: string) => void;
  /** A fan card was clicked / selected — delegate selection to the real card. */
  onCardSelect: (sourceCardId: string, addToSelection: boolean) => void;
  /** A fan card primary-press began — run the real card drag pipeline. */
  onCardDragStart: (sourceCardId: string, event: MouseEvent, previewOffset?: { x: number; y: number }) => void;
  /** Commit a local hand reorder after a fan-only drag. */
  onCardReorder?: (sourceCardId: string, targetIndex: number) => void;
  onFanDragStateChanged?: (sourceCardId: string | null) => void;
  onFanDragCancelled?: (handedOff: boolean) => void;
}

const ROOT_CLASS = 'fhfp-root';
const OPEN_CLASS = 'fhfp-open';
const FAN_CLICK_MAX_MOVE_PX = 4; // fan cards never turn a real drag into a click-select

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function spacingRatioFor(count: number): number {
  for (const step of FAN_PREVIEW_LAYOUT.SPACING_RATIO_STEPS) {
    if (count <= step.maxCards) return step.ratio;
  }
  return FAN_PREVIEW_LAYOUT.SPACING_RATIO_STEPS[
    FAN_PREVIEW_LAYOUT.SPACING_RATIO_STEPS.length - 1
  ]!.ratio;
}

/**
 * Pure fan geometry. Exported so the layout can be unit-tested without a DOM.
 * Positions are relative to the horizontal centre of the viewport; `y` is a
 * vertical offset (negative = higher) and `angleDeg` is symmetric around 0.
 */
export function computeFanLayout(
  cardCount: number,
  viewportWidth: number,
  viewportHeight: number
): FanLayoutResult {
  const count = Math.max(0, Math.floor(cardCount));
  if (count === 0) {
    return { cardWidth: 0, cardHeight: 0, cards: [], totalWidth: 0 };
  }

  const safeWidth = Math.max(
    FAN_PREVIEW_LAYOUT.MIN_VIEWPORT_WIDTH_PX,
    viewportWidth || FAN_PREVIEW_LAYOUT.MIN_VIEWPORT_WIDTH_PX
  );
  const safeHeight = Math.max(1, viewportHeight || FAN_PREVIEW_LAYOUT.MIN_CARD_HEIGHT_PX);

  const cardHeight = Math.round(
    clamp(
      safeHeight * FAN_PREVIEW_LAYOUT.CARD_HEIGHT_VIEWPORT_RATIO,
      FAN_PREVIEW_LAYOUT.MIN_CARD_HEIGHT_PX,
      FAN_PREVIEW_LAYOUT.MAX_CARD_HEIGHT_PX
    )
  );
  const cardWidth = Math.round(cardHeight * FAN_PREVIEW_LAYOUT.CARD_ASPECT_RATIO);

  const margin = clamp(
    safeWidth * FAN_PREVIEW_LAYOUT.VIEWPORT_MARGIN_RATIO,
    FAN_PREVIEW_LAYOUT.VIEWPORT_MARGIN_MIN_PX,
    FAN_PREVIEW_LAYOUT.VIEWPORT_MARGIN_MAX_PX
  );
  const maxSpan = Math.max(
    cardWidth,
    Math.min(safeWidth - margin * 2, FAN_PREVIEW_LAYOUT.MAX_FAN_WIDTH_PX)
  );

  const halfSpreadDeg =
    count <= 1
      ? 0
      : Math.min(
          FAN_PREVIEW_LAYOUT.MAX_HALF_SPREAD_DEG,
          FAN_PREVIEW_LAYOUT.BASE_HALF_SPREAD_DEG +
            count * FAN_PREVIEW_LAYOUT.HALF_SPREAD_PER_CARD_DEG
        );
  const halfSpreadRad = (halfSpreadDeg * Math.PI) / 180;

  // Horizontal reach of one rotated card, used to keep the whole fan on screen.
  const halfExtent =
    (cardWidth * Math.cos(halfSpreadRad) + cardHeight * Math.sin(halfSpreadRad)) / 2;
  const maxSpacing =
    count > 1 ? Math.max(0, (maxSpan - halfExtent * 2) / (count - 1)) : 0;
  const desiredSpacing = count > 1 ? cardWidth * spacingRatioFor(count) : 0;
  const spacing = count > 1 ? Math.max(1, Math.min(desiredSpacing, maxSpacing)) : 0;

  const middle = (count - 1) / 2;
  const arcHeight = Math.min(
    FAN_PREVIEW_LAYOUT.MAX_ARC_HEIGHT_PX,
    cardHeight * FAN_PREVIEW_LAYOUT.ARC_HEIGHT_RATIO
  );

  const cards: FanCardLayout[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? (i - middle) / middle : 0;
    const x = (i - middle) * spacing;
    // Centre card is highest; outer cards sit on the baseline (arc).
    const y = count > 1 ? -arcHeight * (1 - t * t) : 0;
    const angleDeg = t * halfSpreadDeg;

    minX = Math.min(minX, x - halfExtent);
    maxX = Math.max(maxX, x + halfExtent);

    cards.push({ x, y, angleDeg, width: cardWidth, height: cardHeight, zIndex: i + 1 });
  }

  return { cardWidth, cardHeight, cards, totalWidth: maxX - minX };
}

/** Builds the scoped stylesheet once per overlay instance. */
function buildStylesheet(): string {
  const openMs = FAN_PREVIEW_LAYOUT.OPEN_ANIMATION_MS;
  const closeMs = FAN_PREVIEW_LAYOUT.CLOSE_ANIMATION_MS;
  return `
.${ROOT_CLASS} {
  position: fixed; left: 0; right: 0; bottom: 0;
  height: min(46vh, 430px);
  z-index: 150; pointer-events: none;
  opacity: 0; transition: opacity ${openMs}ms ease;
  contain: layout style;
}
.${ROOT_CLASS}.${OPEN_CLASS} { opacity: 1; pointer-events: auto; }
/* Giữ hình học của fan cho khung chọn, chỉ ẩn lớp hiển thị trong lúc kéo. */
[data-marquee-active] .${ROOT_CLASS} { visibility: hidden; }
.fhfp-glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 62% 95% at 50% 100%, rgba(6,10,24,.38) 0%, rgba(6,10,24,.18) 45%, rgba(6,10,24,0) 78%);
}

.fhfp-stage { position: absolute; inset: 0; }
.fhfp-marquee-start {
  position:absolute;left:16px;top:6px;z-index:1;padding:4px 8px;border-radius:6px;
  color:#dbeafe;background:#172554;font:12px system-ui;cursor:crosshair;user-select:none;
}
.fhfp-card {
  position: absolute;
  bottom: ${FAN_PREVIEW_LAYOUT.CARD_BOTTOM_OFFSET_PX}px;
  /* Lá bài nhận thao tác; root chặn chuột xuyên qua khoảng trống xuống canvas. */
  pointer-events: auto;
  user-select: none; -webkit-user-select: none; touch-action: none;
  display: flex; flex-direction: column;
  border-radius: var(--face-radius-x) / var(--face-radius-y); overflow: hidden;
  background: #f8fafc;
  box-shadow: 0 16px 32px rgba(0,0,0,.58), 0 1px 0 rgba(255,255,255,.35) inset;
  transform-origin: 50% 100%;
  /* M1.7.10: --dy-hover / --scale drive the hover / selection / drag lifts. */
  transform: translateX(-50%) translate3d(calc(var(--slot-x, 0px) + var(--drag-x, 0px)), calc(var(--dy, 0px) + var(--dy-hover, 0px) + var(--drag-y, 0px)), 0) rotate(var(--rot, 0deg)) scale(var(--scale, 1));
  transition: transform ${closeMs}ms cubic-bezier(.2,.85,.25,1) var(--delay, 0ms),
              opacity ${openMs}ms ease var(--delay, 0ms);
  will-change: transform;
  backface-visibility: hidden;
}
.fhfp-card--selected {
  box-shadow: 0 26px 52px rgba(0,0,0,.7), 0 0 0 3px rgba(96,165,250,.9), 0 1px 0 rgba(255,255,255,.35) inset;
}
.fhfp-card--dragging {
  transition: none;
  box-shadow: 0 30px 60px rgba(0,0,0,.76), 0 0 0 3px rgba(96,165,250,.95), 0 1px 0 rgba(255,255,255,.45) inset;
}
.fhfp-card--handed-off { opacity: 0; pointer-events: none; }
.${ROOT_CLASS}:not(.${OPEN_CLASS}) .fhfp-card {
  pointer-events: none;
  opacity: 0;
  transform: translateX(-50%) translateY(var(--dy-enter, 54px)) rotate(var(--rot-enter, 0deg)) scale(.9);
}
/* M1.7.9 Part B: light hover highlight for the exact fan card under the cursor. */
.fhfp-card:hover:not(.fhfp-card--selected):not(.fhfp-card--dragging) {
  box-shadow: 0 22px 46px rgba(0,0,0,.68), 0 1px 0 rgba(255,255,255,.35) inset;
}
`;
}

/**
 * Screen-space fan preview. One instance per app.
 */
export class FullHandFanPreviewUI {
  private readonly _container: HTMLElement;
  private readonly _abortController = new AbortController();

  private _root: HTMLDivElement | null = null;
  private _stage: HTMLDivElement | null = null;
  private _cardEls: HTMLDivElement[] = [];
  private _cards: FanCardData[] = [];
  private _signature = '';
  private _open = false;
  private _disposed = false;
  private _closeTimer: number | null = null;
  private _handlers: FullHandFanPreviewHandlers | null = null;
  private _fanPointerDown: { clientX: number; clientY: number } | null = null;
  private _draggingSourceId: string | null = null;
  private _hoveredSourceId: string | null = null;
  private _selectedSourceIds: string[] = [];
  private _slotZ: number[] = [];
  private _layout: FanLayoutResult | null = null;
  private _visualOrderIds: string[] = [];
  private _fanDrag: { cardId: string; startX: number; startY: number; currentX: number; currentY: number; startIndex: number; targetIndex: number; handedOff: boolean; baseTransform: string; offsetX: number; offsetY: number } | null = null;
  private _dragFrame: number | null = null;
  private _ignoreNextClickId: string | null = null;
  private _handCards: FanCardData[] = [];
  private _page = 0;
  private _pageOffset = 0;
  private _pager: HTMLDivElement | null = null;
  private _pageLabel: HTMLSpanElement | null = null;
  private _pagePrev: HTMLButtonElement | null = null;
  private _pageNext: HTMLButtonElement | null = null;
  private _handleResize = (): void => {
    if (this._open) this._showPage();
  };

  constructor(container: HTMLElement) {
    this._container = container;

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._handleResize);
      // M1.7.10: clear the fan drag visual once the pointer gesture ends
      // (drag end / cancel / click-cleanup) — the fan itself stays open.
      window.addEventListener(
        'mouseup',
        () => {
          this._draggingSourceId = null;
          this._applyCardVisuals();
        },
        { signal: this._abortController.signal }
      );
      window.addEventListener('mousemove', this._onFanMouseMove, { signal: this._abortController.signal });
      window.addEventListener('mouseup', this._onFanMouseUp, { signal: this._abortController.signal });
      window.addEventListener('pointercancel', this._onFanDragCancelled, { signal: this._abortController.signal });
      window.addEventListener('blur', this._onFanDragCancelled, { signal: this._abortController.signal });
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this._onFanDragCancelled();
      }, { signal: this._abortController.signal });
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Opens (or refreshes) the fan with the full hand. Empty hand closes it. */
  show(cards: FanCardData[]): void {
    if (this._disposed) return;
    if (cards.length === 0) {
      this.hide();
      return;
    }

    this._handCards = cards;
    this._showPage();
  }

  private _showPage(): void {
    const viewport = this._root?.clientWidth || window.innerWidth;
    const capacity = Math.max(4, Math.min(FAN_PREVIEW_LAYOUT.PAGE_MAX_CARDS,
      Math.floor((viewport - FAN_PREVIEW_LAYOUT.PAGE_RESERVED_WIDTH_PX) / FAN_PREVIEW_LAYOUT.PAGE_VISIBLE_STRIP_PX)));
    const pageCount = Math.ceil(this._handCards.length / capacity);
    this._page = Math.max(0, Math.min(this._page, pageCount - 1));
    this._pageOffset = this._page * capacity;
    const cards = this._handCards.slice(this._pageOffset, this._pageOffset + capacity);
    const previousCards = this._cards;
    const previousElements = new Map(previousCards.map((card, index) => [card.id, this._cardEls[index]]));
    const previousById = new Map(previousCards.map(card => [card.id, card]));
    const canReuse = cards.length === previousCards.length && cards.every(card => previousById.has(card.id));
    this._cards = cards.map((card) => ({ ...card }));
    if (!this._fanDrag) this._visualOrderIds = this._cards.map((card) => card.id);
    this._ensureRoot();
    if (!this._root || !this._stage) return;

    const signature = this._cards
      .map((c) => `${c.id}:${c.cardType ?? ''}:${c.masked ? 1 : 0}:${c.title}`)
      .join('|');
    if (signature !== this._signature) {
      if (canReuse) {
        // Giữ DOM khi đổi thứ tự để transition đi từ slot cũ sang slot mới.
        this._cardEls = this._cards.map((card) => previousElements.get(card.id)!);
        if (cards.some((card, index) => card.id !== previousCards[index]?.id)) this._stage.append(...this._cardEls);
        this._cardEls.forEach((el, index) => {
          el.dataset.fanIndex = String(index);
          const card = this._cards[index]!;
          const old = previousById.get(card.id)!;
          if (old.masked === card.masked && old.title === card.title && old.cardType === card.cardType) return;
          paintCardFace(el, card);
          if (old.masked !== card.masked) {
            el.firstElementChild?.animate?.([{ transform: "rotateY(-82deg)" }, { transform: "rotateY(0)" }], { duration: 150, easing: "ease-out" });
          }
        });
      } else this._buildCards();
      this._signature = signature;
    }

    this._cancelCloseTimer();
    this._open = true;

    this._root.style.display = 'block';
    this._root.style.pointerEvents = 'auto';
    this._root.setAttribute('aria-hidden', 'false');
    this._root.dataset.fanOpen = 'true';
    // Chỉ đo khi mở lần đầu; cập nhật HAND không ép layout lại liên tục.
    if (!this._root.classList.contains(OPEN_CLASS)) void this._root.offsetWidth;
    this._root.classList.add(OPEN_CLASS);
    this._pager!.hidden = pageCount <= 1;
    this._pageLabel!.textContent = `${this._page + 1}/${pageCount} · ${this._handCards.length} lá`;
    this._pagePrev!.disabled = this._page === 0;
    this._pageNext!.disabled = this._page === pageCount - 1;
    this._relayout();
  }

  /** Refreshes an already-open fan (no-op when closed). */
  update(cards: FanCardData[]): void {
    if (!this._open || this._disposed) return;
    if (cards.length === 0) {
      this.hide();
      return;
    }
    this.show(cards);
  }

  /** Ẩn fan sau khi bàn 3D đã nhận lá bài và sở hữu thao tác kéo. */
  closeAfterHandoff(): void {
    if (!this._fanDrag?.handedOff) return;
    this._fanDrag = null;
    this.hide(true);
  }

  /** Closes the fan. Logical state flips immediately; pixels fade out. */
  hide(immediate = false): void {
    if (this._disposed) return;
    if (this._fanDrag) {
      this._handlers?.onFanDragStateChanged?.(null);
      if (this._fanDrag.handedOff) this._handlers?.onFanDragCancelled?.(true);
    }
    this._open = false;
    this._cancelCloseTimer();
    this._cancelDragFrame();
    this._fanPointerDown = null;
    this._fanDrag = null;
    this._draggingSourceId = null;
    this._hoveredSourceId = null;
    this._selectedSourceIds = [];

    if (!this._root) return;
    this._root.classList.remove(OPEN_CLASS);
    this._root.setAttribute('aria-hidden', 'true');
    this._root.dataset.fanOpen = 'false';
    this._root.style.pointerEvents = 'none';

    if (immediate) {
      this._resetDom();
      return;
    }

    this._closeTimer = window.setTimeout(() => {
      this._closeTimer = null;
      if (!this._open) this._resetDom();
    }, FAN_PREVIEW_LAYOUT.CLOSE_ANIMATION_MS);
  }

  isOpen(): boolean {
    return this._open;
  }

  /** IDs currently rendered in the fan, in HAND order (empty when closed). */
  getRenderedCardIds(): string[] {
    if (!this._open) return [];
    return this._cards.map((c) => c.id);
  }

  getCardElements(): HTMLElement[] {
    return this._open ? [...this._cardEls] : [];
  }

  getRootElement(): HTMLElement | null {
    return this._root;
  }

  /**
   * M1.7.10 Part A: true when the given screen point is over the fan overlay
   * (the Preview half of the HAND + Preview interaction zone). Used after a drag
   * ends so the fan closes only when the pointer is genuinely outside both.
   */
  containsPoint(clientX: number, clientY: number): boolean {
    if (!this._open || !this._root) return false;
    // Hit-test theo lá bài đã xoay, cả khoảng trống trong overlay cũng tính là ngoài fan.
    const card = document.elementFromPoint?.(clientX, clientY)?.closest(".fhfp-card, .fhfp-pager, .fhfp-marquee-start");
    return !!card && this._root.contains(card);
  }

  /**
   * Registers interaction handlers (M1.7.9 Part B). The fan forwards hover /
   * click / drag intents on the real source card. Pass `null` to detach.
   */
  setHandlers(handlers: FullHandFanPreviewHandlers | null): void {
    this._handlers = handlers;
  }

  /**
   * M1.7.10: marks (or clears, with `null`) the fan card that is currently being
   * dragged. The dragged card gets a lifted / highlighted visual while the fan
   * preview itself stays open.
   */
  setDraggingSourceId(sourceCardId: string | null): void {
    this._draggingSourceId = sourceCardId;
    this._applyCardVisuals();
  }

  /**
   * M1.7.10: sets the currently selected fan source cards (multi-select aware).
   * Selected visuals outrank hover but never the drag state.
   */
  setSelectedSourceIds(sourceIds: string[]): void {
    this._selectedSourceIds = sourceIds;
    this._applyCardVisuals();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._cancelCloseTimer();
    this._cancelDragFrame();
    this._abortController.abort();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._handleResize);
    }
    this._root?.remove();
    this._root = null;
    this._stage = null;
    this._cardEls = [];
    this._cards = [];
    this._handCards = [];
    this._open = false;
  }

  // ─── DOM Construction ─────────────────────────────────────────────────────

  private _ensureRoot(): void {
    if (this._root) return;
    const doc = this._container.ownerDocument;

    const root = doc.createElement('div');
    root.className = ROOT_CLASS;
    // Toàn vùng fan chặn canvas, kể cả khoảng trống giữa các lá.
    root.setAttribute('role', 'presentation');
    root.setAttribute('aria-hidden', 'true');
    root.dataset.testid = 'full-hand-fan-preview';

    const style = doc.createElement('style');
    style.textContent = buildStylesheet();

    const glow = doc.createElement('div');
    glow.className = 'fhfp-glow';

    const stage = doc.createElement('div');
    stage.className = 'fhfp-stage';

    const pager = doc.createElement("div");
    pager.className = "fhfp-pager";
    pager.style.cssText = "position:absolute;bottom:2px;left:50%;transform:translateX(-50%);z-index:1000;background:#181523;color:white;border-radius:6px;padding:2px 6px;font:12px sans-serif;white-space:nowrap";
    const previous = doc.createElement("button");
    previous.textContent = "‹";
    previous.setAttribute("aria-label", "Trang bài trước");
    const label = doc.createElement("span");
    label.style.margin = "0 6px";
    const next = doc.createElement("button");
    next.textContent = "›";
    next.setAttribute("aria-label", "Trang bài sau");
    const navigate = (direction: number) => {
      if (this._fanDrag || (direction < 0 ? previous.disabled : next.disabled)) return;
      this._hoveredSourceId = null;
      this._page += direction;
      this._showPage();
    };
    const options = { signal: this._abortController.signal };
    previous.addEventListener("click", () => navigate(-1), options);
    next.addEventListener("click", () => navigate(1), options);
    root.addEventListener("wheel", (event) => {
      if (!this._open || pager.hidden) return;
      event.preventDefault();
      const delta = event.deltaX || event.deltaY;
      if (delta) navigate(Math.sign(delta));
    }, { ...options, passive: false });
    pager.append(previous, label, next);
    this._pager = pager;
    this._pageLabel = label;
    this._pagePrev = previous;
    this._pageNext = next;

    const marqueeStart = document.createElement('div');
    marqueeStart.className = 'fhfp-marquee-start';
    marqueeStart.textContent = 'Kéo để chọn khung';
    marqueeStart.title = 'Shift thêm lá, Ctrl đảo chọn, Esc hủy';
    root.append(style, glow, stage, pager, marqueeStart);
    this._container.appendChild(root);

    this._root = root;
    this._stage = stage;
  }

  private _buildCards(): void {
    if (!this._stage) return;
    const doc = this._container.ownerDocument;
    this._stage.replaceChildren();
    this._cardEls = [];

    this._cards.forEach((card, index) => {
      const el = doc.createElement('div');
      el.className = 'fhfp-card';
      el.dataset.fanCardId = card.id;
      el.dataset.fanIndex = String(index);
      el.dataset.masked = card.masked ? 'true' : 'false';

      paintCardFace(el, card);
      this._stage!.appendChild(el);

      // M1.7.9 Part B: fan cards are interactive. Hover / click / drag intents
      // are forwarded to the app, which delegates to the REAL card pipeline
      // (no gameplay copy, no preview-only card).
      el.addEventListener('mouseover', () => {
        this._hoveredSourceId = card.id;
        this._applyCardVisuals();
        this._handlers?.onCardHover(card.id);
      });
      el.addEventListener('mouseout', (event: MouseEvent) => {
        const next = event.relatedTarget as Node | null;
        if (next && el.contains(next)) return;
        this._hoveredSourceId = null;
        this._applyCardVisuals();
      });
      el.addEventListener('mousedown', (event: MouseEvent) => {
        // Only primary left-presses start a fan drag on the real card.
        if (event.button !== 0 || event.shiftKey) return;
        this._fanPointerDown = { clientX: event.clientX, clientY: event.clientY };
        const startIndex = this._cards.findIndex((item) => item.id === card.id);
        const baseTransform = getComputedStyle(el).transform;
        const rect = el.getBoundingClientRect();
        this._fanDrag = { cardId: card.id, startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, startIndex, targetIndex: startIndex, handedOff: false, baseTransform, offsetX: rect.width ? event.clientX - (rect.left + rect.width / 2) : 0, offsetY: rect.height ? event.clientY - (rect.top + rect.height / 2) : 0 };
        this._handlers?.onFanDragStateChanged?.(card.id);
        this._draggingSourceId = card.id;
        this._applyCardVisuals();
      });
      el.addEventListener('click', (event: MouseEvent) => {
        if (this._ignoreNextClickId === card.id) {
          this._ignoreNextClickId = null;
          return;
        }
        const down = this._fanPointerDown;
        this._fanPointerDown = null;
        // Ignore the click that follows a real drag (movement beyond threshold).
        if (down) {
          const moved = Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY);
          if (moved > FAN_CLICK_MAX_MOVE_PX) return;
        }
        this._handlers?.onCardSelect(card.id, Boolean(event.ctrlKey || event.metaKey));
      });

      this._cardEls.push(el);
    });
  }

  private _relayout(): void {
    if (!this._root || this._cards.length === 0) return;

    const vw = Math.max(
      FAN_PREVIEW_LAYOUT.MIN_VIEWPORT_WIDTH_PX,
      this._root.getBoundingClientRect().width ||
        (typeof window !== 'undefined' ? window.innerWidth : 0) ||
        FAN_PREVIEW_LAYOUT.MIN_VIEWPORT_WIDTH_PX
    );
    const vh =
      (typeof window !== 'undefined' ? window.innerHeight : 0) ||
      FAN_PREVIEW_LAYOUT.MIN_CARD_HEIGHT_PX;

    const layout = computeFanLayout(this._cards.length, vw, vh);
    this._layout = layout;
    // M1.7.10: drop stale slot z values when the hand shrinks, otherwise the
    // hover/selected stacking base keeps the previous (larger) hand's max z.
    this._slotZ.length = layout.cards.length;

    layout.cards.forEach((slot, index) => {
      const card = this._cards[index];
      const el = this._cardEls[index];
      if (!el) return;
      const slotIndex = Math.max(0, this._visualOrderIds.indexOf(card?.id ?? ''));
      // Lá kéo giữ nguyên điểm neo ban đầu; chỉ các lá còn lại mở chỗ trống.
      const visualSlot = this._fanDrag?.cardId === card?.id
        ? layout.cards[this._fanDrag.startIndex] ?? slot
        : layout.cards[slotIndex] ?? slot;
      this._slotZ[index] = visualSlot.zIndex;

      el.style.left = '50%';
      el.style.setProperty('--slot-x', `${visualSlot.x.toFixed(2)}px`);

      el.style.width = `${visualSlot.width}px`;
      el.style.height = `${visualSlot.height}px`;
      const pagerHeight = this._pager?.hidden === false ? FAN_PREVIEW_LAYOUT.PAGE_CONTROLS_HEIGHT_PX : 0;
      el.style.bottom = `${FAN_PREVIEW_LAYOUT.CARD_BOTTOM_OFFSET_PX + pagerHeight}px`;
      el.style.zIndex = String(visualSlot.zIndex);
      el.style.setProperty('--dy', `${visualSlot.y.toFixed(2)}px`);
      el.style.setProperty('--rot', `${visualSlot.angleDeg.toFixed(3)}deg`);
      el.style.setProperty('--dy-enter', `${(visualSlot.y + visualSlot.height + 24).toFixed(2)}px`);
      el.style.setProperty('--rot-enter', `${(visualSlot.angleDeg * 0.35).toFixed(3)}deg`);
      el.style.setProperty(
        '--delay',
        '0ms'
      );

      // Exposed for deterministic browser/unit checks.
      el.dataset.fanX = visualSlot.x.toFixed(2);
      el.dataset.fanY = visualSlot.y.toFixed(2);
      el.dataset.fanAngle = visualSlot.angleDeg.toFixed(3);
      el.dataset.fanWidth = String(visualSlot.width);
      el.dataset.fanHeight = String(visualSlot.height);

    });
    this._applyCardVisuals();
  }

  private _resetDom(): void {
    if (this._stage) this._stage.replaceChildren();
    if (this._root) this._root.style.display = 'none';
    this._cardEls = [];
    this._cards = [];
    this._signature = '';
  }

  private _onFanMouseMove = (event: MouseEvent): void => {
    const drag = this._fanDrag;
    if (!drag || drag.handedOff || !this._root || !this._layout) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < FAN_CLICK_MAX_MOVE_PX) return;

    const rootRect = this._root.getBoundingClientRect();
    // jsdom has no layout engine and returns an empty rect; retain the browser
    // overlay's 46vh geometry for deterministic unit coverage in that case.
    const fanTop = rootRect.height > 0 ? rootRect.top : window.innerHeight * 0.54;
    if (event.clientY < fanTop) {
      drag.handedOff = true;
      this._ignoreNextClickId = drag.cardId;
      this._relayout();
      const originalDown = this._fanPointerDown;
      if (originalDown) {
        this._handlers?.onCardDragStart(drag.cardId, new MouseEvent('mousedown', {
          bubbles: true, button: 0, clientX: event.clientX, clientY: event.clientY,
        }), { x: drag.offsetX, y: drag.offsetY });
        window.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, clientX: event.clientX, clientY: event.clientY,
        }));
      }
      return;
    }

    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    const localX = event.clientX - rootRect.left;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    this._layout.cards.forEach((slot, index) => {
      const distance = Math.abs(localX - (window.innerWidth / 2 + slot.x));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    drag.targetIndex = nearestIndex;
    const nextOrder = this._cards.map((card) => card.id);
    nextOrder.splice(drag.startIndex, 1);
    nextOrder.splice(Math.max(0, Math.min(nextOrder.length, nearestIndex)), 0, drag.cardId);
    const orderChanged = nextOrder.join('|') !== this._visualOrderIds.join('|');
    this._visualOrderIds = nextOrder;
    if (orderChanged) this._relayout();
    // Gộp cập nhật con trỏ theo khung hình, không dựng lại HAND mỗi mousemove.
    if (this._dragFrame === null) this._dragFrame = requestAnimationFrame(() => {
      this._dragFrame = null;
      this._applyCardVisuals();
    });
  };

  private _onFanMouseUp = (): void => {
    const drag = this._fanDrag;
    if (!drag) return;
    this._cancelDragFrame();
    this._fanDrag = null;
    this._draggingSourceId = null;
    this._fanPointerDown = null;
    if (drag.handedOff) {
      this._visualOrderIds = this._cards.map((card) => card.id);
      this._applyCardVisuals();
      return;
    }
    if (Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY) >= FAN_CLICK_MAX_MOVE_PX) {
      this._ignoreNextClickId = drag.cardId;
      this._handlers?.onCardReorder?.(drag.cardId, this._pageOffset + drag.targetIndex);
    }
    this._handlers?.onFanDragStateChanged?.(null);
    this._visualOrderIds = this._cards.map((card) => card.id);
    this._relayout();
  };

  private _onFanDragCancelled = (): void => {
    const drag = this._fanDrag;
    if (!drag) return;
    this._cancelDragFrame();
    if (Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY) >= FAN_CLICK_MAX_MOVE_PX) {
      this._ignoreNextClickId = drag.cardId;
    }
    this._fanDrag = null;
    this._fanPointerDown = null;
    this._draggingSourceId = null;
    this._visualOrderIds = this._cards.map((card) => card.id);
    this._handlers?.onFanDragStateChanged?.(null);
    this._handlers?.onFanDragCancelled?.(drag.handedOff);
    this._relayout();
  };

  /**
   * M1.7.10: re-applies hover / selection / drag lift visuals onto the rendered
   * fan cards. Priority: drag > selected > hover > normal.
   */
  private _applyCardVisuals(): void {
    if (!this._open) return;
    const elements = this._cardEls;
    // M1.7.10: lift the active card above every neighbour. Slot z grows
    // left→right, so hover/selected/drag must beat the maximum slot z.
    let maxSlotZ = 0;
    for (const z of this._slotZ) maxSlotZ = Math.max(maxSlotZ, z ?? 0);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!;
      const sourceId = this._cards[i]?.id ?? null;
      const isDragging = sourceId !== null && sourceId === this._draggingSourceId;
      const isHandedOff = isDragging && this._fanDrag?.handedOff === true;
      const isSelected = sourceId !== null && this._selectedSourceIds.includes(sourceId);
      const isHovered = sourceId !== null && sourceId === this._hoveredSourceId;

      el.classList.toggle('fhfp-card--selected', isSelected);
      el.classList.toggle('fhfp-card--dragging', isDragging);
      el.classList.toggle('fhfp-card--handed-off', isHandedOff);
      // Chụp transform đang hiển thị lúc nhấn, giữ đúng offset và tránh hover làm nhảy bài.
      el.style.transform = isDragging && this._fanDrag && !isHandedOff
        ? `translate3d(${this._fanDrag.currentX - this._fanDrag.startX}px, ${this._fanDrag.currentY - this._fanDrag.startY}px, 0) ${this._fanDrag.baseTransform}`
        : '';
      el.style.setProperty('--dy-hover', isDragging ? '-20px' : isSelected ? '-19px' : isHovered ? '-10px' : '0px');
      el.style.setProperty('--scale', isDragging ? '1.06' : isSelected ? '1.05' : isHovered ? '1.04' : '1');
      el.style.setProperty('--drag-x', isDragging && this._fanDrag && !this._fanDrag.handedOff ? `${this._fanDrag.currentX - this._fanDrag.startX}px` : '0px');
      el.style.setProperty('--drag-y', isDragging && this._fanDrag && !this._fanDrag.handedOff ? `${this._fanDrag.currentY - this._fanDrag.startY}px` : '0px');
      if (isDragging) {
        el.style.zIndex = String(maxSlotZ + 1000);
      } else if (isSelected) {
        el.style.zIndex = String(maxSlotZ + 2);
      } else if (isHovered) {
        el.style.zIndex = String(maxSlotZ + 1);
      } else {
        el.style.zIndex = String(this._slotZ[i] ?? 0);
      }
    }
  }

  private _cancelCloseTimer(): void {
    if (this._closeTimer !== null) {
      window.clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
  }

  private _cancelDragFrame(): void {
    if (this._dragFrame !== null) cancelAnimationFrame(this._dragFrame);
    this._dragFrame = null;
  }
}
