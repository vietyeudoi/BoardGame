import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../shared/constants/', import.meta.url);
const config = JSON.parse(readFileSync(new URL('./card-face-images.json', import.meta.url), 'utf8'));
const checkOnly = process.argv.includes('--check');
const imageExtension = /\.(?:png|webp|jpe?g|gif|avif|bmp|svg|tiff?)$/i;

function readImage(bytes, path) {
  // Đọc chữ ký và kích thước từ nội dung; nhiều ảnh WebP mang đuôi .png.
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.toString('ascii', 12, 16) === 'IHDR') {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 25 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    switch (bytes.toString('ascii', 12, 16)) {
      case 'VP8X':
        if (bytes.length >= 30) return { format: 'webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
        break;
      case 'VP8L':
        if (bytes[20] === 0x2f) {
          const dimensions = bytes.readUInt32LE(21);
          return { format: 'webp', width: 1 + (dimensions & 0x3fff), height: 1 + ((dimensions >>> 14) & 0x3fff) };
        }
        break;
      case 'VP8 ':
        if (bytes.length >= 30 && bytes.readUIntLE(23, 3) === 0x2a019d) {
          return { format: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
        }
        break;
    }
  }
  throw new Error('Ảnh không có header PNG hoặc WebP hợp lệ: ' + path);
}

function scanImages(dir = root, prefix = '') {
  const images = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const [key, image] of scanImages(new URL(encodeURIComponent(entry.name) + '/', dir), path + '/')) images.set(key, image);
    } else if (entry.isFile() && imageExtension.test(entry.name)) {
      const bytes = readFileSync(new URL(encodeURIComponent(entry.name), dir));
      const dimensions = readImage(bytes, path);
      if (!dimensions.width || !dimensions.height) throw new Error('Ảnh có kích thước không hợp lệ: ' + path);
      images.set(path, { path, ...dimensions, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return images;
}

const images = scanImages();
const owners = new Map();
function claimImage(path, owner) {
  const image = images.get(path);
  if (!image) throw new Error(owner + ' trỏ tới ảnh không tồn tại: ' + path);
  if (owners.has(path)) throw new Error(path + ' đã được khai báo cho ' + owners.get(path) + ', trùng với ' + owner);
  owners.set(path, owner);
  return image;
}

const manifest = new Map();
const configuredTypes = new Set();
const variantOrder = new Intl.Collator('en', { numeric: true });
for (const [pack, { folder, cards }] of Object.entries(config.packs)) {
  for (const [type, files] of Object.entries(cards)) {
    if (configuredTypes.has(type) || (pack === 'base' ? type.includes(':') : !type.startsWith(pack + ':'))) {
      throw new Error('ID loại trùng hoặc sai bộ ' + pack + ': ' + type);
    }
    configuredTypes.add(type);
    const faces = new Map();
    for (const file of [...files].sort(variantOrder.compare)) {
      if (!folder || /[\\/]/.test(file)) throw new Error('Ảnh phải nằm trong thư mục của bộ ' + pack + ': ' + file);
      const image = claimImage(folder + '/' + file, type);
      if (!faces.has(image.sha256)) faces.set(image.sha256, image);
    }
    if (faces.size) manifest.set(type, [...faces.values()]);
  }
}
for (const path of config.ignored) claimImage(path, 'ngoại lệ');
const unlisted = [...images.keys()].filter(path => !owners.has(path));
if (unlisted.length) throw new Error('Ảnh chưa có trong cấu hình ghép hoặc ngoại lệ:\n' + unlisted.join('\n'));

const header = '// Tệp sinh tự động bằng npm run generate:card-faces.\n';
function output(path, source) {
  const url = new URL(path, import.meta.url);
  let previous;
  try { previous = readFileSync(url, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous?.replaceAll('\r\n', '\n') === source) return;
  if (checkOnly) throw new Error('Manifest chưa cập nhật: ' + fileURLToPath(url));
  // Dev frontend và backend có thể sinh cùng lúc; không để tiến trình khác đọc tệp đang ghi.
  const temporary = new URL(path + '.' + process.pid + '.tmp', import.meta.url);
  try {
    writeFileSync(temporary, source);
    renameSync(temporary, url);
  } finally {
    rmSync(temporary, { force: true });
  }
}

const optimizedIndex = JSON.parse(readFileSync(new URL('./card-face-optimized.json', import.meta.url), 'utf8'));
const publicRoot = new URL('../frontend/public/', import.meta.url);
const verified = new Map();
function variantsFor(face) {
  const variants = optimizedIndex.images[face.sha256];
  for (const tier of ['small', 'large']) {
    const variant = variants?.[tier];
    const prefix = '/card-faces/' + tier + '/';
    if (!variant?.url?.startsWith(prefix) || !/^[a-f0-9]{24}\.webp$/.test(variant.url.slice(prefix.length))) {
      throw new Error('Thiếu ảnh tối ưu ' + tier + ' cho ' + face.path + '. Chạy npm run optimize:card-faces.');
    }
    let actual = verified.get(variant.url);
    if (!actual) {
      const bytes = readFileSync(new URL(variant.url.slice(1), publicRoot));
      actual = { ...readImage(bytes, variant.url), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') };
      verified.set(variant.url, actual);
    }
    if (actual.format !== 'webp' || actual.width !== variant.width || actual.height !== variant.height ||
        actual.bytes !== variant.bytes || actual.sha256 !== variant.sha256 ||
        variant.url !== prefix + actual.sha256.slice(0, 24) + '.webp') {
      throw new Error('Ảnh tối ưu không khớp chỉ mục: ' + variant.url);
    }
  }
  return variants;
}

const metadata = [...manifest].map(([type, faces]) => '  ' + JSON.stringify(type) + ': [\n' +
  faces.map(face => '    ' + JSON.stringify({ ...face, variants: variantsFor(face) }) + ',\n').join('') + '  ],\n').join('');
const cardTypeImport = "import type { CardType } from '../types/gameObjects.js';\n\n";
output('../shared/constants/cardFaceManifest.generated.ts', header + cardTypeImport +
  "export interface OptimizedCardFace {\n  readonly url: string;\n  readonly width: number;\n  readonly height: number;\n" +
  "  readonly bytes: number;\n  readonly sha256: string;\n}\n\n" +
  "export interface CardFaceAsset {\n  readonly path: string;\n  readonly format: 'png' | 'webp';\n" +
  "  readonly width: number;\n  readonly height: number;\n  readonly bytes: number;\n  readonly sha256: string;\n" +
  "  readonly variants: Readonly<Record<'small' | 'large', OptimizedCardFace>>;\n}\n\n" +
  'export const CARD_FACE_MANIFEST: Readonly<Partial<Record<CardType, readonly CardFaceAsset[]>>> = {\n' + metadata + '};\n');

const pathList = [...manifest].map(([type, faces]) => '  ' + JSON.stringify(type) + ': ' +
  JSON.stringify(faces.map(face => face.path)) + ',\n').join('');
output('../shared/constants/cardFacePaths.generated.ts', header + cardTypeImport +
  'export const CARD_FACE_PATHS: Readonly<Partial<Record<CardType, readonly string[]>>> = {\n' + pathList + '};\n');

const faces = [...manifest.values()].flat();
const urls = faces.map(face => {
  const variants = optimizedIndex.images[face.sha256];
  const hashes = ['small', 'large'].map(tier => variants[tier].sha256.slice(0, 24));
  return '  ' + JSON.stringify(face.path) + ': ' + JSON.stringify(hashes) + ',\n';
}).join('');
output('../frontend/src/objects/CardFaceAssetUrls.generated.ts', header +
  'export const CARD_FACE_ASSET_URLS: Readonly<Partial<Record<string, readonly [string, string]>>> = {\n' + urls + '};\n');
console.log('Manifest mặt bài: ' + faces.length + ' mặt cho ' + manifest.size + ' loại.');
