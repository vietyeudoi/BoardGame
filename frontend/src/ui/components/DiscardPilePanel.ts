import type { SandboxObject } from '@shared/types/room';
import { createCardFace } from './CardFaceDOM';
import './DiscardPilePanel.css';

interface DiscardRow {
  element: HTMLElement;
  face: HTMLElement;
  label: HTMLElement;
  flip: HTMLButtonElement;
  signature: string;
  card: SandboxObject;
}

export class DiscardPilePanel {
  private readonly panel = document.createElement('section');
  private readonly list = document.createElement('div');
  private readonly title = document.createElement('strong');
  private readonly events = new AbortController();
  private readonly rows = new Map<string, DiscardRow>();
  private readonly observer?: IntersectionObserver;
  private cards: readonly SandboxObject[] = [];
  private order: string[] = [];
  private draggable = false;
  private pointer?: { id: number; row: DiscardRow; x: number; y: number; ghost?: HTMLElement };

  constructor(
    container: HTMLElement,
    private readonly drop: (id: string, x: number, y: number) => void,
    private readonly requestFlip?: (id: string) => void,
  ) {
    this.panel.className = 'discard-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Chồng bài bỏ');
    this.panel.setAttribute('role', 'region');
    const header = document.createElement('header');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Đóng';
    this.list.className = 'discard-list';
    header.append(this.title, close);
    this.panel.append(header, this.list);
    container.append(this.panel);
    const options = { signal: this.events.signal };
    close.addEventListener('click', () => this.hide(), options);
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.panel.hidden && !document.activeElement?.closest('#tabletop-context-menu')) {
        this.hide();
        event.stopPropagation();
      }
    }, { ...options, capture: true });
    window.addEventListener('pointermove', this.move, options);
    window.addEventListener('pointerup', this.up, options);
    window.addEventListener('pointercancel', () => this.endDrag(), options);
    window.addEventListener('blur', () => this.endDrag(), options);

    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const row = this.rows.get((entry.target as HTMLElement).dataset.discardId ?? '');
          if (!row || row.element !== entry.target) continue;
          if (entry.isIntersecting && !this.panel.hidden) this.mountFace(row);
          else row.face.replaceChildren();
        }
      }, { root: this.list });
    }
  }

  sync(cards: readonly SandboxObject[], draggable: boolean): void {
    this.cards = cards;
    this.draggable = draggable;
    if (!this.panel.hidden) this.render();
  }

  show(): void {
    if (!this.panel.hidden) return;
    this.panel.hidden = false;
    this.render();
    this.panel.querySelector('button')?.focus();
  }

  hide(): void {
    this.endDrag();
    this.panel.hidden = true;
    this.observer?.disconnect();
    this.rows.clear();
    this.order = [];
    this.list.replaceChildren();
  }

  dispose(): void {
    this.hide();
    this.events.abort();
    this.panel.remove();
  }

  private render(): void {
    this.title.textContent = 'Chồng bài bỏ · ' + this.cards.length + ' lá';
    const ids = this.cards.map(card => card.id);
    const live = new Set(ids);
    for (const [id, row] of this.rows) {
      if (!live.has(id)) {
        if (this.pointer?.row === row) this.endDrag();
        this.observer?.unobserve(row.element);
        row.element.remove();
        this.rows.delete(id);
      }
    }
    if (!this.draggable) this.endDrag();
    const changed = ids.length !== this.order.length || ids.some((id, index) => id !== this.order[index]);
    const rows = this.cards.map((card, index) => {
      let row = this.rows.get(card.id);
      const signature = JSON.stringify([card.faceUp, card.cardType, card.faceImage]);
      if (!row) {
        const element = document.createElement('article');
        element.dataset.discardId = card.id;
        const face = document.createElement('div');
        face.className = 'discard-face';
        const label = document.createElement('span');
        const flip = document.createElement('button');
        flip.type = 'button';
        flip.className = 'discard-flip';
        element.append(face, label, flip);
        row = { element, face, label, flip, card, signature };
        this.rows.set(card.id, row);
        const pointerRow = row;
        flip.addEventListener('click', () => this.requestFlip?.(pointerRow.card.id));
        element.addEventListener('pointerdown', event => {
          if (event.button !== 0 || !this.draggable || this.pointer || flip.contains(event.target as Node)) return;
          this.pointer = { id: event.pointerId, row: pointerRow, x: event.clientX, y: event.clientY };
          element.setPointerCapture?.(event.pointerId);
          if (event.pointerType === 'mouse') event.preventDefault();
        });
      } else if (row.signature !== signature) {
        const mounted = row.face.hasChildNodes();
        row.signature = signature;
        row.card = card;
        row.face.replaceChildren();
        if (mounted) this.mountFace(row);
      }
      row.label.textContent = String(index + 1);
      row.flip.disabled = !this.draggable || !this.requestFlip || !!card.lockedBy;
      row.flip.textContent = card.faceUp ? 'Úp' : 'Lật';
      row.flip.setAttribute('aria-label', (card.faceUp ? 'Úp lá ' : 'Lật lá ') + (index + 1));
      row.element.classList.toggle('discard-draggable', this.draggable);
      return row;
    });

    if (changed) {
      const scroll = this.list.scrollTop;
      rows.forEach((row, index) => {
        const current = this.list.children[index];
        if (current !== row.element) this.list.insertBefore(row.element, current ?? null);
      });
      this.list.scrollTop = scroll;
      this.order = ids;
      for (const row of rows) {
        if (this.observer) this.observer.observe(row.element);
        else this.mountFace(row);
      }
    }
  }

  private mountFace(row: DiscardRow): void {
    if (row.face.hasChildNodes()) return;
    const card = row.card;
    const face = createCardFace(document, card.faceUp ? card.cardType : undefined, 'small',
      card.faceUp ? card.faceImage : undefined);
    row.face.append(face);
  }

  private move = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.ghost) {
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
      this.mountFace(pointer.row);
      pointer.ghost = pointer.row.face.cloneNode(true) as HTMLElement;
      pointer.ghost.className = 'discard-pile-ghost';
      document.body.append(pointer.ghost);
    }
    pointer.ghost.style.left = event.clientX + 'px';
    pointer.ghost.style.top = event.clientY + 'px';
  };

  private up = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.id) return;
    const shouldDrop = !!pointer.ghost;
    this.endDrag();
    if (shouldDrop) this.drop(pointer.row.card.id, event.clientX, event.clientY);
  };

  private endDrag(): void {
    const pointer = this.pointer;
    if (!pointer) return;
    this.pointer = undefined;
    pointer.ghost?.remove();
    if (pointer.row.element.hasPointerCapture?.(pointer.id)) {
      pointer.row.element.releasePointerCapture(pointer.id);
    }
  }
}
