import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullHandFanPreviewUI } from '../ui/components/FullHandFanPreviewUI';

describe('Fan preview: kéo mượt và giữ DOM', () => {
  let container: HTMLDivElement;
  let fan: FullHandFanPreviewUI;
  let frame: FrameRequestCallback | null;
  const cards = Array.from({ length: 3 }, (_, i) => ({ id: `card-${i}`, cardType: 'attack', title: 'Tấn công' }));
  const fire = (target: EventTarget, type: string, x: number, y: number) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));

  beforeEach(() => {
    frame = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    container = document.createElement('div');
    document.body.append(container);
    fan = new FullHandFanPreviewUI(container);
    fan.show(cards);
  });
  afterEach(() => {
    fan.dispose();
    container.remove();
    vi.unstubAllGlobals();
  });

  it('hiện tên lá ở đầu lá và tên bộ ở nhãn phụ, chỉ khi được thấy mặt lá', () => {
    const reverse = { id: 'reverse', cardType: 'imploding:reverse', title: 'Đảo chiều' };
    fan.update([reverse]);
    const face = fan.getCardElements()[0]!;
    expect(face.querySelector('.fhfp-banner')?.textContent).toBe('Reverse');
    expect(face.querySelector('.fhfp-pack-label')?.textContent).toBe('Imploding Kittens');

    fan.update([{ ...reverse, masked: true }]);
    expect(face.querySelector('.fhfp-pack-label')).toBeNull();
    expect(face.textContent).not.toContain('Reverse');
  });

  it('Đổi thứ tự giữ đúng element để CSS chuyển mượt từ slot cũ', () => {
    const before = fan.getCardElements();
    fan.update([cards[2]!, cards[0]!, cards[1]!]);
    expect(fan.getCardElements()).toEqual([before[2], before[0], before[1]]);
    expect(fan.getCardElements()[0]!.style.left).toBe('50%');
    expect(fan.getRenderedCardIds()).toEqual(['card-2', 'card-0', 'card-1']);
  });

  it('Kéo qua nhiều slot giữ điểm neo lá đang kéo, chỉ các lá khác đổi slot', () => {
    const el = fan.getCardElements()[0]!;
    const initialSlot = el.style.getPropertyValue('--slot-x');
    fire(el, 'mousedown', 350, 650);
    fire(window, 'mousemove', 850, 650);
    fire(window, 'mousemove', 860, 655);
    expect(el.style.getPropertyValue('--slot-x')).toBe(initialSlot);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    frame?.(0);
    expect(el.style.transform).toContain('translate3d(510px, 5px, 0)');
    expect(el.classList.contains('fhfp-card--dragging')).toBe(true);
    fire(window, 'mouseup', 860, 655);
    expect(el.classList.contains('fhfp-card--dragging')).toBe(false);
    expect(el.style.transform).toBe('');
  });

  it('Hủy bằng Esc trả thứ tự gốc và lần kéo tiếp theo vẫn hoạt động', () => {
    const reorder = vi.fn();
    const state = vi.fn();
    fan.setHandlers({ onCardHover: vi.fn(), onCardSelect: vi.fn(), onCardDragStart: vi.fn(), onCardReorder: reorder, onFanDragStateChanged: state });
    const el = fan.getCardElements()[0]!;
    fire(el, 'mousedown', 350, 650);
    fire(window, 'mousemove', 850, 650);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(state).toHaveBeenLastCalledWith(null);
    expect(reorder).not.toHaveBeenCalled();
    expect(fan.getRenderedCardIds()).toEqual(cards.map((card) => card.id));
    fire(el, 'mousedown', 350, 650);
    fire(window, 'mousemove', 850, 650);
    fire(window, 'mouseup', 850, 650);
    expect(reorder).toHaveBeenCalledWith('card-0', 2);
  });

  it('Ẩn fan khi bàn nhận lá kéo, không hủy thao tác 3D', () => {
    const cancel = vi.fn();
    const handoff = vi.fn(() => fan.closeAfterHandoff());
    fan.setHandlers({ onCardHover: vi.fn(), onCardSelect: vi.fn(), onCardDragStart: handoff, onFanDragCancelled: cancel });
    fire(fan.getCardElements()[0]!, 'mousedown', 350, 650);
    fire(window, 'mousemove', 360, 220);
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(fan.isOpen()).toBe(false);
    expect(fan.getRootElement()!.style.pointerEvents).toBe('none');
    fire(window, 'mouseup', 360, 220);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('duyệt 121 lá theo trang và kéo đúng ID ở trang cuối', () => {
    const hand = Array.from({ length: 121 }, (_, i) => ({ id: 'large-' + i, cardType: 'attack', title: 'Lá ' + i }));
    const select = vi.fn();
    const drag = vi.fn();
    fan.setHandlers({ onCardHover: vi.fn(), onCardSelect: select, onCardDragStart: drag });
    fan.show(hand);
    const next = fan.getRootElement()!.querySelector<HTMLButtonElement>('[aria-label="Trang bài sau"]')!;
    const seen: string[] = [...fan.getRenderedCardIds()];
    expect(seen.length).toBeLessThan(121);
    while (!next.disabled) {
      next.click();
      seen.push(...fan.getRenderedCardIds());
    }
    expect(seen).toEqual(hand.map(card => card.id));
    const last = fan.getCardElements().at(-1)!;
    fire(last, 'click', 500, 650);
    expect(select).toHaveBeenCalledWith('large-120', false);
    fire(last, 'mousedown', 500, 650);
    fire(window, 'mousemove', 500, 180);
    expect(drag.mock.calls[0]?.[0]).toBe('large-120');
  });

  it('đổi mặt ngay trên fan và giữ đúng node cùng slot khi lật nhiều lá', () => {
    const original = fan.getCardElements();
    const slots = original.map(el => el.dataset.fanX);
    fan.update(cards.map((card, index) => ({ ...card, masked: index < 2 })));
    expect(fan.getCardElements()).toEqual(original);
    expect(original.map(el => el.dataset.masked)).toEqual(['true', 'true', 'false']);
    expect(original.map(el => el.dataset.fanX)).toEqual(slots);
    fan.update(cards);
    expect(original.map(el => el.dataset.masked)).toEqual(['false', 'false', 'false']);
  });

  it('Fan đóng không chặn chuột, mở lại khôi phục vùng chặn', () => {
    expect(getComputedStyle(fan.getRootElement()!).pointerEvents).toBe('auto');
    fan.hide();
    expect(getComputedStyle(fan.getRootElement()!).pointerEvents).toBe('none');
    expect(getComputedStyle(fan.getCardElements()[0] ?? container.querySelector('.fhfp-card')!).pointerEvents).toBe('none');
    fan.show(cards);
    expect(getComputedStyle(fan.getRootElement()!).pointerEvents).toBe('auto');
  });
});
