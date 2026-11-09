import { CARD_DEFINITIONS, CARD_PACK_BY_ID } from '@shared/constants/cardTypes';
import type { CardPackId, CardType } from '@shared/types/gameObjects';
import { CARD_FACE_ASSET_URLS } from './CardFaceAssetUrls.generated';
import { CardFaceLoadQueue } from './CardFaceLoadQueue';

export type CardFaceImageSize = 'small' | 'large';
const DECODE_TIMEOUT_MS = 12_000;

export function prefersSmallCardFaces(connection?: { saveData?: boolean; effectiveType?: string }): boolean {
  return !!connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '');
}

function constrainedConnection(): boolean {
  const network = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { connection?: Parameters<typeof prefersSmallCardFaces>[0] }).connection;
  return prefersSmallCardFaces(network);
}

function assetUrl(path: string, size: CardFaceImageSize): string | undefined {
  const hash = CARD_FACE_ASSET_URLS[path]?.[size === 'small' ? 0 : 1];
  return hash ? import.meta.env.BASE_URL + 'card-faces/' + size + '/' + hash + '.webp' : undefined;
}

export function getCardFaceImage(type?: string | null, copy?: string, size: CardFaceImageSize = 'small'): string | undefined {
  const paths = CARD_DEFINITIONS.get(type as CardType)?.faceImage;
  const path = copy && paths?.includes(copy) ? copy : paths?.[0];
  return path ? assetUrl(path, constrainedConnection() ? 'small' : size) : undefined;
}

async function decodeCardFace(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  // decode() chuẩn bị ảnh bất đồng bộ trước khi renderer cần vẽ.
  if (typeof image.decode !== 'function') return null;
  image.decoding = 'async';
  image.src = url;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => { timeout = setTimeout(reject, DECODE_TIMEOUT_MS); }),
    ]);
    return image;
  } catch {
    image.removeAttribute('src');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const artwork = new CardFaceLoadQueue(decodeCardFace);
export function loadCardFaceImage(url: string): Promise<HTMLImageElement | null> {
  return artwork.load(url);
}

export function preloadCardFacePacks(packs: readonly CardPackId[]): void {
  artwork.clearBackground();
  if (constrainedConnection()) return;
  // Chỉ nạp theo bộ công khai. Mặt trên tay và trên bàn tự yêu cầu với ưu tiên cao hơn.
  const urls = new Set<string>();
  for (const pack of packs) {
    for (const card of CARD_PACK_BY_ID.get(pack)?.cards ?? []) {
      for (const path of card.faceImage ?? []) {
        const url = assetUrl(path, 'small');
        if (url) urls.add(url);
      }
    }
  }
  for (const url of urls) void artwork.load(url, true);
}
