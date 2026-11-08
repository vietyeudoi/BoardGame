import './DeckViewPanel.css';
import type { DeckViewState } from '@shared/types/protocol';
import { createCardFace } from './CardFaceDOM';

const CARD_SELECTOR = '[data-alter-token]';
const MIN_DRAG_DISTANCE = 5;

interface CardDrag {
  pointerId: number;
  source: HTMLElement;
  x: number;
  y: number;
  ghost?: HTMLElement;
  target?: HTMLElement;
}

export class DeckAlterStrip {
  private readonly _element = document.createElement('section');
  private readonly _scroll: HTMLElement;
  private readonly _cards: HTMLElement;
  private readonly _events = new AbortController();
  private _drag?: CardDrag;
  private _sessionId?: string;
  private _initialOrder: number[] = [];
  private _selected?: HTMLElement;
  private _nodes = new Map<number, HTMLElement>();
  onOrder?: (order: number[]) => void;

  constructor(container: HTMLElement) {
    this._element.id = 'deck-alter-strip';
    this._element.hidden = true;
    this._element.setAttribute('aria-label', 'Xếp thứ tự chồng bài');
    this._element.innerHTML = `
      <header><strong class="deck-view-title"></strong><small>Chỉ mình bạn thấy</small></header>
      <div class="deck-view-direction">← Trên cùng <span>Sâu hơn →</span></div>
      <div class="deck-view-scroll" aria-label="Thứ tự từ đỉnh chồng" tabindex="0">
        <div class="deck-alter-cards"></div>
      </div>
      <footer class="deck-view-footer"><button type="button" class="deck-view-reset">Khôi phục thứ tự ban đầu</button></footer>
    `;
    this._scroll = this._element.querySelector<HTMLElement>('.deck-view-scroll')!;
    this._cards = this._element.querySelector<HTMLElement>('.deck-alter-cards')!;
    container.append(this._element);
    const options = { signal: this._events.signal };
    this._element.addEventListener('contextmenu', event => event.preventDefault(), options);
    this._element.querySelector('.deck-view-reset')!.addEventListener('click', () => {
      this._select(undefined);
      this.onOrder?.(this._initialOrder.slice());
    }, options);
    this._cards.addEventListener('keydown', event => {
      if (!this._element.hasAttribute('data-alter') || !['Enter', ' '].includes(event.key)) return;
      const card = (event.target as HTMLElement).closest<HTMLElement>(CARD_SELECTOR);
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      this._choose(card);
    }, options);
    this._scroll.addEventListener('wheel', event => {
      if (event.shiftKey || event.deltaX || this._scroll.scrollWidth <= this._scroll.clientWidth) return;
      if (this._scroll.scrollHeight > this._scroll.clientHeight) return;
      event.preventDefault();
      this._scroll.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    }, { ...options, passive: false });
    this._cards.addEventListener('pointerdown', this._onDown, options);
    this._cards.addEventListener('pointermove', this._onMove, options);
    this._cards.addEventListener('pointerup', this._onUp, options);
    this._cards.addEventListener('pointercancel', this._cancel, options);
    this._cards.addEventListener('lostpointercapture', this._cancel, options);
    window.addEventListener('blur', () => this._endDrag(), options);
  }

  mountControls(...controls: HTMLElement[]): void {
    this._element.querySelector('.deck-view-footer')!.append(...controls);
  }

  sync(view: DeckViewState | null): void {
    this._endDrag();
    this._select(undefined);
    this._element.hidden = !view;
    if (!view) {
      this._sessionId = undefined;
      this._nodes.clear();
      this._cards.replaceChildren();
      return;
    }
    const fresh = this._sessionId !== view.id;
    if (fresh) {
      this._sessionId = view.id;
      this._initialOrder = view.cards.map(card => card.token);
      this._nodes.clear();
      this._scroll.scrollLeft = 0;
      this._scroll.scrollTop = 0;
    }
    const alter = view.mode === 'alter';
    this._element.toggleAttribute('data-alter', alter);
    this._element.querySelector('.deck-view-title')!.textContent =
      (alter ? 'Sắp xếp ' : 'Xem ') + view.cards.length + ' lá trên cùng';
    const reset = this._element.querySelector<HTMLButtonElement>('.deck-view-reset')!;
    reset.hidden = !alter;
    reset.disabled = view.cards.every((card, index) => card.token === this._initialOrder[index]);

    // Giữ các nút lá theo token để kéo thả không dựng lại mặt bài sau mỗi lần đổi.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const previous = new Map(reduced || fresh ? [] :
      [...this._nodes.values()].map(card => [card, card.getBoundingClientRect().left] as const));
    const nodes = view.cards.map(({ token, cardType }, index) => {
      let card = this._nodes.get(token);
      if (!card) {
        card = this._createCard(token, cardType, alter);
        this._nodes.set(token, card);
      }
      card.querySelector('.deck-view-number')!.textContent = String(index + 1);
      card.querySelector('.deck-view-depth')!.textContent = index === 0 ? 'Trên cùng' :
        index === view.cards.length - 1 ? 'Sâu nhất trong phiên' : '';
      return card;
    });
    if (fresh) this._cards.replaceChildren(...nodes);
    else nodes.forEach((node, index) => {
      const at = this._cards.children[index];
      if (node !== at) this._cards.insertBefore(node, at ?? null);
    });
    for (const [node, left] of previous) {
      const delta = left - node.getBoundingClientRect().left;
      if (delta) node.animate?.([{ translate: delta + 'px' }, { translate: '0' }], { duration: 180, easing: 'ease-out' });
    }
  }

  private _createCard(token: number, type: string | undefined, alter: boolean): HTMLElement {
    const card = document.createElement('article');
    card.className = 'deck-alter-card';
    card.dataset.alterToken = String(token);
    card.tabIndex = alter ? 0 : -1;
    if (alter) {
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');
    }
    const number = document.createElement('span');
    number.className = 'deck-view-number';
    const depth = document.createElement('small');
    depth.className = 'deck-view-depth';
    card.append(createCardFace(document, type, 'large'), number, depth);
    return card;
  }

  private _select(card: HTMLElement | undefined): void {
    this._selected?.setAttribute('aria-pressed', 'false');
    this._selected = card;
    card?.setAttribute('aria-pressed', 'true');
  }

  private _choose(card: HTMLElement): void {
    const first = this._selected;
    if (!first || first === card) {
      this._select(first ? undefined : card);
      return;
    }
    this._select(undefined);
    const cards = Array.from(this._cards.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    const order = cards.map(item => Number(item.dataset.alterToken));
    const a = cards.indexOf(first);
    const b = cards.indexOf(card);
    [order[a], order[b]] = [order[b]!, order[a]!];
    this.onOrder?.(order);
  }

  private _onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this._drag || !this._element.hasAttribute('data-alter')) return;
    const source = (event.target as HTMLElement).closest<HTMLElement>(CARD_SELECTOR);
    if (!source) return;
    this._drag = { pointerId: event.pointerId, source, x: event.clientX, y: event.clientY };
    this._cards.setPointerCapture(event.pointerId);
  };

  private _targetAt(event: PointerEvent): HTMLElement | undefined {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(CARD_SELECTOR);
    return target && this._cards.contains(target) ? target : undefined;
  }

  private _onMove = (event: PointerEvent): void => {
    const drag = this._drag;
    if (drag?.pointerId !== event.pointerId) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < MIN_DRAG_DISTANCE) return;
      const ghost = drag.source.cloneNode(true) as HTMLElement;
      delete ghost.dataset['alterToken'];
      ghost.classList.add('deck-alter-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = drag.source.offsetWidth + 'px';
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.source.dataset['source'] = '';
    }
    drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
    const target = this._targetAt(event);
    if (drag.target !== target) {
      drag.target?.removeAttribute('data-target');
      drag.target = target;
      if (target && target !== drag.source) target.dataset['target'] = '';
    }
  };

  private _onUp = (event: PointerEvent): void => {
    const drag = this._drag;
    if (drag?.pointerId !== event.pointerId) return;
    const target = drag.ghost ? this._targetAt(event) : undefined;
    this._endDrag();
    if (!drag.ghost) { this._choose(drag.source); return; }
    if (!target || target === drag.source) return;
    const cards = Array.from(this._cards.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    const order = cards.map(card => Number(card.dataset['alterToken']));
    // Giống thao tác trên bàn, các lá ở giữa dịch một vị trí.
    order.splice(cards.indexOf(target), 0, ...order.splice(cards.indexOf(drag.source), 1));
    this.onOrder?.(order);
  };

  private _cancel = (event: PointerEvent): void => {
    if (this._drag?.pointerId === event.pointerId) this._endDrag();
  };

  private _endDrag(): void {
    const drag = this._drag;
    if (!drag) return;
    this._drag = undefined;
    drag.source.removeAttribute('data-source');
    drag.target?.removeAttribute('data-target');
    drag.ghost?.remove();
    if (this._cards.hasPointerCapture(drag.pointerId)) this._cards.releasePointerCapture(drag.pointerId);
  }

  dispose(): void {
    this._endDrag();
    this._events.abort();
    this._element.remove();
  }
}
