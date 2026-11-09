import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import { CardType } from '@shared/types/gameObjects';
import * as cardFaces from '../objects/CardFaceImages';
const { getCardFaceImage } = cardFaces;
import { getCardFaceStyle } from '../objects/CardFaceStyle';
import { CardTextureGenerator } from '../objects/CardTextureGenerator';
import { createCardFace, paintCardFace } from '../ui/components/CardFaceDOM';

describe('Mẫu mặt bài dùng chung', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dùng ba ảnh riêng cho Unholy Hybrid và quay về mặt chữ khi ảnh lỗi', async () => {
    vi.spyOn(cardFaces, 'loadCardFaceImage').mockResolvedValue(new Image());
    const type = CardType.GamblingUnholyHybrid;
    const definition = CARD_DEFINITIONS.get(type)!;
    expect(definition.count).toBe(3);
    const paths = definition.faceImage!;
    expect(paths).toHaveLength(3);
    expect(new Set(paths.map(path => getCardFaceImage(type, path))).size).toBe(3);
    const face = createCardFace(document, type, 'large', paths[1]);
    const image = face.querySelector('img')!;
    expect(face.querySelector('.card-face-text--hidden')).toBeNull();
    await Promise.resolve();
    expect(image.getAttribute('src')).toBe(getCardFaceImage(type, paths[1], 'large'));
    image.dispatchEvent(new Event('load'));
    expect(image.style.objectFit).toBe('cover');
    expect(face.querySelector('.card-face-text--hidden')).not.toBeNull();
    image.dispatchEvent(new Event('error'));
    expect(face.querySelector('img')).toBeNull();
    expect(face.querySelector('.card-face-text--hidden')).toBeNull();
    expect(face.querySelector('.fhfp-rules-description')?.textContent).toBe(definition.description);
    expect(getCardFaceImage(type)).toBe(getCardFaceImage(type, paths[0]));
    expect(getCardFaceImage(CardType.Attack)).toBeDefined();
    expect(getCardFaceImage(CardType.ChaosPeek)).toBeUndefined();
    expect(getCardFaceImage(CardType.GamblingLoadedDice)).toBeDefined();
    paintCardFace(face, { cardType: type, faceImage: paths[1], masked: true });
    expect(face.querySelector('img')).toBeNull();
    expect(face.querySelector('.fhfp-rules')).toBeNull();
  });

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
    const standard = createCardFace(document, CardType.ChaosReturn);
    const repeated = createCardFace(document, CardType.ChaosReturn);
    const large = createCardFace(document, CardType.ChaosReturn, 'large');
    expect(repeated.querySelector('img')?.src).toBe(standard.querySelector('img')?.src);
    expect(large.querySelector('img')?.src).not.toBe(standard.querySelector('img')?.src);
    paintCardFace(standard, { cardType: 'attack', masked: true });
    expect(standard.dataset.cardType).toBe('unknown');
    expect(front).toHaveBeenCalledTimes(2);
    expect(back).toHaveBeenCalledOnce();
    expect(encode).toHaveBeenCalledTimes(3);
  });
});
