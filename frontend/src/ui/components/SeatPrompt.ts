import type { SeatRequest } from '@shared/types/protocol';
import { SEAT_COLORS } from '../../objects/PlayerAreaConfig';

export class SeatPrompt {
  private readonly _root = document.createElement('aside');
  private readonly _pending = new Map<string, SeatRequest>();
  private _timer?: ReturnType<typeof setInterval>;
  onAction?: (id: string, accept?: boolean) => void;

  constructor(container: HTMLElement) {
    this._root.id = 'seat-prompts';
    this._root.setAttribute('aria-live', 'polite');
    container.prepend(this._root);
  }

  show(request: SeatRequest, localId: string): void {
    if (this._pending.has(request.id)) return;
    this._pending.set(request.id, request);
    const incoming = request.toId === localId;
    const card = document.createElement('section');
    card.dataset.seatRequest = request.id;
    card.dataset.direction = incoming ? 'incoming' : 'outgoing';
    const title = document.createElement('strong');
    title.textContent = incoming ? request.fromName + ' muốn đổi chỗ với bạn' : 'Đang chờ ' + request.toName + ' trả lời…';
    const seats = document.createElement('p');
    for (const [index, name] of [[request.fromIndex, request.fromName], [request.toIndex, request.toName]] as const) {
      const seat = document.createElement('span');
      const color = '#' + SEAT_COLORS[index]?.toString(16).padStart(6, '0');
      seat.style.cssText = 'display:inline-block;border-left:4px solid ' + color + ';padding:0 6px;margin:2px';
      seat.textContent = 'Ghế ' + (index + 1) + ' · ' + name;
      seats.append(seat);
    }
    const remaining = document.createElement('span');
    remaining.className = 'seat-countdown';
    const controls = document.createElement('div');
    controls.className = 'seat-controls';
    controls.append(remaining);
    card.append(title, seats, controls);
    const actions = incoming ? [['Đồng ý', true], ['Từ chối', false]] as const : [['Hủy', undefined]] as const;
    for (const [label, accept] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = () => {
        for (const control of card.querySelectorAll('button')) control.disabled = true;
        this.onAction?.(request.id, accept);
      };
      controls.append(button);
    }
    this._root.append(card);
    this._tick();
    if (!this._timer) this._timer = setInterval(this._tick, 250);
  }

  private _tick = (): void => {
    for (const card of this._root.querySelectorAll<HTMLElement>('[data-seat-request]')) {
      const id = card.dataset.seatRequest!;
      const seconds = Math.ceil((this._pending.get(id)!.expiresAt - Date.now()) / 1000);
      if (seconds <= 0) this.remove(id);
      else card.querySelector('.seat-countdown')!.textContent = seconds + ' giây';
    }
  };

  remove(id: string): void {
    this._pending.delete(id);
    for (const card of this._root.children) {
      if ((card as HTMLElement).dataset.seatRequest === id) { card.remove(); break; }
    }
    if (!this._pending.size) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  clear(): void {
    for (const id of this._pending.keys()) this.remove(id);
  }

  dispose(): void {
    this.clear();
    this._root.remove();
  }
}
