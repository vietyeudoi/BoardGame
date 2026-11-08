import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import type { CardType } from '@shared/types/gameObjects';
import type { DeckViewState } from '@shared/types/protocol';
import { getCardTitle } from '../../objects/CardTypeHelper';
import { FAN_CARD_ART, getPackCardArt } from '../../utils/CardArt';

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
  private readonly _cards: HTMLElement;
  private readonly _events = new AbortController();
  private _drag?: CardDrag;
  onOrder?: (order: number[]) => void;

  constructor(container: HTMLElement) {
    this._element.id = 'deck-alter-strip';
    this._element.hidden = true;
    this._element.setAttribute('aria-label', 'Xếp thứ tự chồng bài');
    this._element.innerHTML = `
      <style>
        #deck-alter-strip {
          position:absolute;top:104px;left:16px;max-width:min(480px,calc(100% - 32px));
          box-sizing:border-box;padding:10px;border-radius:12px;border:1px solid #475569;
          background:#131823ef;color:#f1f5f9;font:13px system-ui;pointer-events:auto;z-index:2;
        }
        .deck-alter-cards { display:flex;gap:8px;overflow-x:auto;padding:5px 2px; }
        .deck-alter-card {
          flex:0 0 84px;display:grid;align-content:start;gap:5px;box-sizing:border-box;
          width:84px;min-height:96px;padding:6px;border:1px solid #64748b;border-radius:8px;
          color:#f8fafc;background:#242b3b;text-align:center;font:600 12px system-ui;
          cursor:grab;touch-action:none;user-select:none;
        }
        .deck-alter-card[data-source] { opacity:.35; }
        .deck-alter-card[data-target] { outline:2px solid #fbbf24;outline-offset:-2px; }
        .deck-alter-ghost { position:fixed;top:0;left:0;z-index:1000;pointer-events:none;cursor:grabbing; }
        .deck-alter-icon { font-size:20px; }
        .deck-alter-pack { font-size:.67rem;font-weight:400;color:#cbd5e1; }
      </style>
      <strong>Alter · Kéo thẻ vào vị trí mới</strong>
      <div class="deck-alter-cards" aria-label="Thứ tự từ đỉnh chồng"></div>
    `;
    this._cards = this._element.querySelector<HTMLElement>('.deck-alter-cards')!;
    container.append(this._element);
    const options = { signal: this._events.signal };
    this._cards.addEventListener('pointerdown', this._onDown, options);
    this._cards.addEventListener('pointermove', this._onMove, options);
    this._cards.addEventListener('pointerup', this._onUp, options);
    this._cards.addEventListener('pointercancel', this._cancel, options);
    this._cards.addEventListener('lostpointercapture', this._cancel, options);
    window.addEventListener('blur', () => this._endDrag(), options);
  }

  sync(view: DeckViewState | null): void {
    this._endDrag();
    this._element.hidden = !view;
    this._cards.replaceChildren(...(view?.cards.map(({ token, cardType }, index) => {
      const card = document.createElement('div');
      const art = cardType ? FAN_CARD_ART[cardType] : undefined;
      const title = getCardTitle(cardType);
      const expansion = getPackCardArt(cardType);
      card.className = 'deck-alter-card';
      card.dataset['alterToken'] = String(token);
      card.title = title;
      if (art || expansion) card.style.borderColor = art?.accent ?? expansion!.color;
      const position = document.createElement('span');
      position.textContent = String(index + 1);
      const icon = document.createElement('span');
      icon.className = expansion ? 'deck-alter-pack' : 'deck-alter-icon';
      icon.textContent = expansion?.pack ?? art?.icon ?? '🂠';
      icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong');
      name.textContent = CARD_DEFINITIONS.get(cardType as CardType)?.name ?? title;
      if (expansion) card.append(position, name, icon);
      else card.append(position, icon, name);
      return card;
    }) ?? []));
  }

  private _onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this._drag) return;
    const source = (event.target as HTMLElement).closest<HTMLElement>(CARD_SELECTOR);
    if (!source) return;
    this._drag = { pointerId: event.pointerId, source, x: event.clientX, y: event.clientY };
    this._cards.setPointerCapture(event.pointerId);
    event.preventDefault();
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
      this._element.append(ghost);
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
