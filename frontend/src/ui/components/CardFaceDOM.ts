import { getCardFaceImage } from '../../objects/CardFaceImages';
import { CARD_CONFIG } from '../../objects/CardConfig';
import { getCardFaceStyle } from '../../objects/CardFaceStyle';
import { CardTextureGenerator, type CardTextureSize } from '../../objects/CardTextureGenerator';
import './CardFace.css';

const MAX_FACE_IMAGES = 72;
const images = new Map<string, string>();

// Dùng đúng Canvas của texture bàn. Cache ảnh có giới hạn để các thẻ DOM
// cùng loại dùng chung ảnh đã giải mã mà không giữ texture GPU.
function getFaceImage(type: string, size: CardTextureSize): string | undefined {
  const key = size + ':' + type;
  const cached = images.get(key);
  if (cached) {
    images.delete(key);
    images.set(key, cached);
    return cached;
  }
  const texture = CardTextureGenerator.acquireFrontTexture(type, size);
  if (!texture) return;
  try {
    const url = (texture.image as HTMLCanvasElement).toDataURL();
    if (images.size >= MAX_FACE_IMAGES) {
      const oldest = images.keys().next().value;
      if (oldest !== undefined) images.delete(oldest);
    }
    images.set(key, url);
    return url;
  } finally {
    CardTextureGenerator.releaseFrontTexture(type, size);
  }
}

export function paintCardFace(
  el: HTMLElement, card: { cardType?: string | null; masked?: boolean; faceImage?: string },
  size: CardTextureSize = 'standard',
): void {
  const doc = el.ownerDocument;
  const style = getCardFaceStyle(card.cardType, !card.masked);
  const type = style.back ? '' : card.cardType!;
  const artwork = style.back ? undefined : getCardFaceImage(type, card.faceImage);
  const url = artwork ?? getFaceImage(type, size);
  el.classList.toggle('fhfp-card--back', style.back);
  el.dataset.masked = String(style.back);
  el.dataset.cardType = type || 'unknown';
  el.style.setProperty('--accent', style.accent);
  el.style.setProperty('--face-radius-x', CARD_CONFIG.DEFAULT_CORNER_RADIUS / CARD_CONFIG.DEFAULT_WIDTH * 100 + '%');
  el.style.setProperty('--face-radius-y', CARD_CONFIG.DEFAULT_CORNER_RADIUS / CARD_CONFIG.DEFAULT_HEIGHT * 100 + '%');

  // Giữ nội dung đọc được cho trình đọc màn hình và môi trường không có Canvas.
  const text = doc.createElement('div');
  text.className = url ? 'card-face-text card-face-text--hidden' : 'card-face-text';
  const banner = doc.createElement('span');
  banner.className = 'fhfp-banner';
  banner.textContent = style.back ? 'Mặt úp' : style.banner;
  text.append(banner);
  if (style.pack) {
    const pack = doc.createElement('span');
    pack.className = 'fhfp-pack-label';
    pack.textContent = style.pack.pack;
    text.append(pack);
  }
  if (style.rules) {
    const panel = doc.createElement('span');
    panel.className = 'fhfp-rules';
    const title = doc.createElement('strong');
    title.className = 'fhfp-rules-name';
    title.textContent = style.rules.title;
    const description = doc.createElement('span');
    description.className = 'fhfp-rules-description';
    description.textContent = style.rules.lines.join(' ');
    panel.append(title, description);
    text.append(panel);
  }
  if (!url) {
    el.replaceChildren(text);
    return;
  }
  const image = doc.createElement('img');
  image.className = 'card-face-image';
  image.alt = '';
  image.draggable = false;
  if (artwork) {
    image.style.objectFit = 'cover';
    image.addEventListener('error', () => {
      const fallback = getFaceImage(type, size);
      if (fallback) {
        image.style.removeProperty('object-fit');
        image.src = fallback;
      } else {
        image.remove();
        text.classList.remove('card-face-text--hidden');
      }
    }, { once: true });
  }
  image.src = url;
  el.replaceChildren(image, text);
}

export function createCardFace(document: Document, type?: string | null, size: CardTextureSize = 'standard', faceImage?: string): HTMLElement {
  const face = document.createElement('div');
  face.className = 'card-face-preview';
  paintCardFace(face, { cardType: type, faceImage }, size);
  return face;
}
