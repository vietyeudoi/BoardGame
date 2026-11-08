import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DIE_PIPS, DIE_SIDES, rollLandingRotation } from '../scene/TableRollEffects';

describe('Mặt kết quả khi vật thể nằm yên', () => {
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  it.each(DIE_SIDES)('hướng mặt %i của xúc xắc lên trên', result => {
    expect(DIE_PIPS[result]).toHaveLength(result);
    const index = DIE_SIDES.indexOf(result);
    const face = new THREE.Vector3(...normals[index]!);
    expect(face.applyQuaternion(rollLandingRotation({ kind: 'dice', result })).y).toBeCloseTo(1);
    expect(result + DIE_SIDES[index ^ 1]!).toBe(7);
  });

  it.each(['heads', 'tails'] as const)('hướng mặt %s của đồng xu lên trên', result => {
    const normal = new THREE.Vector3(0, result === 'heads' ? 1 : -1, 0);
    expect(normal.applyQuaternion(rollLandingRotation({ kind: 'coin', result })).y).toBeCloseTo(1);
  });
});
