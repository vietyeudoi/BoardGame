/**
 * tableZones142.test.ts — Unit tests for M1.4.2 Table Zones System
 * Validates spatial separation, orientation, and lifecycle for:
 * Deck Zone, Discard Zone, Player Areas, and Card Placement Zones.
 */

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PlayerCount, getTableShape } from '../objects/TableShapeConfig';
import {
  ZoneRect,
  computeTableZones,
  ZONE_VISUAL_CONFIG,
} from '../objects/TableZonesConfig';
import { TableZoneObject3D } from '../objects/TableZoneObject3D';
import { TableZoneManager } from '../objects/TableZoneManager';

interface Point2D {
  x: number;
  z: number;
}

function getZoneCorners(z: ZoneRect): Point2D[] {
  const hw = z.width / 2;
  const hd = z.depth / 2;
  const localOffsets = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ];
  const cos = Math.cos(z.rotationY);
  const sin = Math.sin(z.rotationY);
  return localOffsets.map((pt) => ({
    x: z.x + pt.x * cos - pt.z * sin,
    z: z.z + pt.x * sin + pt.z * cos,
  }));
}

function checkPolygonsOverlap(p1: Point2D[], p2: Point2D[]): boolean {
  const polygons = [p1, p2];
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i]!;
    for (let j = 0; j < poly.length; j++) {
      const pCurrent = poly[j]!;
      const pNext = poly[(j + 1) % poly.length]!;
      const normal = { x: -(pNext.z - pCurrent.z), z: pNext.x - pCurrent.x };

      let min1 = Infinity;
      let max1 = -Infinity;
      for (const p of p1) {
        const dot = p.x * normal.x + p.z * normal.z;
        min1 = Math.min(min1, dot);
        max1 = Math.max(max1, dot);
      }

      let min2 = Infinity;
      let max2 = -Infinity;
      for (const p of p2) {
        const dot = p.x * normal.x + p.z * normal.z;
        min2 = Math.min(min2, dot);
        max2 = Math.max(max2, dot);
      }

      if (max1 < min2 || max2 < min1) {
        return false;
      }
    }
  }
  return true;
}

describe('M1.4.2 — Table Zones System', () => {
  const allCounts: PlayerCount[] = [2, 3, 4, 5, 6, 7, 8];

  // ─── Nhóm 1 — Spatial Separation & Orientation ──────────────────────────────

  describe('Nhóm 1 — Spatial Separation & Orientation', () => {
    it.each(allCounts)('PlayerCount = %i: generates complete zones layout with finite coordinates', (count) => {
      const layout = computeTableZones(count);
      expect(layout.playerCount).toBe(count);

      // Deck Zone
      expect(Number.isFinite(layout.deckZone.x)).toBe(true);
      expect(Number.isFinite(layout.deckZone.z)).toBe(true);
      expect(layout.deckZone.width).toBeGreaterThan(0);
      expect(layout.deckZone.depth).toBeGreaterThan(0);

      // Discard Zone
      expect(Number.isFinite(layout.discardZone.x)).toBe(true);
      expect(Number.isFinite(layout.discardZone.z)).toBe(true);
      expect(layout.discardZone.width).toBeGreaterThan(0);
      expect(layout.discardZone.depth).toBeGreaterThan(0);

      // Player Areas & Card Placement Zones
      expect(layout.playerAreas).toHaveLength(count);
      expect(layout.cardPlacementZones).toHaveLength(count);

      for (let i = 0; i < count; i++) {
        const pa = layout.playerAreas[i]!;
        const pz = layout.cardPlacementZones[i]!;

        expect(Number.isFinite(pa.x)).toBe(true);
        expect(Number.isFinite(pa.z)).toBe(true);
        expect(Number.isFinite(pz.x)).toBe(true);
        expect(Number.isFinite(pz.z)).toBe(true);
      }
    });

    it.each(allCounts)('PlayerCount = %i: Deck and Discard zones are distinctly separated', (count) => {
      const layout = computeTableZones(count);
      const deck = layout.deckZone;
      const discard = layout.discardZone;

      // Distance between deck center and discard center
      const dist = Math.hypot(deck.x - discard.x, deck.z - discard.z);
      expect(dist).toBeGreaterThanOrEqual(deck.width);
      expect(deck.x).toBeLessThan(0);
      expect(discard.x).toBeGreaterThan(0);

      const deckCorners = getZoneCorners(deck);
      const discardCorners = getZoneCorners(discard);
      expect(checkPolygonsOverlap(deckCorners, discardCorners)).toBe(false);
    });

    it.each(allCounts)('PlayerCount = %i: Deck & Discard do not overlap any Placement Zone or Player Area (SAT exact)', (count) => {
      const layout = computeTableZones(count);
      const centerZones = [layout.deckZone, layout.discardZone];

      for (const cz of centerZones) {
        const czCorners = getZoneCorners(cz);

        // Check against each placement zone
        for (const pz of layout.cardPlacementZones) {
          const pzCorners = getZoneCorners(pz);
          const overlaps = checkPolygonsOverlap(czCorners, pzCorners);
          expect(overlaps).toBe(false);
        }

        // Check against each player area
        for (const pa of layout.playerAreas) {
          const paCorners = getZoneCorners(pa);
          const overlaps = checkPolygonsOverlap(czCorners, paCorners);
          expect(overlaps).toBe(false);
        }
      }
    });

    it.each([5, 6, 7, 8] as const)('Polygon N = %i: Placement Zone is located between Table Center and Player Area', (N) => {
      const layout = computeTableZones(N);

      for (let i = 0; i < N; i++) {
        const pa = layout.playerAreas[i]!;
        const pz = layout.cardPlacementZones[i]!;

        const rPlayer = Math.hypot(pa.x, pa.z);
        const rPlacement = Math.hypot(pz.x, pz.z);

        // Placement zone is closer to center than Player Area
        expect(rPlacement).toBeLessThan(rPlayer);
        // But placement zone is still comfortably outside the central deck arena (r > 3.0)
        expect(rPlacement - pz.depth / 2).toBeGreaterThanOrEqual(3.0);

        // Orientations match (both face center)
        expect(Math.cos(pz.rotationY)).toBeCloseTo(Math.cos(pa.rotationY), 4);
        expect(Math.sin(pz.rotationY)).toBeCloseTo(Math.sin(pa.rotationY), 4);
      }
    });

    it.each([5, 6, 7, 8] as const)('Polygon N = %i: All zones remain within felt inradius', (N) => {
      const shape = getTableShape(N);
      const layout = computeTableZones(N, shape.circumradius);

      for (const pz of layout.cardPlacementZones) {
        const rOuter = Math.hypot(pz.x, pz.z) + pz.depth / 2;
        expect(rOuter).toBeLessThanOrEqual(shape.inradius);
      }
    });
  });

  // ─── Nhóm 2 — TableZoneObject3D Visual Object Lifecycle ─────────────────────

  describe('Nhóm 2 — TableZoneObject3D Visual Object Lifecycle', () => {
    it('creates 3D mesh with border line, fill mesh, and label', () => {
      const zone = new TableZoneObject3D({
        id: 'test_zone_1',
        x: 1.0,
        z: 2.0,
        rotationY: Math.PI / 4,
        width: 3.0,
        depth: 4.0,
        label: 'Zone Test',
        borderColor: 0x00ff00,
      });

      expect(zone.zoneId).toBe('test_zone_1');
      expect(zone.getLabel()).toBe('Zone Test');
      expect(zone.getWidth()).toBe(3.0);
      expect(zone.getDepth()).toBe(4.0);
      expect(zone.position.x).toBeCloseTo(1.0);
      expect(zone.position.z).toBeCloseTo(2.0);
      expect(zone.position.y).toBeCloseTo(ZONE_VISUAL_CONFIG.SURFACE_Y);
      expect(zone.rotation.y).toBeCloseTo(Math.PI / 4);

      // Children: border line, fill mesh, sprite
      expect(zone.children.length).toBeGreaterThanOrEqual(3);

      expect(() => zone.dispose()).not.toThrow();
    });
  });

  // ─── Nhóm 3 — TableZoneManager Layout Lifecycle ─────────────────────────────

  describe('Nhóm 3 — TableZoneManager Layout Lifecycle', () => {
    it('sets up all required zones for any player count', () => {
      const scene = new THREE.Scene();
      const requestRender = vi.fn();
      const manager = new TableZoneManager(scene, requestRender);

      for (const count of allCounts) {
        const layout = manager.setupZones(count);
        expect(layout.playerCount).toBe(count);

        // Deck and Discard positions
        const deckPos = manager.getDeckPosition();
        const discardPos = manager.getDiscardPosition();

        expect(deckPos.y).toBeCloseTo(ZONE_VISUAL_CONFIG.SURFACE_Y);
        expect(discardPos.y).toBeCloseTo(ZONE_VISUAL_CONFIG.SURFACE_Y);
        expect(deckPos.x).toBeLessThan(0);
        expect(discardPos.x).toBeGreaterThan(0);

        // Placement zones
        const pZones = manager.getAllPlacementZones();
        expect(pZones).toHaveLength(count);

        for (let i = 0; i < count; i++) {
          const pz = manager.getPlacementZone(i);
          expect(pz).toBeDefined();
          expect(pz!.id).toBe(`card_placement_${i + 1}`);
        }
      }

      expect(requestRender).toHaveBeenCalled();
      manager.dispose();
      expect(scene.children).toHaveLength(0);
    });

    it('toggles visibility cleanly across all zones', () => {
      const scene = new THREE.Scene();
      const manager = new TableZoneManager(scene, vi.fn());

      manager.setupZones(4);
      expect(manager.isVisible()).toBe(true);

      manager.setAllVisible(false);
      expect(manager.isVisible()).toBe(false);

      manager.setAllVisible(true);
      expect(manager.isVisible()).toBe(true);

      manager.dispose();
    });
  });
});
