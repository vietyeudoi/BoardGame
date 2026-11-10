import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SandboxObject } from '@shared/types/room';
import { DiscardPilePanel } from '../ui/components/DiscardPilePanel';

describe('Cửa sổ chồng bài bỏ', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('chỉ dựng mặt trong vùng cuộn, cập nhật tại chỗ và che lá úp', () => {
    let intersection!: IntersectionObserverCallback;
    const observer = { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
        return observer;
      }
    });
    const root = document.createElement('div');
    const flip = vi.fn();
    const panel = new DiscardPilePanel(root, vi.fn(), flip);
    try {
      const card = (id: string, faceUp: boolean): SandboxObject => ({
        id, faceUp, type: 'card', position: { x: 0, y: 0, z: 0 }, rotation: 0,
        lockedBy: null, location: 'DISCARD', cardType: 'attack',
      });
      panel.sync([card('top', true), card('hidden', false)], true);
      panel.show();
      expect(root.querySelectorAll('.card-face-preview')).toHaveLength(0);
      const hidden = root.querySelector('[data-discard-id="hidden"]')!;
      intersection([{ target: hidden, isIntersecting: true } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
      expect(hidden.querySelector('[data-card-type="unknown"]')).not.toBeNull();
      const flipButton = hidden.querySelector('button')!;
      expect(flipButton.textContent).toBe('Lật');
      flipButton.click();
      expect(flip).toHaveBeenCalledWith('hidden');

      panel.sync([card('new', true), card('top', true), card('hidden', false)], true);
      expect(root.querySelector('section')?.hidden).toBe(false);
      expect(root.querySelector('strong')?.textContent).toBe('Chồng bài bỏ · 3 lá');
      expect(root.querySelector('article')?.dataset.discardId).toBe('new');
      expect(root.querySelector('[data-discard-id="hidden"]')).toBe(hidden);
      panel.sync([card('new', true), card('top', true), card('hidden', true)], false);
      expect(flipButton.textContent).toBe('Úp');
      expect(flipButton.disabled).toBe(true);
      root.querySelector('button')?.click();
      expect(root.querySelector('section')?.hidden).toBe(true);
    } finally {
      panel.dispose();
    }
  });
});
