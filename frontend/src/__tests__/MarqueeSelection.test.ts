import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { combineSelection, MarqueeSelection, overlaps, ScreenBoundsProjector } from '../interaction/MarqueeSelection';

describe('Chọn khung', () => {
  it('chọn khi giao một phần và chiếu đúng qua camera phối cảnh', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
    camera.position.z = 5;
    const geometry = new THREE.BoxGeometry(2, 2, 0.1);
    const mesh = new THREE.Mesh(geometry);
    const projector = new ScreenBoundsProjector();
    const result = { left: 0, top: 0, right: 0, bottom: 0 };
    projector.begin(camera, { left: 100, top: 50, right: 300, bottom: 250 });
    expect(projector.project(mesh, result)).toBe(true);
    expect(overlaps(result, { left: 220, top: 100, right: 250, bottom: 150 })).toBe(true);
    expect(overlaps(result, { left: 245, top: 100, right: 250, bottom: 150 })).toBe(false);
    mesh.position.z = 8;
    expect(projector.project(mesh, result)).toBe(false);
    geometry.dispose();
  });

  it('thay, thêm và đảo chọn theo danh sách trước lúc kéo', () => {
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'replace')).toEqual(['b', 'c']);
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'add')).toEqual(['a', 'b', 'c']);
    expect(combineSelection(['a', 'b'], ['b', 'c'], 'toggle')).toEqual(['a', 'c']);
  });

  it('Esc trả lại vùng chọn cũ và lần nhả chuột sau đó không bỏ chọn', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    let selected = ['cũ'];
    const marquee = new MarqueeSelection(root, () => ({
      scope: { left: 0, top: 0, right: 100, bottom: 100 },
      hit: (_, hits) => { hits.push('mới'); },
    }), () => selected, items => { selected = items; });
    const down = () => root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }));
    try {
      down();
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      expect(selected).toEqual(['mới']);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }));
      expect(selected).toEqual(['cũ']);
      down();
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 5, clientY: 5 }));
      expect(selected).toEqual([]);
    } finally {
      marquee.dispose();
      root.remove();
    }
  });
});
