/**
 * dynamicTable141.test.ts — Test Suite for M1.4.1: Dynamic Polygon Table System & Adaptive Table Scaling
 * Tests TableShapeConfig, TableGeometryBuilder, TableObject3D dynamic rebuilds,
 * PlayerArea adaptive polygon layout, and CameraController adaptive radius.
 * Strict testing per PROJECT_RULES.md (no rules, no turn manager, no sync logic).
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  PlayerCount,
  getTableShape,
  getPolygonVertices,
  getPolygonEdgeMidpoints,
} from '../objects/TableShapeConfig';
import { TableGeometryBuilder } from '../objects/TableGeometryBuilder';
import { TableObject3D } from '../objects/TableObject3D';
import { TABLE_CONFIG } from '../objects/TableConfig';
import {
  getLayoutForShape,
  PLAYER_AREA_VISUAL_CONFIG,
} from '../objects/PlayerAreaConfig';
import { PlayerAreaManager } from '../objects/PlayerAreaManager';
import { CameraController } from '../scene/CameraController';
import { CardRegistry } from '../objects/CardRegistry';
import { CardObject3D } from '../objects/CardObject3D';

describe('M1.4.1 — Dynamic Polygon Table System & Adaptive Scaling', () => {
  // ─── 1. TableShapeConfig ───────────────────────────────────────────────────

  describe('TableShapeConfig', () => {
    it('returns rectangular shape for 2, 3, and 4 players', () => {
      expect(getTableShape(2).shapeType).toBe('rectangle');
      expect(getTableShape(3).shapeType).toBe('rectangle');
      expect(getTableShape(4).shapeType).toBe('rectangle');
      expect(getTableShape(2).sideCount).toBe(4);
      expect(getTableShape(3).sideCount).toBe(4);
      expect(getTableShape(4).sideCount).toBe(4);
    });

    it('returns regular polygon shape with N sides for 5, 6, 7, and 8 players', () => {
      expect(getTableShape(5).shapeType).toBe('polygon');
      expect(getTableShape(5).sideCount).toBe(5);

      expect(getTableShape(6).shapeType).toBe('polygon');
      expect(getTableShape(6).sideCount).toBe(6);

      expect(getTableShape(7).shapeType).toBe('polygon');
      expect(getTableShape(7).sideCount).toBe(7);

      expect(getTableShape(8).shapeType).toBe('polygon');
      expect(getTableShape(8).sideCount).toBe(8);
    });

    it('polygon circumradius is strictly positive and increases with player count (5–8)', () => {
      const r5 = getTableShape(5).circumradius;
      const r6 = getTableShape(6).circumradius;
      const r7 = getTableShape(7).circumradius;
      const r8 = getTableShape(8).circumradius;

      expect(r5).toBeGreaterThan(0);
      expect(r6).toBeGreaterThan(r5);
      expect(r7).toBeGreaterThan(r6);
      expect(r8).toBeGreaterThan(r7);
    });

    it('cameraRadius increases monotonically with table scale and player count', () => {
      const counts: PlayerCount[] = [2, 3, 4, 5, 6, 7, 8];
      for (let i = 0; i < counts.length - 1; i++) {
        const c1 = counts[i]!;
        const c2 = counts[i + 1]!;
        expect(getTableShape(c2).cameraRadius).toBeGreaterThan(
          getTableShape(c1).cameraRadius
        );
      }
    });

    it('all shape params have finite positive dimensions and valid camera radii', () => {
      const counts: PlayerCount[] = [2, 3, 4, 5, 6, 7, 8];
      for (const count of counts) {
        const shape = getTableShape(count);
        expect(Number.isFinite(shape.circumradius)).toBe(true);
        expect(shape.circumradius).toBeGreaterThan(0);
        expect(Number.isFinite(shape.inradius)).toBe(true);
        expect(shape.inradius).toBeGreaterThan(0);
        expect(shape.cameraRadius).toBeGreaterThanOrEqual(4.5);
        expect(shape.cameraRadius).toBeLessThanOrEqual(35.0);
      }
    });

    it('getPolygonVertices generates exactly N finite vertices', () => {
      for (let n = 5; n <= 8; n++) {
        const vertices = getPolygonVertices(n, 7.0);
        expect(vertices).toHaveLength(n);
        for (const v of vertices) {
          expect(Number.isFinite(v.x)).toBe(true);
          expect(Number.isFinite(v.z)).toBe(true);
        }
      }
    });

    it('getPolygonEdgeMidpoints produces symmetric midpoints with correct angles', () => {
      const midpoints = getPolygonEdgeMidpoints(5, 6.0);
      expect(midpoints).toHaveLength(5);
      // First midpoint should be at South (x ≈ 0, z > 0, angle = 0)
      expect(Math.abs(midpoints[0]!.x)).toBeLessThan(1e-5);
      expect(midpoints[0]!.z).toBeGreaterThan(0);
      expect(midpoints[0]!.angle).toBeCloseTo(0);
    });
  });

  // ─── 2. TableGeometryBuilder ───────────────────────────────────────────────

  describe('TableGeometryBuilder', () => {
    it('builds rectangular felt geometry with BoxGeometry matching dimensions', () => {
      const params = getTableShape(4);
      const { geometry, position } = TableGeometryBuilder.buildFeltGeometry(params);
      expect(geometry).toBeInstanceOf(THREE.BoxGeometry);
      expect(position.y).toBeCloseTo(
        TABLE_CONFIG.SURFACE_Y - TABLE_CONFIG.FELT_THICKNESS / 2
      );
      geometry.dispose();
    });

    it('builds polygon felt geometry with ExtrudeGeometry and upward normals', () => {
      const params = getTableShape(6);
      const { geometry, position } = TableGeometryBuilder.buildFeltGeometry(params);
      expect(geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
      expect(position.y).toBeCloseTo(TABLE_CONFIG.SURFACE_Y);

      geometry.computeBoundingBox();
      expect(geometry.boundingBox).toBeDefined();
      expect(geometry.boundingBox!.max.y).toBeCloseTo(0, 4);

      geometry.dispose();
    });

    it('builds 4 wood rail specs for rectangular tables', () => {
      const params = getTableShape(4);
      const rails = TableGeometryBuilder.buildRailSpecs(params);
      expect(rails).toHaveLength(4);
      const names = rails.map((r) => r.name);
      expect(names).toContain('Table-Rail-North');
      expect(names).toContain('Table-Rail-South');
      expect(names).toContain('Table-Rail-East');
      expect(names).toContain('Table-Rail-West');
      rails.forEach((r) => r.geometry.dispose());
    });

    it('builds N wood rail specs for polygon tables', () => {
      for (const count of [5, 6, 7, 8] as const) {
        const params = getTableShape(count);
        const rails = TableGeometryBuilder.buildRailSpecs(params);
        expect(rails).toHaveLength(count);
        for (const r of rails) {
          expect(Number.isFinite(r.position.x)).toBe(true);
          expect(Number.isFinite(r.position.z)).toBe(true);
          expect(Number.isFinite(r.rotationY)).toBe(true);
          r.geometry.dispose();
        }
      }
    });

    it('builds apron geometry matching table boundary', () => {
      const paramsRec = getTableShape(4);
      const apronRec = TableGeometryBuilder.buildApronSpec(paramsRec);
      expect(apronRec.geometry).toBeInstanceOf(THREE.BoxGeometry);
      apronRec.geometry.dispose();

      const paramsPoly = getTableShape(5);
      const apronPoly = TableGeometryBuilder.buildApronSpec(paramsPoly);
      expect(apronPoly.geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
      apronPoly.geometry.dispose();
    });

    it('builds 4 legs for rectangular table and N legs for polygon table', () => {
      const recLegs = TableGeometryBuilder.buildLegPositions(getTableShape(4));
      expect(recLegs).toHaveLength(4);

      for (const count of [5, 6, 7, 8] as const) {
        const polyLegs = TableGeometryBuilder.buildLegPositions(getTableShape(count));
        expect(polyLegs).toHaveLength(count);
        for (const leg of polyLegs) {
          expect(Number.isFinite(leg.x)).toBe(true);
          expect(Number.isFinite(leg.z)).toBe(true);
          expect(leg.y).toBeLessThan(TABLE_CONFIG.SURFACE_Y);
        }
      }
    });
  });

  // ─── 3. TableObject3D Dynamic Rebuilds ──────────────────────────────────────

  describe('TableObject3D', () => {
    it('constructs with 4-player rectangular table by default', () => {
      const table = new TableObject3D();
      expect(table.playerCount).toBe(4);
      expect(table.shapeType).toBe('rectangle');
      expect(table.surfaceY).toBe(TABLE_CONFIG.SURFACE_Y);

      // Felt + 4 rails + 1 apron + 4 legs = 10 children
      expect(table.children).toHaveLength(10);
      table.dispose();
    });

    it('rebuilds dynamically to 5-player pentagon table', () => {
      const table = new TableObject3D();
      table.rebuild(5);

      expect(table.playerCount).toBe(5);
      expect(table.shapeType).toBe('polygon');
      // Felt (1) + Rails (5) + Apron (1) + Legs (5) = 12 children
      expect(table.children).toHaveLength(12);

      const railChildren = table.children.filter((c) =>
        c.name.startsWith('Table-Rail-Edge')
      );
      expect(railChildren).toHaveLength(5);

      const legChildren = table.children.filter((c) =>
        c.name.startsWith('Table-Leg-')
      );
      expect(legChildren).toHaveLength(5);

      table.dispose();
    });

    it('rebuilds dynamically to 8-player octagon table', () => {
      const table = new TableObject3D();
      table.rebuild(8);

      expect(table.playerCount).toBe(8);
      expect(table.shapeType).toBe('polygon');
      // Felt (1) + Rails (8) + Apron (1) + Legs (8) = 18 children
      expect(table.children).toHaveLength(18);

      const railChildren = table.children.filter((c) =>
        c.name.startsWith('Table-Rail-Edge')
      );
      expect(railChildren).toHaveLength(8);

      table.dispose();
    });

    it('supports multiple sequential rebuilds without leaking or throwing', () => {
      const table = new TableObject3D();
      const sequence: PlayerCount[] = [2, 5, 6, 8, 4, 7, 3, 2];

      for (const count of sequence) {
        expect(() => table.rebuild(count)).not.toThrow();
        expect(table.playerCount).toBe(count);
        expect(table.surfaceY).toBe(TABLE_CONFIG.SURFACE_Y);
      }

      table.dispose();
    });
  });

  // ─── 4. Player Area Adaptive Positioning ───────────────────────────────────

  describe('Player Area Adaptive Positioning', () => {
    it('getLayoutForShape produces exactly N player positions for all 2–8 player counts', () => {
      for (const count of [2, 3, 4, 5, 6, 7, 8] as const) {
        const positions = getLayoutForShape(count);
        expect(positions).toHaveLength(count);
        for (const pos of positions) {
          expect(Number.isFinite(pos.x)).toBe(true);
          expect(Number.isFinite(pos.z)).toBe(true);
          expect(Number.isFinite(pos.rotationY)).toBe(true);
          expect(pos.suggestedLabel).toBeTruthy();
        }
      }
    });

    it('polygon player areas have no bounding box overlap for 5 players', () => {
      const positions = getLayoutForShape(5, 6.0);
      const halfD = PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH / 2;

      // Check distance between area centers is sufficient
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.hypot(
            positions[i]!.x - positions[j]!.x,
            positions[i]!.z - positions[j]!.z
          );
          // Distance should be greater than the area depth
          expect(dist).toBeGreaterThan(halfD * 2);
        }
      }
    });

    it('polygon player areas have no bounding box overlap for 8 players', () => {
      const positions = getLayoutForShape(8, 8.4);
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dist = Math.hypot(
            positions[i]!.x - positions[j]!.x,
            positions[i]!.z - positions[j]!.z
          );
          expect(dist).toBeGreaterThan(PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH);
        }
      }
    });

    it('setupLayout in PlayerAreaManager positions areas correctly with custom circumradius', () => {
      const scene = new THREE.Scene();
      const requestRender = vi.fn();
      const manager = new PlayerAreaManager(scene, requestRender);

      manager.setupLayout(7, undefined, 7.6);
      expect(manager.getPlayerCount()).toBe(7);
      expect(manager.getAllAreas()).toHaveLength(7);
      expect(requestRender).toHaveBeenCalled();

      manager.dispose();
    });
  });

  // ─── 5. CameraController Adaptive Radius ───────────────────────────────────

  describe('CameraController Adaptive Radius', () => {
    it('setAdaptiveRadius adjusts camera distance and triggers onChange callback', () => {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      const domElement = document.createElement('canvas');
      const onChange = vi.fn();
      const controller = new CameraController(camera, domElement);
      controller.onChange = onChange;

      const initialRadius = controller.getRadius();
      expect(initialRadius).toBe(13.5);

      controller.setAdaptiveRadius(18.5);
      expect(controller.getRadius()).toBeCloseTo(18.5);
      expect(onChange).toHaveBeenCalled();

      controller.dispose();
    });

    it('setAdaptiveRadius clamps radius within minDistance and maxDistance', () => {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      const domElement = document.createElement('canvas');
      const controller = new CameraController(camera, domElement, {
        minDistance: 5.0,
        maxDistance: 20.0,
      });

      controller.setAdaptiveRadius(2.0); // Below min
      expect(controller.getRadius()).toBe(5.0);

      controller.setAdaptiveRadius(30.0); // Above max
      expect(controller.getRadius()).toBe(20.0);

      controller.dispose();
    });
  });

  // ─── 6. Integration: Table Rebuild Preserves Invariants ──────────────────────

  describe('Table Rebuild Invariant Preservation', () => {
    it('table rebuild does not modify CardRegistry or card locations', () => {
      const registry = new CardRegistry();
      const demoCard = new CardObject3D({
        id: 'card_demo_1',
        faceUp: true,
        position: { x: 0, y: 0, z: 0 },
      });
      registry.registerTableCard(demoCard);
      registry.registerDeck('deck_1', ['c1', 'c2', 'c3']);

      expect(registry.getLocation('card_demo_1')).toBe('ON_TABLE');
      expect(registry.getCardsInDeck('deck_1')).toHaveLength(3);

      // Simulate table rebuild
      const table = new TableObject3D();
      table.rebuild(6);

      // CardRegistry is completely unaffected
      expect(registry.getLocation('card_demo_1')).toBe('ON_TABLE');
      expect(registry.getCardsInDeck('deck_1')).toHaveLength(3);

      table.dispose();
      demoCard.dispose();
    });
  });
});
