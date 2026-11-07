import { describe, it, expect } from 'vitest';
import {
  getTableShape,
  getPolygonVertices,
  isPointInsideTable,
  clampPointToTable,
  getNearestValidPoint,
  PlayerCount,
} from '../objects/TableShapeConfig';
import { clampTablePosition } from '../interaction/InteractionConfig';

describe('M1.4.3 — Goal D: Free Placement on Entire Polygon Felt', () => {
  const playerCounts: PlayerCount[] = [2, 3, 4, 5, 6, 7, 8];

  describe('isPointInsideTable', () => {
    it('center (0, 0) is inside table for all player counts 2 to 8', () => {
      for (const count of playerCounts) {
        const params = getTableShape(count);
        expect(isPointInsideTable({ x: 0, z: 0 }, params)).toBe(true);
      }
    });

    it('far outside points return false for all player counts', () => {
      for (const count of playerCounts) {
        const params = getTableShape(count);
        expect(isPointInsideTable({ x: 50, z: 50 }, params)).toBe(false);
        expect(isPointInsideTable({ x: -40, z: 0 }, params)).toBe(false);
        expect(isPointInsideTable({ x: 0, z: 35 }, params)).toBe(false);
      }
    });

    it('polygon vertices are inside when margin is 0', () => {
      for (const count of [5, 6, 7, 8] as PlayerCount[]) {
        const params = getTableShape(count);
        const vertices = getPolygonVertices(params.sideCount, params.circumradius);
        expect(vertices).toBeDefined();

        for (const v of vertices) {
          // Exactly on vertex with 0 margin
          expect(isPointInsideTable(v, params, 0)).toBe(true);
          // Just slightly inside along radius
          expect(isPointInsideTable({ x: v.x * 0.95, z: v.z * 0.95 }, params, 0.2)).toBe(true);
        }
      }
    });

    it('polygon edge midpoints are inside', () => {
      for (const count of [5, 6, 7, 8] as PlayerCount[]) {
        const params = getTableShape(count);
        const vertices = getPolygonVertices(params.sideCount, params.circumradius);
        const N = vertices.length;

        for (let i = 0; i < N; i++) {
          const p1 = vertices[i]!;
          const p2 = vertices[(i + 1) % N]!;
          const midX = (p1.x + p2.x) / 2;
          const midZ = (p1.z + p2.z) / 2;

          expect(isPointInsideTable({ x: midX, z: midZ }, params, 0)).toBe(true);
          // Inward slightly
          expect(isPointInsideTable({ x: midX * 0.9, z: midZ * 0.9 }, params, 0.5)).toBe(true);
        }
      }
    });

    it('rectangle bounds for 2, 3, 4 players are respected', () => {
      for (const count of [2, 3, 4] as PlayerCount[]) {
        const params = getTableShape(count);
        const halfW = params.feltWidth / 2;
        const halfD = params.feltDepth / 2;

        expect(isPointInsideTable({ x: halfW * 0.9, z: halfD * 0.9 }, params, 0)).toBe(true);
        expect(isPointInsideTable({ x: halfW + 1, z: 0 }, params, 0)).toBe(false);
        expect(isPointInsideTable({ x: 0, z: halfD + 1 }, params, 0)).toBe(false);
      }
    });
  });

  describe('clampPointToTable & getNearestValidPoint', () => {
    it('keeps inside points unchanged', () => {
      for (const count of playerCounts) {
        const params = getTableShape(count);
        const inside = { x: 1.5, z: -1.5 };
        const clamped = clampPointToTable(inside, params, 0.5);
        expect(clamped.x).toBeCloseTo(inside.x, 3);
        expect(clamped.z).toBeCloseTo(inside.z, 3);
      }
    });

    it('clamps outside points to valid positions inside felt', () => {
      for (const count of playerCounts) {
        const params = getTableShape(count);
        const outside = { x: 30, z: 30 };
        const clamped = clampPointToTable(outside, params, 0.5);

        expect(isPointInsideTable(clamped, params, 0.5)).toBe(true);
      }
    });

    it('getNearestValidPoint returns an inside point when tested with outside positions', () => {
      const octagonParams = getTableShape(8);
      const outsidePoints = [
        { x: 25, z: 0 },
        { x: -20, z: 20 },
        { x: 0, z: -30 },
      ];

      for (const pt of outsidePoints) {
        const validPt = getNearestValidPoint(pt, octagonParams, 0.5);
        expect(isPointInsideTable(validPt, octagonParams, 0.4)).toBe(true);
      }
    });
  });

  describe('clampTablePosition with TableShapeParams', () => {
    it('allows cards beyond old 15.5x9.5 limits on large polygon tables', () => {
      const octagonParams = getTableShape(8); // R = 16.5, inradius ~ 15.24
      // Old clamp limit for X was ~7.75 - 0.4 = 7.35
      // With octagon params, x = 11.0, z = 0 is well inside the table!
      const targetPos = { x: 11.0, z: 0 };
      const clampedWithParams = clampTablePosition(
        targetPos.x,
        targetPos.z,
        0,
        undefined,
        undefined,
        octagonParams
      );

      // It should NOT be clamped to 7.35
      expect(clampedWithParams.x).toBeCloseTo(11.0, 1);
      expect(clampedWithParams.z).toBeCloseTo(0, 1);

      // Without params (fallback legacy), it would clamp to <= 7.35
      const clampedLegacy = clampTablePosition(targetPos.x, targetPos.z, 0);
      expect(clampedLegacy.x).toBeLessThan(8.0);
    });

    it('constrains card correctly within scaled rectangle tables (e.g. 4p: 28x19)', () => {
      const fourPlayerParams = getTableShape(4); // 28 x 19, halfW = 14, halfD = 9.5
      // Point at (12, 7) is inside 4p table (halfW=14, halfD=9.5)
      const insidePos = { x: 12.0, z: 7.0 };
      const clamped = clampTablePosition(
        insidePos.x,
        insidePos.z,
        0,
        undefined,
        undefined,
        fourPlayerParams
      );
      expect(clamped.x).toBeCloseTo(12.0, 1);
      expect(clamped.z).toBeCloseTo(7.0, 1);

      // Point at (20, 15) is outside, clamped to inside
      const outsidePos = { x: 20.0, z: 15.0 };
      const clampedOut = clampTablePosition(
        outsidePos.x,
        outsidePos.z,
        0,
        undefined,
        undefined,
        fourPlayerParams
      );
      expect(clampedOut.x).toBeLessThanOrEqual(14.0);
      expect(clampedOut.z).toBeLessThanOrEqual(9.5);
    });
  });
});
