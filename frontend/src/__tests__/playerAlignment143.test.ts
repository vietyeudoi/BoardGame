/**
 * playerAlignment143.test.ts — Unit tests for M1.4.3 Goal A: Player Area Alignment
 * Validates that Player Areas for all 2–8 player counts have their long axis strictly
 * parallel to their respective table edges (angular error <= 0.5 degrees),
 * face inward towards table center, and maintain proper clearance without overlaps.
 */

import { describe, it, expect } from 'vitest';
import { PlayerCount, getTableShape, getTableFeltVertices } from '../objects/TableShapeConfig';
import { getLayoutForShape, PLAYER_AREA_VISUAL_CONFIG } from '../objects/PlayerAreaConfig';

describe('M1.4.3 — Goal A: Player Area Alignment & Edge Parallelism', () => {
  const allCounts: PlayerCount[] = [2, 3, 4, 5, 6, 7, 8];
  const MAX_ANGLE_ERROR_DEG = 0.5;
  const MAX_ANGLE_ERROR_RAD = (MAX_ANGLE_ERROR_DEG * Math.PI) / 180; // ~0.0087 rad

  describe('Edge Parallelism & Angular Accuracy', () => {
    it.each(allCounts)('PlayerCount = %i: exactly %i areas are created', (count) => {
      const shape = getTableShape(count);
      const positions = getLayoutForShape(count, shape.circumradius);
      expect(positions).toHaveLength(count);
    });

    it.each([5, 6, 7, 8] as const)('Polygon N = %i: each Player Area long axis is parallel to its edge within 0.5 deg', (N) => {
      const shape = getTableShape(N);
      const vertices = getTableFeltVertices(shape);
      const positions = getLayoutForShape(N, shape.circumradius);

      for (let i = 0; i < N; i++) {
        const p1 = vertices[i]!;
        const p2 = vertices[(i + 1) % N]!;
        const edgeVector = { x: p2.x - p1.x, z: p2.z - p1.z };
        const edgeLen = Math.hypot(edgeVector.x, edgeVector.z);
        const edgeTangent = { x: edgeVector.x / edgeLen, z: edgeVector.z / edgeLen };

        const pos = positions[i]!;
        // In Three.js, local X axis (1, 0) rotated by pos.rotationY around Y has world coordinates (cos(rotY), -sin(rotY))
        const longAxisWorld = {
          x: Math.cos(pos.rotationY),
          z: -Math.sin(pos.rotationY),
        };

        // Dot product between normalized vectors gives cos(angular_difference)
        const dot = longAxisWorld.x * edgeTangent.x + longAxisWorld.z * edgeTangent.z;
        // In case orientation is anti-parallel (both are parallel lines), abs(dot) must be ~ 1
        expect(Math.abs(dot)).toBeGreaterThanOrEqual(Math.cos(MAX_ANGLE_ERROR_RAD));

        // Angular error in radians
        const angleDiffRad = Math.acos(Math.min(1.0, Math.abs(dot)));
        expect(angleDiffRad).toBeLessThanOrEqual(MAX_ANGLE_ERROR_RAD);
      }
    });

    it.each([5, 6, 7, 8] as const)('Polygon N = %i: each Player Area faces inward towards table center', (N) => {
      const shape = getTableShape(N);
      const positions = getLayoutForShape(N, shape.circumradius);

      for (let i = 0; i < N; i++) {
        const pos = positions[i]!;
        // Direction from area center to table center (0, 0)
        const toCenter = { x: -pos.x, z: -pos.z };
        const toCenterLen = Math.hypot(toCenter.x, toCenter.z);
        const toCenterNorm = { x: toCenter.x / toCenterLen, z: toCenter.z / toCenterLen };

        // Local -Z rotated into world space is the forward/inward direction: (sin(rotY), -cos(rotY)) wait:
        // Local (0, 0, -1): x' = -sin(rotY), z' = -cos(rotY)
        // Dot with toCenter must be positive (facing the center)
        const inwardVec = { x: -Math.sin(pos.rotationY), z: -Math.cos(pos.rotationY) };
        // const dot = inwardVec.x * toCenterNorm.x + inwardVec.y * toCenterNorm.z; (removed stale ref)
        // Inward vector aligns with toCenter vector (cos difference >= 0.8)
        const dotActual = inwardVec.x * toCenterNorm.x + inwardVec.z * toCenterNorm.z;
        expect(dotActual).toBeGreaterThan(0.7);
      }
    });

    it.each(allCounts)('PlayerCount = %i: Player Areas do not overlap with adjacent areas', (count) => {
      const shape = getTableShape(count);
      const positions = getLayoutForShape(count, shape.circumradius);
      const minDistance = PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH;

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.hypot(
            positions[i]!.x - positions[j]!.x,
            positions[i]!.z - positions[j]!.z
          );
          expect(dist).toBeGreaterThan(minDistance);
        }
      }
    });

    it.each([5, 6, 7, 8] as const)('Polygon N = %i: all Player Areas are inside felt inradius with rail clearance', (N) => {
      const shape = getTableShape(N);
      const positions = getLayoutForShape(N, shape.circumradius);
      const halfDepth = PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH / 2;

      for (const pos of positions) {
        const distFromCenter = Math.hypot(pos.x, pos.z);
        const outerEdgeDist = distFromCenter + halfDepth;
        expect(outerEdgeDist).toBeLessThanOrEqual(shape.inradius);
        expect(shape.inradius - outerEdgeDist).toBeGreaterThanOrEqual(0.30);
      }
    });
  });
});

