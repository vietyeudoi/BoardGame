import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameScreen } from '../ui/GameScreen';
import { SeatPrompt } from '../ui/components/SeatPrompt';

describe('HUD bàn chơi', () => {
  let root: HTMLDivElement;
  let game: GameScreen;

  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    document.body.append(root);
    game = new GameScreen(root);
    game.show();
  });

  afterEach(() => {
    game.dispose();
    root.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('mở bảng phím bằng ?, đóng bằng Esc và nhớ trạng thái', () => {
    const help = root.querySelector<HTMLDetailsElement>('#hud-bottom-hint')!;
    const input = root.querySelector<HTMLInputElement>('#hud-affected-count')!;
    const key = (target: EventTarget, value: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));

    key(input, '?');
    expect(help.open).toBe(false);
    key(window, '?');
    expect(help.open).toBe(true);
    help.dispatchEvent(new Event('toggle'));
    game.dispose();
    game = new GameScreen(root);
    game.show();
    const restored = root.querySelector<HTMLDetailsElement>('#hud-bottom-hint')!;
    expect(restored.open).toBe(true);
    key(window, 'Escape');
    expect(restored.open).toBe(false);
  });

  it('giữ thẻ đổi ghế ở trên cùng khi các toast thay nhau và tự ẩn', () => {
    vi.useFakeTimers();
    const container = root.querySelector<HTMLElement>('#hud-notifications')!;
    const prompt = new SeatPrompt(container);
    prompt.show({
      id: 'swap', fromId: 'a', toId: 'b', fromName: 'An', toName: 'Bình',
      fromIndex: 0, toIndex: 1, expiresAt: Date.now() + 10_000,
    }, 'b');
    try {
      game.showDrawEndNotice('TOP');
      game.showDrawEndNotice('BOTTOM');
      game.showTableRollNotice('An tung xúc xắc: 6');
      game.showError('Thông báo kiểm tra');
      const notices = container.querySelector('#hud-roll-notices')!;
      expect(container.firstElementChild?.id).toBe('seat-prompts');
      expect(container.querySelector('[data-seat-request="swap"] button')?.textContent).toBe('Đồng ý');
      expect(notices.querySelectorAll(':scope > :not([hidden])')).toHaveLength(3);
      expect(notices.textContent).not.toContain('chung: Đỉnh');
      expect(notices.querySelector('strong')?.textContent).toBe('6');

      vi.advanceTimersByTime(3600);
      expect(notices.querySelectorAll(':scope > :not([hidden])')).toHaveLength(0);
      expect(container.querySelector('.seat-countdown')?.textContent).toContain('giây');
    } finally {
      prompt.dispose();
    }
  });

  it('sao chép mã phòng và cập nhật nhãn ghế, sức chứa', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    game.updateRoomInfo('ROOM42', 'An', 0, 2, 10, true);
    const badge = root.querySelector<HTMLButtonElement>('#hud-room-badge')!;
    expect(badge.querySelector('#hud-room-capacity')?.textContent).toBe('2/10');
    expect(root.querySelector('#hud-player-badge')?.getAttribute('title')).toContain('Chủ phòng');
    badge.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('ROOM42'));
    expect(root.querySelector('#hud-roll-notices')?.textContent).toContain('Đã sao chép');
    game.updateRoomInfo(null, 'An', 0);
    expect(badge.disabled).toBe(true);
  });

  it('phân biệt tùy chọn riêng và nêu lý do nút tung bị khóa', () => {
    game.setInsertionModeState('CUSTOM', 3);
    expect(root.querySelector('#btn-insert-custom')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('#btn-insert-top')?.getAttribute('aria-pressed')).toBe('false');
    const button = root.querySelector<HTMLButtonElement>('#btn-roll-dice')!;
    game.updateTableRollActions(false, 'Chờ một chút');
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('Chờ một chút');
    game.updateTableRollActions(true);
    expect(button.disabled).toBe(false);
    expect(button.title).toContain('(D)');
  });
});
