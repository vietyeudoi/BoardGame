import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckViewState } from '@shared/types/protocol';
import { DeckAlterStrip } from '../ui/components/DeckAlterStrip';

const view: DeckViewState = {
  id: 'alter', mode: 'alter', viewerId: 'player', viewerName: 'Người chơi', seat: 0,
  cards: [{ token: 3, cardType: 'defuse' }, { token: 1, cardType: 'nope' }, { token: 2, cardType: 'skip' }],
};

describe('DeckAlterStrip', () => {
  let host: HTMLElement;
  let strip: DeckAlterStrip;
  let cards: HTMLElement[];
  let elementFromPoint: ReturnType<typeof vi.fn>;
  let originalHitTest: PropertyDescriptor | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    strip = new DeckAlterStrip(host);
    strip.sync(view);
    cards = [...host.querySelectorAll<HTMLElement>('[data-alter-token]')];
    const row = cards[0]!.parentElement!;
    Object.assign(row, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
    elementFromPoint = vi.fn();
    originalHitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });
  });

  afterEach(() => {
    strip.dispose();
    host.remove();
    if (originalHitTest) Object.defineProperty(document, 'elementFromPoint', originalHitTest);
    else Reflect.deleteProperty(document, 'elementFromPoint');
  });

  function pointer(type: string, target: HTMLElement, x: number) {
    target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x }), { pointerId: 1 }));
  }

  it('kéo trực tiếp một lá vào vị trí mới và gửi đúng thứ tự mã phiên', () => {
    strip.onOrder = vi.fn();
    expect(cards[0]!.textContent).toContain('Gỡ Bom');
    pointer('pointerdown', cards[0]!, 10);
    elementFromPoint.mockReturnValue(cards[2]!.firstElementChild);
    pointer('pointermove', cards[0]!, 60);
    expect(cards[2]!.hasAttribute('data-target')).toBe(true);
    expect(document.querySelector('.deck-alter-ghost')).not.toBeNull();
    pointer('pointerup', cards[0]!, 60);
    expect(strip.onOrder).toHaveBeenCalledWith([1, 2, 3]);
    expect(document.querySelector('.deck-alter-ghost')).toBeNull();
  });

  it('đặt tên lá mở rộng trước nhãn bộ', () => {
    strip.sync({ ...view, id: 'expansion', cards: [{ token: 0, cardType: 'imploding:reverse' }] });
    const card = host.querySelector('[data-alter-token]')!;
    expect(card.querySelector('.fhfp-rules-name')?.textContent).toBe('Đảo chiều');
    expect(card.querySelector('.fhfp-pack-label')?.textContent).toBe('Imploding Kittens');
    expect(card.querySelector('.fhfp-rules-description')?.textContent?.replace(/\s+/g, ' ')).toContain('Khi có hai người');
  });

  it('bỏ thao tác thả ra ngoài và xóa các lá khi phiên đóng', () => {
    strip.onOrder = vi.fn();
    pointer('pointerdown', cards[0]!, 10);
    elementFromPoint.mockReturnValue(null);
    pointer('pointermove', cards[0]!, 60);
    pointer('pointerup', cards[0]!, 60);
    expect(strip.onOrder).not.toHaveBeenCalled();
    strip.sync(null);
    expect(host.querySelector('#deck-alter-strip')?.hasAttribute('hidden')).toBe(true);
    expect(host.querySelectorAll('[data-alter-token]')).toHaveLength(0);
  });
});
