import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CARD_FACE_MANIFEST } from '../../../shared/constants/cardFaceManifest.generated.js';
import { CARD_PACKS } from '../../../shared/constants/cardTypes.js';
import { CardType } from '../../../shared/types/gameObjects.js';

const config = JSON.parse(readFileSync(new URL('../../../scripts/card-face-images.json', import.meta.url), 'utf8')) as {
  packs: Record<string, { folder: string | null; cards: Record<string, string[]> }>;
  ignored: string[];
};

describe('Danh mục ảnh mặt bài', () => {
  it('kiểm kê nguồn ảnh, báo đường dẫn thiếu hoặc thừa và kiểm tra đầu ra sinh tự động', () => {
    const script = fileURLToPath(new URL('../../../scripts/generate-card-face-manifest.mjs', import.meta.url));
    expect(execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' })).toContain('209 mặt cho 103 loại');
  });

  it('khớp từng ID với danh mục lá, thứ tự mặt và số hash khác nhau', () => {
    for (const pack of CARD_PACKS) {
      const { folder, cards: configured } = config.packs[pack.id]!;
      expect(new Set(Object.keys(configured))).toEqual(new Set(pack.cards.map(card => card.type)));
      for (const card of pack.cards) {
        const faces = CARD_FACE_MANIFEST[card.type];
        const hashes = configured[card.type]!.map(file => {
          const url = new URL('../../../shared/constants/' + folder + '/' + encodeURIComponent(file), import.meta.url);
          return createHash('sha256').update(readFileSync(url)).digest('hex');
        });
        expect(faces?.map(face => face.sha256) ?? []).toHaveLength(new Set(hashes).size);
        expect(new Set(faces?.map(face => face.sha256))).toEqual(new Set(hashes));
        expect(card.faceImage).toEqual(faces?.map(face => face.path));
        for (const face of faces ?? []) {
          for (const [tier, width] of [['small', 384], ['large', 768]] as const) {
            const variant = face.variants[tier];
            expect(variant.url).toMatch(new RegExp('^/card-faces/' + tier + '/[a-f0-9]{24}\\.webp$'));
            expect(variant.width).toBe(Math.min(width, face.width));
            expect(Math.abs(variant.height - face.height * variant.width / face.width)).toBeLessThanOrEqual(.5);
            expect(variant.bytes).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(CARD_FACE_MANIFEST[CardType.Shuffle]).toHaveLength(4);
    expect(CARD_FACE_MANIFEST[CardType.GamblingUnholyHybrid]?.map(face => face.path))
      .toEqual([1, 2, 3].map(index => 'UnholyKittens/Unholy Hybrid-' + index + '.png'));
    expect(CARD_FACE_MANIFEST[CardType.GamblingLoadedDice]).toEqual([
      expect.objectContaining({ path: 'UnholyKittens/Loaded Dice.png', format: 'png' }),
    ]);
    const textOnly = CARD_PACKS.flatMap(pack => pack.cards.filter(card => !card.faceImage));
    expect(textOnly.map(card => card.type)).toEqual(Object.keys(config.packs.chaos!.cards));
    expect(textOnly).toHaveLength(7);
    expect(config.ignored).toEqual([
      'CoffeeKittens/Coffee Kitten Defuse.png',
      'CoffeeKittens/Purrfect Boost-1.png',
      'CoffeeKittens/Purrfect Boost-2.png',
      'CoffeeKittens/Purrfect Boost-3.png',
      'UnrylyKittens/Disable-4.png',
      'MatSau/Backside-1.png',
    ]);
    expect(CARD_FACE_MANIFEST[CardType.ExplodingKitten]?.[0]).toMatchObject({ format: 'webp' });
  });
});
