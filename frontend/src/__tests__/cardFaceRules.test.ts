import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CARD_DEFINITIONS } from '@shared/constants/cardTypes';
import { CARD_CONFIG } from '../objects/CardConfig';
import { getCardFaceRules, RULE_PANEL } from '../objects/CardFaceRules';
import { CardObject3D } from '../objects/CardObject3D';
import { CardTextureGenerator } from '../objects/CardTextureGenerator';

describe('Nội dung chức năng trên mặt bài', () => {
  it.each([...CARD_DEFINITIONS.values()].filter(card => !card.faceImage?.length))('giữ đủ nội dung và vừa nửa dưới lá $name', definition => {
    const rules = getCardFaceRules(definition.type)!;
    expect(rules.title).toBe(definition.name);
    expect(rules.lines.join(' ')).toBe(definition.description);
    const usedHeight = RULE_PANEL.padding * 2 + RULE_PANEL.gap + rules.titleSize * 1.15
      + rules.lines.length * rules.lineHeight;
    expect(usedHeight).toBeLessThanOrEqual(CARD_CONFIG.TEXTURE_HEIGHT * RULE_PANEL.height);
    expect(getCardFaceRules(definition.type)).toBe(rules);
  });

  it('lá chưa biết loại không có nội dung và các lá cùng loại dùng chung texture', () => {
    expect(getCardFaceRules(null)).toBeUndefined();
    expect(getCardFaceRules('unknown')).toBeUndefined();
    const create = vi.spyOn(CardTextureGenerator, 'getOrCreateCanvas').mockImplementation(() => document.createElement('canvas'));
    const draw = vi.spyOn(CardTextureGenerator, 'drawFront').mockImplementation(() => {});
    const back = vi.spyOn(CardTextureGenerator, 'drawBack').mockImplementation(() => {});
    const a = new CardObject3D({ cardType: 'attack' });
    const b = new CardObject3D({ cardType: 'attack' });
    try {
      const [front, rear] = a.getMesh().material as THREE.MeshStandardMaterial[];
      const texture = front!.map!;
      const disposed = vi.fn();
      texture.addEventListener('dispose', disposed);
      expect(draw).toHaveBeenCalledTimes(1);
      expect((b.getMesh().material as THREE.MeshStandardMaterial[])[0]!.map).toBe(texture);
      a.setMasked(true);
      expect(front!.map).toBe(rear!.map);
      a.dispose();
      expect(disposed).not.toHaveBeenCalled();
      b.dispose();
      expect(disposed).toHaveBeenCalledTimes(1);
    } finally {
      a.dispose();
      b.dispose();
      create.mockRestore();
      draw.mockRestore();
      back.mockRestore();
    }
  });
});
