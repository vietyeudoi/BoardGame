import { FAN_CARD_ART, getPackCardArt } from '../utils/CardArt';
import { CARD_CONFIG } from './CardConfig';
import { getCardFaceRules } from './CardFaceRules';

// Thông tin mặt lá để Canvas và nhãn hỗ trợ đọc dùng chung.
export const FACE_STYLE = {
  bannerSize: .043,
  darkText: '#0b1020',
  ruleBackground: 'rgba(15,23,42,.92)',
} as const;

export function getCardFaceStyle(type?: string | null, faceUp = true) {
  const rules = faceUp ? getCardFaceRules(type) : undefined;
  const back = !faceUp || !rules;
  const art = back ? undefined : FAN_CARD_ART[type!];
  const pack = back ? undefined : getPackCardArt(type);
  return { back, art, pack, rules, accent: pack?.color ?? art?.accent ?? CARD_CONFIG.DEFAULT_ACCENT_COLOR,
    banner: pack?.name ?? art?.shortName ?? rules?.title ?? 'Mặt úp' };
}
