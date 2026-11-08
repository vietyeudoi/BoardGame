import { expect, it, vi } from 'vitest';
import { SeatPrompt } from '../ui/components/SeatPrompt';

it('thẻ đổi ghế hiện thời gian, trả lời và tự dọn khi hết hạn', () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  const prompt = new SeatPrompt(root);
  const onAction = vi.fn();
  prompt.onAction = onAction;
  try {
    prompt.show({ id: '1', fromId: 'a', toId: 'b', fromName: 'A', toName: 'B', fromIndex: 0, toIndex: 1,
      expiresAt: Date.now() + 15000 }, 'b');
    expect(root.textContent).toContain('15 giây');
    root.querySelector('button')?.click();
    expect(onAction).toHaveBeenCalledWith('1', true);
    vi.advanceTimersByTime(15000);
    expect(root.querySelector('[data-seat-request]')).toBeNull();
  } finally {
    prompt.dispose();
    vi.useRealTimers();
  }
});
