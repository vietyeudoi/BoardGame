import { describe, expect, it, vi } from 'vitest';
import { DiscardPileInteraction } from '../interaction/DiscardPileInteraction';
import { ContextMenu } from '../ui/ContextMenu';

function pointer(type: string, x: number, button: number, shiftKey = false, pointerType = 'mouse') {
  return Object.assign(new MouseEvent(type, { clientX: x, button, shiftKey, bubbles: true, cancelable: true }), {
    pointerId: 1, pointerType,
  });
}

describe('Thao tác chồng bỏ', () => {
  it('chuột phải đứng yên mở một lần, kéo phải vẫn truyền move và giữ menu mặc định', () => {
    const canvas = document.body.appendChild(document.createElement('canvas'));
    const menu = vi.fn();
    const move = vi.fn();
    window.addEventListener('pointermove', move);
    const interaction = new DiscardPileInteraction(canvas, { hit: x => x < 30, topId: () => 'top',
      select: vi.fn(), menu, drop: vi.fn() });
    try {
      canvas.dispatchEvent(pointer('pointerdown', 10, 2));
      canvas.dispatchEvent(pointer('pointermove', 24, 2));
      canvas.dispatchEvent(pointer('pointerup', 24, 2));
      const dragMenu = pointer('contextmenu', 24, 2);
      canvas.dispatchEvent(dragMenu);
      expect(move).toHaveBeenCalled();
      expect(dragMenu.defaultPrevented).toBe(false);
      expect(menu).not.toHaveBeenCalled();

      canvas.dispatchEvent(pointer('pointerdown', 10, 2));
      canvas.dispatchEvent(pointer('pointerup', 12, 2));
      const clickMenu = pointer('contextmenu', 12, 2);
      canvas.dispatchEvent(clickMenu);
      expect(clickMenu.defaultPrevented).toBe(true);
      expect(menu).toHaveBeenCalledOnce();
    } finally {
      interaction.dispose();
      canvas.remove();
      window.removeEventListener('pointermove', move);
    }
  });

  it('chọn bằng click, kéo thường hoặc Shift với ID đỉnh lúc bắt đầu và bỏ chọn bằng Esc', () => {
    const canvas = document.body.appendChild(document.createElement('canvas'));
    let id = 'top-a';
    const drop = vi.fn();
    const select = vi.fn();
    const interaction = new DiscardPileInteraction(canvas, { hit: x => x < 30, topId: () => id, select, menu: vi.fn(), drop });
    try {
      canvas.dispatchEvent(pointer('pointerdown', 10, 0));
      canvas.dispatchEvent(pointer('pointerup', 10, 0));
      expect(select).toHaveBeenLastCalledWith(true);
      expect(drop).not.toHaveBeenCalled();

      canvas.dispatchEvent(pointer('pointerdown', 10, 0));
      id = 'top-b';
      canvas.dispatchEvent(pointer('pointermove', 70, 0));
      canvas.dispatchEvent(pointer('pointerup', 70, 0));
      expect(drop).toHaveBeenLastCalledWith('top', 'top-a', 70, 0);

      canvas.dispatchEvent(pointer('pointerdown', 10, 0, true));
      canvas.dispatchEvent(pointer('pointermove', 70, 0, true));
      canvas.dispatchEvent(pointer('pointerup', 70, 0, true));
      expect(drop).toHaveBeenLastCalledWith('all', 'top-b', 70, 0);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(select).toHaveBeenLastCalledWith(false);
    } finally {
      interaction.dispose();
      canvas.remove();
    }
  });

  it('mở menu khi chạm giữ, bỏ qua khi ngón tay trượt', () => {
    vi.useFakeTimers();
    const canvas = document.body.appendChild(document.createElement('canvas'));
    const menu = vi.fn();
    const interaction = new DiscardPileInteraction(canvas, { hit: () => true, topId: () => 'top', select: vi.fn(), menu, drop: vi.fn() });
    try {
      canvas.dispatchEvent(pointer('pointerdown', 12, 0, false, 'touch'));
      canvas.dispatchEvent(pointer('pointermove', 40, 0, false, 'touch'));
      vi.advanceTimersByTime(500);
      expect(menu).not.toHaveBeenCalled();
      canvas.dispatchEvent(pointer('pointerdown', 14, 0, false, 'touch'));
      vi.advanceTimersByTime(500);
      expect(menu).toHaveBeenCalledWith(14, 0);
    } finally {
      interaction.dispose();
      canvas.remove();
      vi.useRealTimers();
    }
  });

  it('menu bỏ qua mục vô hiệu và đóng khi dùng phím, click ngoài, cuộn hoặc đổi cỡ', () => {
    const root = document.body.appendChild(document.createElement('div'));
    const menu = new ContextMenu(root);
    const open = vi.fn();
    const disabled = vi.fn();
    const take = vi.fn();
    const show = () => menu.show(innerWidth, innerHeight, [
      { label: 'Xem', action: open }, { label: 'Vô hiệu', disabled: true, action: disabled },
      { label: 'Lấy', action: take },
    ]);
    try {
      show();
      expect(root.querySelector('[aria-disabled="true"]')?.textContent).toBe('Vô hiệu');
      expect(parseFloat(root.firstElementChild!.getAttribute('style')!.match(/left: ([\d.]+)/)![1]!)).toBeLessThan(innerWidth);
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(take).toHaveBeenCalledOnce();
      expect(disabled).not.toHaveBeenCalled();
      expect(menu.isOpen()).toBe(false);
      for (const event of [new KeyboardEvent('keydown', { key: 'Escape' }), new Event('scroll'), new Event('resize'), new Event('pointerdown')]) {
        show();
        window.dispatchEvent(event);
        expect(menu.isOpen()).toBe(false);
      }
    } finally {
      menu.dispose();
      root.remove();
    }
  });
});
