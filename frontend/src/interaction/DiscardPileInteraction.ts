import type { DiscardTakeMode } from '@shared/types/protocol';

const DRAG_DISTANCE = 5;
const LONG_PRESS_MS = 500;
const DISCARD_HINT = 'Chuột phải: menu thao tác';

interface DiscardInteractionOptions {
  hit: (x: number, y: number) => boolean;
  topId: () => string | undefined;
  select: (selected: boolean) => void;
  menu: (x: number, y: number) => void;
  drop: (mode: DiscardTakeMode, id: string, x: number, y: number) => void;
}

export class DiscardPileInteraction {
  private readonly events = new AbortController();
  private right?: { id: number; x: number; y: number; fromPile: boolean; moved: boolean; released: boolean; opened?: boolean };
  private left?: { id: number; x: number; y: number; topId: string; shift: boolean; dragging: boolean };
  private touch?: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> };
  private touchMenuUntil = 0;
  private ghost?: HTMLElement;

  constructor(canvas: HTMLCanvasElement, private readonly options: DiscardInteractionOptions) {
    const signal = this.events.signal;
    canvas.addEventListener('pointerdown', this.down, { signal, capture: true });
    canvas.addEventListener('contextmenu', this.context, { signal, capture: true });
    canvas.addEventListener('mousemove', e => {
      if (this.options.hit(e.clientX, e.clientY)) canvas.title = DISCARD_HINT;
    }, { signal });
    window.addEventListener('pointerdown', e => {
      if (e.target !== canvas || !this.options.hit(e.clientX, e.clientY)) options.select(false);
    }, { signal, capture: true });
    window.addEventListener('pointermove', this.move, { signal, capture: true });
    window.addEventListener('pointerup', this.up, { signal, capture: true });
    window.addEventListener('pointercancel', () => this.reset(), { signal });
    window.addEventListener('blur', () => this.reset(), { signal });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.reset();
        options.select(false);
      }
    }, { signal });
  }

  dispose(): void {
    this.reset();
    this.events.abort();
  }

  private down = (event: PointerEvent): void => {
    const { clientX: x, clientY: y, pointerId: id } = event;
    const hit = this.options.hit(x, y);
    if (event.pointerType === 'touch') {
      this.clearTouch();
      if (hit) {
        this.touch = { id, x, y, timer: setTimeout(() => {
          this.touchMenuUntil = Date.now() + 900;
          this.options.menu(x, y);
        }, LONG_PRESS_MS) };
      }
      return;
    }
    if (event.button === 2) {
      // Để nguyên các sự kiện kéo phải cho bộ điều khiển camera.
      this.right = { id, x, y, fromPile: hit, moved: false, released: false };
      return;
    }
    this.right = undefined;
    if (event.button !== 0 || !hit) return;
    this.options.select(true);
    const topId = this.options.topId();
    if (topId) this.left = { id, x, y, topId, shift: event.shiftKey, dragging: false };
    event.preventDefault();
  };

  private move = (event: PointerEvent): void => {
    const { clientX: x, clientY: y, pointerId: id } = event;
    const moved = (start: { x: number; y: number }) => Math.hypot(x - start.x, y - start.y) > DRAG_DISTANCE;
    if (this.right?.id === id && !this.right.released && moved(this.right)) this.right.moved = true;
    if (this.touch?.id === id && moved(this.touch)) this.clearTouch();
    const left = this.left;
    if (!left || left.id !== id || (!left.dragging && !moved(left))) return;
    left.dragging = true;
    if (!this.ghost) {
      this.ghost = document.createElement('div');
      this.ghost.className = 'discard-drag-label';
      document.body.append(this.ghost);
    }
    this.ghost.textContent = left.shift || event.shiftKey ? 'Lấy cả chồng' : 'Lấy lá trên cùng';
    this.ghost.style.left = x + 'px';
    this.ghost.style.top = y + 'px';
  };

  private up = (event: PointerEvent): void => {
    const { clientX: x, clientY: y, pointerId: id } = event;
    if (this.touch?.id === id) this.clearTouch();
    if (this.right?.id === id) {
      this.right.moved ||= Math.hypot(x - this.right.x, y - this.right.y) > DRAG_DISTANCE;
      this.right.released = true;
      if (this.right.fromPile && !this.right.moved && this.options.hit(x, y)) {
        this.right.opened = true;
        this.options.menu(x, y);
      }
    }
    const left = this.left;
    if (left?.id !== id) return;
    this.clearLeft();
    if (left.dragging) this.options.drop(left.shift || event.shiftKey ? 'all' : 'top', left.topId, x, y);
  };

  private context = (event: MouseEvent): void => {
    const hit = this.options.hit(event.clientX, event.clientY);
    const right = this.right;
    if (!hit && !right?.fromPile) return;
    // Chỉ chặn menu mặc định khi thật sự mở menu thao tác.
    event.stopImmediatePropagation();
    if (Date.now() < this.touchMenuUntil) {
      event.preventDefault();
      return;
    }
    if (right && !right.released) return;
    this.right = undefined;
    if (!hit || (right && (!right.fromPile || right.moved))) return;
    event.preventDefault();
    if (!right?.opened) this.options.menu(event.clientX, event.clientY);
  };

  private clearLeft(): void {
    this.left = undefined;
    this.ghost?.remove();
    this.ghost = undefined;
  }

  private clearTouch(): void {
    clearTimeout(this.touch?.timer);
    this.touch = undefined;
  }

  private reset(): void {
    this.clearLeft();
    this.clearTouch();
    this.right = undefined;
    this.touchMenuUntil = 0;
  }
}
