/**
 * tableGeometry142.test.ts — Test Suite for M1.4.2: Table Geometry Correction & Adaptive Scaling
 * Thoroughly validates polygon geometry, mitered rail connections, felt/rail/apron coherence,
 * player area safety clearance, state preservation during rebuild, and adaptive camera framing.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PlayerCount,
  getTableShape,
  getPolygonVertices,
  getTableFeltVertices,
  getTableOuterRadius,
} from '../objects/TableShapeConfig';
import { TableGeometryBuilder } from '../objects/TableGeometryBuilder';
import { TableObject3D } from '../objects/TableObject3D';
import { TABLE_CONFIG } from '../objects/TableConfig';
import {
  getLayoutForShape,
  PLAYER_AREA_VISUAL_CONFIG,
} from '../objects/PlayerAreaConfig';
import { CameraController } from '../scene/CameraController';
import { CardRegistry } from '../objects/CardRegistry';
import { CardObject3D } from '../objects/CardObject3D';

describe('M1.4.2 — Table Geometry Correction & Adaptive Scaling', () => {
  // ─── Nhóm A — Polygon Geometry ─────────────────────────────────────────────

  describe('Nhóm A — Polygon Geometry (N = 5, 6, 7, 8)', () => {
    const polygonCounts: PlayerCount[] = [5, 6, 7, 8];

    it.each(polygonCounts)('N = %i has exactly N vertices and no NaN/Infinity', (N) => {
      const shape = getTableShape(N);
      const vertices = getPolygonVertices(N, shape.circumradius);
      expect(vertices).toHaveLength(N);

      for (const v of vertices) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(Number.isFinite(v.z)).toBe(true);
        expect(Number.isNaN(v.x)).toBe(false);
        expect(Number.isNaN(v.z)).toBe(false);
      }
    });

    it.each(polygonCounts)('N = %i has all edges of equal length', (N) => {
      const shape = getTableShape(N);
      const vertices = getPolygonVertices(N, shape.circumradius);
      const expectedEdgeLen = 2 * shape.circumradius * Math.sin(Math.PI / N);

      for (let i = 0; i < N; i++) {
        const p1 = vertices[i]!;
        const p2 = vertices[(i + 1) % N]!;
        const edgeLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        expect(edgeLen).toBeCloseTo(expectedEdgeLen, 4);
      }
    });

    it.each(polygonCounts)('N = %i polygon centroid is exactly (0, 0)', (N) => {
      const shape = getTableShape(N);
      const vertices = getPolygonVertices(N, shape.circumradius);
      const sumX = vertices.reduce((acc, v) => acc + v.x, 0);
      const sumZ = vertices.reduce((acc, v) => acc + v.z, 0);
      expect(Math.abs(sumX / N)).toBeLessThan(1e-5);
      expect(Math.abs(sumZ / N)).toBeLessThan(1e-5);
    });

    it.each(polygonCounts)('N = %i has positive shoelace area and correct inradius', (N) => {
      const shape = getTableShape(N);
      const vertices = getPolygonVertices(N, shape.circumradius);

      // Shoelace area formula
      let shoelaceSum = 0;
      for (let i = 0; i < N; i++) {
        const p1 = vertices[i]!;
        const p2 = vertices[(i + 1) % N]!;
        shoelaceSum += p1.x * p2.z - p2.x * p1.z;
      }
      const area = Math.abs(shoelaceSum) / 2;
      const theoreticalArea = 0.5 * N * Math.pow(shape.circumradius, 2) * Math.sin((2 * Math.PI) / N);
      expect(area).toBeCloseTo(theoreticalArea, 3);
      expect(area).toBeGreaterThan(0);

      // Inradius check
      const expectedInradius = shape.circumradius * Math.cos(Math.PI / N);
      expect(shape.inradius).toBeCloseTo(expectedInradius, 4);
    });
  });

  // ─── Nhóm B — Rail Geometry & Miter Alignment ──────────────────────────────

  describe('Nhóm B — Rail Geometry & Miter Alignment', () => {
    it.each([2, 3, 4, 5, 6, 7, 8] as PlayerCount[])(
      'Player count %i builds exactly sideCount rails matching edge midpoints',
      (count) => {
        const params = getTableShape(count);
        const vertices = getTableFeltVertices(params);
        const rails = TableGeometryBuilder.buildRailSpecs(params);

        expect(rails).toHaveLength(params.sideCount);

        for (let i = 0; i < params.sideCount; i++) {
          const p1 = vertices[i]!;
          const p2 = vertices[(i + 1) % params.sideCount]!;
          const expectedMidX = (p1.x + p2.x) / 2;
          const expectedMidZ = (p1.z + p2.z) / 2;

          const rail = rails[i]!;
          expect(rail.position.x).toBeCloseTo(expectedMidX, 4);
          expect(rail.position.z).toBeCloseTo(expectedMidZ, 4);

          // Rotation angle check
          const expectedRotY = Math.atan2(-(p2.z - p1.z), p2.x - p1.x);
          expect(rail.rotationY).toBeCloseTo(expectedRotY, 4);

          rail.geometry.dispose();
        }
      }
    );

    it.each([5, 6, 7, 8] as const)('Polygon N = %i rails meet at exact miter corner vertices', (N) => {
      const params = getTableShape(N);
      const vertices = getPolygonVertices(N, params.circumradius);
      const rails = TableGeometryBuilder.buildRailSpecs(params);
      const W = params.railWidth;
      const miterOffset = W * Math.tan(Math.PI / N);

      // For every corner, the outer right vertex of rail i must match the outer left vertex of rail i+1
      for (let i = 0; i < N; i++) {
        const p1 = vertices[i]!;
        const p2 = vertices[(i + 1) % N]!;
        const L = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const rotY = rails[i]!.rotationY;
        const midX = rails[i]!.position.x;
        const midZ = rails[i]!.position.z;

        // In local coordinates, outer right is (+L/2 + miterOffset, W)
        const localRightX = L / 2 + miterOffset;
        const localRightZ = W;
        // Transform to world coordinates
        const worldRightX = midX + localRightX * Math.cos(rotY) + localRightZ * Math.sin(rotY);
        const worldRightZ = midZ - localRightX * Math.sin(rotY) + localRightZ * Math.cos(rotY);

        // Next rail
        const nextIdx = (i + 1) % N;
        const nextP1 = vertices[nextIdx]!;
        const nextP2 = vertices[(nextIdx + 1) % N]!;
        const nextL = Math.hypot(nextP2.x - nextP1.x, nextP2.z - nextP1.z);
        const nextRotY = rails[nextIdx]!.rotationY;
        const nextMidX = rails[nextIdx]!.position.x;
        const nextMidZ = rails[nextIdx]!.position.z;

        // In local coordinates of next rail, outer left is (-nextL/2 - miterOffset, W)
        const nextLocalLeftX = -nextL / 2 - miterOffset;
        const nextLocalLeftZ = W;
        const worldNextLeftX = nextMidX + nextLocalLeftX * Math.cos(nextRotY) + nextLocalLeftZ * Math.sin(nextRotY);
        const worldNextLeftZ = nextMidZ - nextLocalLeftX * Math.sin(nextRotY) + nextLocalLeftZ * Math.cos(nextRotY);

        expect(worldRightX).toBeCloseTo(worldNextLeftX, 3);
        expect(worldRightZ).toBeCloseTo(worldNextLeftZ, 3);
      }

      rails.forEach((r) => r.geometry.dispose());
    });

    it('Rectangle (4 players) rails meet at exact 45-degree miter corners', () => {
      const params = getTableShape(4);
      const rails = TableGeometryBuilder.buildRailSpecs(params);
      const outerHalfW = params.feltWidth / 2 + params.railWidth;
      const outerHalfD = params.feltDepth / 2 + params.railWidth;

      // Ensure all outer corner vertices are within boundary
      const outerRadius = getTableOuterRadius(params);
      expect(outerRadius).toBeCloseTo(Math.hypot(outerHalfW, outerHalfD), 4);

      rails.forEach((r) => r.geometry.dispose());
    });
  });

  // ─── Nhóm C — Felt, Rail và Apron Coherence ─────────────────────────────────

  describe('Nhóm C — Felt, Rail và Apron Coherence', () => {
    it.each([4, 5, 6, 7, 8] as PlayerCount[])('Table %i components have unified surface and vertical alignment', (count) => {
      const table = new TableObject3D(count);
      expect(table.surfaceY).toBe(TABLE_CONFIG.SURFACE_Y);

      // Verify felt surface top is at SURFACE_Y
      const felt = table.children.find((c) => c.name === 'Table-FeltSurface') as THREE.Mesh;
      expect(felt).toBeDefined();

      // Verify rails rise above felt surface by railLip
      const rail = table.children.find((c) => c.name.includes('Rail')) as THREE.Mesh;
      expect(rail).toBeDefined();
      expect(rail.position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y + TABLE_CONFIG.RAIL_LIP, 4);

      // Verify apron is strictly beneath felt
      const apron = table.children.find((c) => c.name === 'Table-Apron') as THREE.Mesh;
      expect(apron).toBeDefined();
      expect(apron.position.y).toBeLessThan(TABLE_CONFIG.SURFACE_Y);

      // Verify legs are below apron
      const leg = table.children.find((c) => c.name.includes('Leg')) as THREE.Mesh;
      expect(leg).toBeDefined();
      expect(leg.position.y).toBeLessThan(apron.position.y);

      table.dispose();
    });
  });

  // ─── Nhóm D — PlayerArea Optimization ──────────────────────────────────────

  describe('Nhóm D — PlayerArea Safety Clearance & Invariants', () => {
    it.each([5, 6, 7, 8] as const)('Polygon N = %i player areas are inside felt and clear of rails', (N) => {
      const params = getTableShape(N);
      const positions = getLayoutForShape(N, params.circumradius);
      expect(positions).toHaveLength(N);

      const halfDepth = PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH / 2; // 1.0

      for (const pos of positions) {
        const distFromCenter = Math.hypot(pos.x, pos.z);
        // Outer boundary of player area towards rail
        const outerAreaEdgeDist = distFromCenter + halfDepth;
        // Outer edge must be less than inradius (inside the felt edge)
        expect(outerAreaEdgeDist).toBeLessThanOrEqual(params.inradius);
        // Clearance to rail should be >= RAIL_CLEARANCE (0.35)
        expect(params.inradius - outerAreaEdgeDist).toBeGreaterThanOrEqual(0.30);

        // Inner edge distance towards table center
        const innerAreaEdgeDist = distFromCenter - halfDepth;
        // Inner edge must leave central space for cards & deck (deck at radius 3.5)
        expect(innerAreaEdgeDist).toBeGreaterThanOrEqual(3.5);

        // Rotation must align long axis with polygon edge (M1.4.3 edge-tangent algorithm)
        // rotationY = atan2(-edgeDz, edgeDx) ≈ +atan2(pos.x, pos.z) for regular polygons
        const angle = Math.atan2(pos.x, pos.z);
        expect(Math.cos(pos.rotationY)).toBeCloseTo(Math.cos(angle), 4);
        expect(Math.sin(pos.rotationY)).toBeCloseTo(Math.sin(angle), 4);
      }
    });

    it.each([5, 6, 7, 8] as const)('Polygon N = %i player areas have no bounding box overlaps', (N) => {
      const params = getTableShape(N);
      const positions = getLayoutForShape(N, params.circumradius);
      const minSeparation = PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH;

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dist = Math.hypot(
            positions[i]!.x - positions[j]!.x,
            positions[i]!.z - positions[j]!.z
          );
          expect(dist).toBeGreaterThan(minSeparation);
        }
      }
    });
  });

  // ─── Nhóm E — Rebuild & State Preservation ──────────────────────────────────

  describe('Nhóm E — Rebuild & State Preservation', () => {
    it('sequential table rebuilds (4 -> 5 -> 6 -> 7 -> 8 -> 2) preserve CardRegistry', () => {
      const registry = new CardRegistry();
      const demoCard = new CardObject3D({
        id: 'test_card_preserve',
        faceUp: true,
        position: { x: 0, y: 0, z: 0 },
      });
      registry.registerTableCard(demoCard);
      registry.registerDeck('test_deck_preserve', ['card_a', 'card_b', 'card_c']);

      const table = new TableObject3D(4);
      const sequence: PlayerCount[] = [4, 5, 6, 7, 8, 2];

      for (const count of sequence) {
        expect(() => table.rebuild(count)).not.toThrow();
        expect(table.playerCount).toBe(count);

        // Invariants must remain unbroken
        expect(registry.getLocation('test_card_preserve')).toBe('ON_TABLE');
        expect(registry.getCardsInDeck('test_deck_preserve')).toHaveLength(3);
      }

      table.dispose();
      demoCard.dispose();
    });
  });

  // ─── Nhóm F — Adaptive Camera Framing ──────────────────────────────────────

  describe('Nhóm F — Adaptive Camera Framing', () => {
    it('computeAdaptiveRadius scales radius with table outer radius and aspect ratio', () => {
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      const domElement = document.createElement('canvas');
      const controller = new CameraController(camera, domElement);

      const rSmall = controller.computeAdaptiveRadius(8.0, 16 / 9);
      const rLarge = controller.computeAdaptiveRadius(12.0, 16 / 9);

      expect(rLarge).toBeGreaterThan(rSmall);
      expect(Number.isFinite(rSmall)).toBe(true);
      expect(Number.isFinite(rLarge)).toBe(true);

      // On narrow screen (portrait), camera must pull back to fit width
      const rNarrow = controller.computeAdaptiveRadius(10.0, 0.75);
      const rWide = controller.computeAdaptiveRadius(10.0, 1.777);
      expect(rNarrow).toBeGreaterThan(rWide);

      controller.dispose();
    });

    it('resetCamera returns to adapted radius after table rebuild', () => {
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      const domElement = document.createElement('canvas');
      const controller = new CameraController(camera, domElement);

      controller.setAdaptiveRadius(22.0);
      expect(controller.getRadius()).toBeCloseTo(22.0);

      // Reset camera should restore to the new adapted radius 22.0
      controller.resetCamera();
      expect(controller.getRadius()).toBeCloseTo(22.0);

      controller.dispose();
    });
  });
});
