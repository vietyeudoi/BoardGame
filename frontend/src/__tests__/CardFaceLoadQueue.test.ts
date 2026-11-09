import { describe, expect, it, vi } from 'vitest';
import { CardType } from '@shared/types/gameObjects';
import { CardFaceLoadQueue, CardFaceLru } from '../objects/CardFaceLoadQueue';
import { getCardFaceImage, prefersSmallCardFaces } from '../objects/CardFaceImages';

describe('Nạp ảnh mặt bài', () => {
  it('gộp yêu cầu đang tải và dùng lại ảnh đã giải mã', async () => {
    const decode = vi.fn(async (url: string) => url);
    const queue = new CardFaceLoadQueue(decode);
    const first = queue.load('/face');
    expect(queue.load('/face')).toBe(first);
    expect(await first).toBe('/face');
    expect(await queue.load('/face')).toBe('/face');
    expect(decode).toHaveBeenCalledOnce();
  });

  it('dành chỗ cho ảnh đang hiển thị và hủy ảnh nền còn chờ', async () => {
    const release = new Map<string, (result: string) => void>();
    const decode = vi.fn((url: string) => new Promise<string>(resolve => release.set(url, resolve)));
    const queue = new CardFaceLoadQueue(decode, 2, 2, 1);
    const a = queue.load('background-a', true);
    const b = queue.load('background-b', true);
    const front = queue.load('visible');
    await Promise.resolve();
    expect([...release.keys()]).toEqual(['background-a', 'visible']);
    queue.clearBackground();
    expect(await b).toBeNull();
    release.get('background-a')!('a');
    release.get('visible')!('v');
    expect(await Promise.all([a, front])).toEqual(['a', 'v']);
  });

  it('trả fallback khi lỗi và hạn chế yêu cầu lại', async () => {
    const decode = vi.fn(async () => { throw new Error('ảnh lỗi'); });
    const queue = new CardFaceLoadQueue(decode);
    expect(await queue.load('broken')).toBeNull();
    expect(await queue.load('broken')).toBeNull();
    expect(decode).toHaveBeenCalledOnce();
  });

  it('chỉ loại mục ít dùng nhất và giải phóng texture bị loại', () => {
    const dispose = vi.fn();
    const cache = new CardFaceLru<number>(2, dispose);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(2);
    expect(cache.take('b')).toBeUndefined();
    expect(cache.take('a')).toBe(1);
    const decoded = new CardFaceLru<number>(1);
    decoded.set('a', 1);
    decoded.set('b', 2);
    expect(decoded.get('a')).toBeUndefined();
  });

  it('chọn URL nhỏ mặc định, URL lớn theo ngữ cảnh và dùng ảnh nhỏ khi tiết kiệm dữ liệu', () => {
    expect(getCardFaceImage(CardType.Attack)).toMatch(/\/small\/.*\.webp$/);
    expect(getCardFaceImage(CardType.Attack, undefined, 'large')).toMatch(/\/large\/.*\.webp$/);
    expect(getCardFaceImage(CardType.ChaosPeek, undefined, 'large')).toBeUndefined();
    expect(prefersSmallCardFaces({ saveData: true, effectiveType: '4g' })).toBe(true);
    expect(prefersSmallCardFaces({ effectiveType: '3g' })).toBe(true);
    expect(prefersSmallCardFaces({ effectiveType: '4g' })).toBe(false);
  });
});
