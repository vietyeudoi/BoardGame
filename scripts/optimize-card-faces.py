
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'frontend/public/card-faces'
INDEX = ROOT / 'scripts/card-face-optimized.json'
SETTINGS = {'small': 384, 'large': 768}
QUALITY = 80
RECIPE = {'widths': SETTINGS, 'quality': QUALITY, 'encoder': Image.__version__}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def optimize(source, previous):
    data = source.read_bytes()
    key = digest(data)
    previous_sizes = previous.get(key)
    if previous_sizes and all(
        (file := ROOT / 'frontend/public' / entry['url'].lstrip('/')).is_file()
        and digest(file.read_bytes()) == entry['sha256']
        for entry in previous_sizes.values()
    ):
        return key, previous_sizes
    sizes = {}
    with Image.open(io.BytesIO(data)) as image:
        image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
        for tier, limit in SETTINGS.items():
            width = min(limit, image.width)
            height = max(1, round(image.height * width / image.width))
            resized = image.resize((width, height), Image.Resampling.LANCZOS) if width < image.width else image
            buffer = io.BytesIO()
            resized.save(buffer, format='WEBP', quality=QUALITY, method=4)
            payload = buffer.getvalue()
            sha256 = digest(payload)
            file = OUTPUT / tier / (sha256[:24] + '.webp')
            if not file.is_file() or file.read_bytes() != payload:
                file.write_bytes(payload)
            sizes[tier] = {
                'url': '/card-faces/' + tier + '/' + file.name,
                'width': width, 'height': height, 'bytes': len(payload), 'sha256': sha256,
            }
    return key, sizes


def main():
    config = json.loads((ROOT / 'scripts/card-face-images.json').read_text(encoding='utf-8'))
    sources = [ROOT / 'shared/constants' / pack['folder'] / name
               for pack in config['packs'].values() for names in pack['cards'].values() for name in names]
    # Hai bộ có thể dùng cùng byte nguồn, chỉ mã hóa một lần cho mỗi nội dung.
    by_hash = {digest(source.read_bytes()): source for source in sources}
    old = json.loads(INDEX.read_text(encoding='utf-8')) if INDEX.exists() else {}
    previous = old.get('images', {}) if old.get('recipe') == RECIPE else {}
    for tier in SETTINGS:
        (OUTPUT / tier).mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as workers:
        optimized = dict(workers.map(lambda source: optimize(source, previous), by_hash.values()))
    content = json.dumps({'recipe': RECIPE, 'images': optimized}, ensure_ascii=False, indent=2) + '\n'
    if not INDEX.exists() or INDEX.read_text(encoding='utf-8') != content:
        INDEX.write_text(content, encoding='utf-8')
    print(f'{len(optimized)} ảnh nguồn, {len(optimized) * len(SETTINGS)} biến thể WebP.')


if __name__ == '__main__':
    main()
