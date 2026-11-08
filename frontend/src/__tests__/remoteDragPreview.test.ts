import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { RemoteDragPreview } from '../scene/RemoteDragPreview';

it('nội suy bản úp khi kéo và trả lại vật thể gốc sau khi dừng', () => {
  const scene = new THREE.Scene();
  const card = new CardObject3D({ id: 'card', faceUp: true });
  const manager = new RemoteDragPreview(scene, () => card, vi.fn());
  let tick: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { tick = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  try {
    manager.update({ phase: 'start', dragId: 1, playerId: 'p', playerName: 'P', playerIndex: 0,
      cards: [{ objectId: 'card', x: 2, y: 0.5, z: 0, rotation: Math.PI / 2, faceUp: false, masked: true }] });
    const ghost = scene.getObjectByName('drag-preview-card')!;
    const materials = (ghost.children[1] as THREE.Mesh).material as THREE.Material[];
    expect(materials[0]).toBe(materials[1]);
    expect(manager.isLocked('card')).toBe(true);
    expect(card.visible).toBe(false);
    tick!(performance.now());
    expect(ghost.position.x).toBeGreaterThan(0);
    expect(ghost.position.x).toBeLessThan(2);
    expect(ghost.rotation.y).toBeGreaterThan(0);
    expect(ghost.rotation.y).toBeLessThan(Math.PI / 2);
    manager.stop('p', 1);
    tick!(performance.now() + 300);
    expect(scene.getObjectByName('drag-preview-card')).toBeUndefined();
    expect(card.visible).toBe(true);

    expect(card.position.x).toBe(0);

    manager.update({ phase: 'start', dragId: 2, playerId: 'p', playerName: 'P', playerIndex: 0,
      cards: [{ objectId: 'card', x: 2, y: 0.5, z: 0 }] });
    expect(card.visible).toBe(false);
    manager.finishCard('card');
    manager.stop('p', 2);
    expect(scene.getObjectByName('drag-preview-card')).toBeUndefined();
    expect(manager.isLocked('card')).toBe(false);
    expect(card.visible).toBe(true);
  } finally {
    manager.clear();
    card.dispose();
    vi.unstubAllGlobals();
  }
});
