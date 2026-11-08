import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TableActions3D } from '../objects/TableActions3D';

it('giữ tâm nút trên bàn và chỉ Rút nhận click sau khi đổi góc', () => {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
  const camera = new THREE.PerspectiveCamera(54, 800 / 600, 0.1, 100);
  const buttons = new TableActions3D(canvas, camera, vi.fn(), () => false);
  const draw = vi.fn();
  buttons.onDraw = draw;
  try {
    buttons.setAnchor(0, 0, 0);
    const origin = buttons.children[0]!.getWorldPosition(new THREE.Vector3());
    for (const theta of [0, Math.PI, Math.PI / 3]) {
      camera.position.set(15 * Math.sin(theta), 15, 15 * Math.cos(theta));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      buttons.setAnchor(0, 0, theta);
      expect(buttons.children[0]!.getWorldPosition(new THREE.Vector3())).toEqual(origin);
      buttons.children.forEach(button => {
        const point = button.getWorldPosition(new THREE.Vector3()).project(camera);
        const position = { clientX: (point.x + 1) * 400, clientY: (1 - point.y) * 300, button: 0 };
        canvas.dispatchEvent(new MouseEvent('mousedown', position));
        window.dispatchEvent(new MouseEvent('mouseup', position));
      });
    }
    expect(draw).toHaveBeenCalledTimes(3);
  } finally {
    buttons.dispose();
  }
});
