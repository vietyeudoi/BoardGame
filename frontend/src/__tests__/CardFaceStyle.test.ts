import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import { getCardFaceStyle } from '../objects/CardFaceStyle';
import { CardTextureGenerator } from '../objects/CardTextureGenerator';
import { createCardFace, paintCardFace } from '../ui/components/CardFaceDOM';

describe('Mẫu mặt bài dùng chung', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dùng cùng tên và màu cho tất cả lá đã định nghĩa', () => {
    for (const [type, definition] of CARD_DEFINITIONS) {
      const style = getCardFaceStyle(type);
      const face = createCardFace(document, type);
      expect(face.querySelector('.fhfp-rules-name')?.textContent).toBe(definition.name);
      expect(face.style.getPropertyValue('--accent')).toBe(style.accent);
      expect(face.querySelector('.fhfp-rules-description')?.textContent?.replace(/\s+/g, ' '))
        .toBe(definition.description);
    }
  });

  it('không dựng danh tính và mô tả nếu lá úp hoặc thiếu loại bài', () => {
    const face = createCardFace(document, 'unknown');
    expect(face.querySelector('.fhfp-rules')).toBeNull();
    paintCardFace(face, { cardType: 'attack', masked: true });
    expect(face.dataset.cardType).toBe('unknown');
    expect(face.querySelector('.fhfp-rules')).toBeNull();
    expect(face.textContent).toBe(createCardFace(document).textContent);
  });

  it('chỉ dựng một texture mỗi bậc, nhả sau tham chiếu cuối', () => {
    vi.spyOn(CardTextureGenerator, 'isCanvasSupported').mockReturnValue(true);
    const draw = vi.spyOn(CardTextureGenerator, 'drawFront').mockImplementation(() => undefined);
    const small = CardTextureGenerator.acquireFrontTexture('attack', 'small')!;
    const dispose = vi.spyOn(small, 'dispose');
    expect(CardTextureGenerator.acquireFrontTexture('attack', 'small')).toBe(small);
    const large = CardTextureGenerator.acquireFrontTexture('attack', 'large')!;
    expect(large.image.width).toBe(small.image.width * 4);
    expect(draw).toHaveBeenCalledTimes(2);
    CardTextureGenerator.releaseFrontTexture('attack', 'small');
    expect(dispose).not.toHaveBeenCalled();
    CardTextureGenerator.releaseFrontTexture('attack', 'small');
    CardTextureGenerator.releaseFrontTexture('attack', 'large');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('ảnh DOM dùng lại Canvas theo bậc và chỉ yêu cầu mặt lưng khi bị che', () => {
    vi.spyOn(CardTextureGenerator, 'isCanvasSupported').mockReturnValue(true);
    const front = vi.spyOn(CardTextureGenerator, 'drawFront').mockImplementation(() => undefined);
    const back = vi.spyOn(CardTextureGenerator, 'drawBack').mockImplementation(() => undefined);
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation(function (this: HTMLCanvasElement) {
        return 'data:image/png;base64,' + this.width;
      });
    const standard = createCardFace(document, 'defuse');
    const repeated = createCardFace(document, 'defuse');
    const large = createCardFace(document, 'defuse', 'large');
    expect(repeated.querySelector('img')?.src).toBe(standard.querySelector('img')?.src);
    expect(large.querySelector('img')?.src).not.toBe(standard.querySelector('img')?.src);
    paintCardFace(standard, { cardType: 'attack', masked: true });
    expect(standard.dataset.cardType).toBe('unknown');
    expect(front).toHaveBeenCalledTimes(2);
    expect(back).toHaveBeenCalledOnce();
    expect(encode).toHaveBeenCalledTimes(3);
  });
});
