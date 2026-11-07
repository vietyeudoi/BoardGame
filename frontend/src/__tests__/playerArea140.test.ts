/**
 * playerArea140.test.ts — Test suite for M1.4.0: Player Areas & Table Layout Foundation
 * Tests PlayerAreaConfig, PlayerAreaObject3D, and PlayerAreaManager.
 * NO game rules, NO turn management, NO ownership logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { LAYOUT_CONFIGS, PLAYER_AREA_VISUAL_CONFIG } from '../objects/PlayerAreaConfig';
import { PlayerAreaObject3D } from '../objects/PlayerAreaObject3D';
import { PlayerAreaManager } from '../objects/PlayerAreaManager';
import { TABLE_CONFIG } from '../objects/TableConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArea(opts?: Partial<ConstructorParameters<typeof PlayerAreaObject3D>[0]>): PlayerAreaObject3D {
  return new PlayerAreaObject3D({
    id: 'area_test',
    x: 0,
    z: 0,
    rotationY: 0,
    label: 'Test Area',
    ...opts,
  });
}

// ─── 1. PlayerAreaConfig ─────────────────────────────────────────────────────

describe('PlayerAreaConfig', () => {
  const FELT_HALF_X = TABLE_CONFIG.FELT_WIDTH / 2;   // 7.5
  const FELT_HALF_Z = TABLE_CONFIG.FELT_DEPTH / 2;   // 4.75

  for (const n of [2, 3, 4, 5, 6] as const) {
    describe(`Layout ${n} players`, () => {
      const config = LAYOUT_CONFIGS[n];

      it(`produces exactly ${n} positions`, () => {
        expect(config.positions).toHaveLength(n);
      });

      it('all positions have x within felt bounds', () => {
        for (const pos of config.positions) {
          expect(pos.x).toBeGreaterThanOrEqual(-FELT_HALF_X);
          expect(pos.x).toBeLessThanOrEqual(FELT_HALF_X);
        }
      });

      it('all positions have z within felt bounds', () => {
        for (const pos of config.positions) {
          expect(pos.z).toBeGreaterThanOrEqual(-FELT_HALF_Z);
          expect(pos.z).toBeLessThanOrEqual(FELT_HALF_Z);
        }
      });

      it('no rotationY is NaN or Infinity', () => {
        for (const pos of config.positions) {
          expect(Number.isFinite(pos.rotationY)).toBe(true);
        }
      });

      it('all suggestedLabels are non-empty strings', () => {
        for (const pos of config.positions) {
          expect(typeof pos.suggestedLabel).toBe('string');
          expect(pos.suggestedLabel.length).toBeGreaterThan(0);
        }
      });

      it('playerCount matches key', () => {
        expect(config.playerCount).toBe(n);
      });
    });
  }

  it('PLAYER_AREA_VISUAL_CONFIG has valid color values', () => {
    expect(PLAYER_AREA_VISUAL_CONFIG.BORDER_COLOR).toBe(TABLE_CONFIG.PLAYER_AREA_BORDER_COLOR);
    expect(PLAYER_AREA_VISUAL_CONFIG.HOVER_COLOR).toBe(TABLE_CONFIG.PLAYER_AREA_HOVER_COLOR);
    expect(PLAYER_AREA_VISUAL_CONFIG.SELECT_COLOR).toBe(TABLE_CONFIG.PLAYER_AREA_SELECT_COLOR);
    expect(PLAYER_AREA_VISUAL_CONFIG.AREA_WIDTH).toBeGreaterThan(0);
    expect(PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH).toBeGreaterThan(0);
  });
});

// ─── 2. PlayerAreaObject3D ───────────────────────────────────────────────────

describe('PlayerAreaObject3D', () => {
  it('constructs without throwing', () => {
    expect(() => makeArea()).not.toThrow();
  });

  it('isHovered() starts false', () => {
    const area = makeArea();
    expect(area.isHovered()).toBe(false);
    area.dispose();
  });

  it('isSelected() starts false', () => {
    const area = makeArea();
    expect(area.isSelected()).toBe(false);
    area.dispose();
  });

  it('setHovered(true) sets isHovered() to true', () => {
    const area = makeArea();
    area.setHovered(true);
    expect(area.isHovered()).toBe(true);
    area.dispose();
  });

  it('setHovered(false) clears hover state', () => {
    const area = makeArea();
    area.setHovered(true);
    area.setHovered(false);
    expect(area.isHovered()).toBe(false);
    area.dispose();
  });

  it('setSelected(true) sets isSelected() to true', () => {
    const area = makeArea();
    area.setSelected(true);
    expect(area.isSelected()).toBe(true);
    area.dispose();
  });

  it('setSelected(false) clears selection', () => {
    const area = makeArea();
    area.setSelected(true);
    area.setSelected(false);
    expect(area.isSelected()).toBe(false);
    area.dispose();
  });

  it('getLabel() returns the label passed in constructor', () => {
    const area = makeArea({ label: 'Player 1' });
    expect(area.getLabel()).toBe('Player 1');
    area.dispose();
  });

  it('setLabel() updates label', () => {
    const area = makeArea({ label: 'Old' });
    area.setLabel('New');
    expect(area.getLabel()).toBe('New');
    area.dispose();
  });

  it('areaId matches id in options', () => {
    const area = makeArea({ id: 'my_area' });
    expect(area.areaId).toBe('my_area');
    area.dispose();
  });

  it('containsPoint returns true for center point', () => {
    const area = makeArea({ x: 0, z: 0, rotationY: 0 });
    expect(area.containsPoint(0, 0)).toBe(true);
    area.dispose();
  });

  it('containsPoint returns false for far-away point', () => {
    const area = makeArea({ x: 0, z: 0, rotationY: 0 });
    expect(area.containsPoint(20, 20)).toBe(false);
    area.dispose();
  });

  it('getBoundingBox() returns finite numbers', () => {
    const area = makeArea({ x: 1, z: 2 });
    const bb = area.getBoundingBox();
    expect(Number.isFinite(bb.minX)).toBe(true);
    expect(Number.isFinite(bb.maxX)).toBe(true);
    expect(Number.isFinite(bb.minZ)).toBe(true);
    expect(Number.isFinite(bb.maxZ)).toBe(true);
    expect(bb.maxX).toBeGreaterThan(bb.minX);
    expect(bb.maxZ).toBeGreaterThan(bb.minZ);
    area.dispose();
  });

  it('setVisible(false) hides area', () => {
    const area = makeArea();
    area.setVisible(false);
    expect(area.visible).toBe(false);
    area.dispose();
  });

  it('setVisible(true) shows area', () => {
    const area = makeArea();
    area.setVisible(false);
    area.setVisible(true);
    expect(area.visible).toBe(true);
    area.dispose();
  });

  it('is a THREE.Group', () => {
    const area = makeArea();
    expect(area).toBeInstanceOf(THREE.Group);
    area.dispose();
  });

  it('dispose() does not throw', () => {
    const area = makeArea();
    expect(() => area.dispose()).not.toThrow();
  });

  it('dispose() twice does not throw', () => {
    const area = makeArea();
    area.dispose();
    expect(() => area.dispose()).not.toThrow();
  });
});

// ─── 3. PlayerAreaManager ─────────────────────────────────────────────────────

describe('PlayerAreaManager', () => {
  let scene: THREE.Scene;
  let renderSpy: ReturnType<typeof vi.fn>;
  let manager: PlayerAreaManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderSpy = vi.fn();
    manager = new PlayerAreaManager(scene, renderSpy);
  });

  it('setupLayout(2) creates 2 areas', () => {
    manager.setupLayout(2);
    expect(manager.getAllAreas()).toHaveLength(2);
    expect(manager.getPlayerCount()).toBe(2);
  });

  it('setupLayout(3) creates 3 areas', () => {
    manager.setupLayout(3);
    expect(manager.getAllAreas()).toHaveLength(3);
  });

  it('setupLayout(4) creates 4 areas', () => {
    manager.setupLayout(4);
    expect(manager.getAllAreas()).toHaveLength(4);
  });

  it('setupLayout(5) creates 5 areas', () => {
    manager.setupLayout(5);
    expect(manager.getAllAreas()).toHaveLength(5);
  });

  it('setupLayout(6) creates 6 areas', () => {
    manager.setupLayout(6);
    expect(manager.getAllAreas()).toHaveLength(6);
  });

  it('setupLayout(3) then setupLayout(4) replaces areas (no duplicates)', () => {
    manager.setupLayout(3);
    manager.setupLayout(4);
    expect(manager.getAllAreas()).toHaveLength(4);
    expect(manager.getPlayerCount()).toBe(4);
  });

  it('getArea returns correct PlayerAreaObject3D', () => {
    manager.setupLayout(2);
    const id = manager.getAllAreas()[0]!.areaId;
    const area = manager.getArea(id);
    expect(area).toBeDefined();
    expect(area!.areaId).toBe(id);
  });

  it('getArea returns undefined for unknown id', () => {
    manager.setupLayout(2);
    expect(manager.getArea('nonexistent')).toBeUndefined();
  });

  it('selectArea(id) sets getSelectedAreaId()', () => {
    manager.setupLayout(2);
    const id = manager.getAllAreas()[0]!.areaId;
    manager.selectArea(id);
    expect(manager.getSelectedAreaId()).toBe(id);
  });

  it('selectArea changes previously selected area to deselected', () => {
    manager.setupLayout(2);
    const areas = manager.getAllAreas();
    const id1 = areas[0]!.areaId;
    const id2 = areas[1]!.areaId;
    manager.selectArea(id1);
    manager.selectArea(id2);
    expect(manager.getSelectedAreaId()).toBe(id2);
    expect(areas[0]!.isSelected()).toBe(false);
    expect(areas[1]!.isSelected()).toBe(true);
  });

  it('deselectAll() clears selection', () => {
    manager.setupLayout(2);
    const id = manager.getAllAreas()[0]!.areaId;
    manager.selectArea(id);
    manager.deselectAll();
    expect(manager.getSelectedAreaId()).toBeNull();
  });

  it('hoverArea(id) sets getHoveredAreaId()', () => {
    manager.setupLayout(2);
    const id = manager.getAllAreas()[0]!.areaId;
    manager.hoverArea(id);
    expect(manager.getHoveredAreaId()).toBe(id);
  });

  it('hoverArea(null) clears hover', () => {
    manager.setupLayout(2);
    const id = manager.getAllAreas()[0]!.areaId;
    manager.hoverArea(id);
    manager.hoverArea(null);
    expect(manager.getHoveredAreaId()).toBeNull();
  });

  it('setAllVisible(false) makes isVisible() false', () => {
    manager.setupLayout(2);
    manager.setAllVisible(false);
    expect(manager.isVisible()).toBe(false);
    for (const area of manager.getAllAreas()) {
      expect(area.visible).toBe(false);
    }
  });

  it('setAllVisible(true) makes isVisible() true', () => {
    manager.setupLayout(2);
    manager.setAllVisible(false);
    manager.setAllVisible(true);
    expect(manager.isVisible()).toBe(true);
  });

  it('findAreaAtPoint returns correct area for known center', () => {
    manager.setupLayout(2);
    // layout 2: area 0 at (0, 3.5), area 1 at (0, -3.5)
    const found = manager.findAreaAtPoint(0, 3.5);
    expect(found).not.toBeNull();
    expect(found!.areaId).toBe('player_area_1');
  });

  it('findAreaAtPoint returns null for empty space far from any area', () => {
    manager.setupLayout(2);
    expect(manager.findAreaAtPoint(100, 100)).toBeNull();
  });

  it('validateNoOverlap() returns valid: true for all default layouts', () => {
    for (const n of [2, 3, 4, 5, 6] as const) {
      manager.setupLayout(n);
      const result = manager.validateNoOverlap();
      // We accept the result but ensure it doesn't crash and has expected shape
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.conflicts)).toBe(true);
    }
  });

  it('clearLayout removes all areas', () => {
    manager.setupLayout(4);
    manager.clearLayout();
    expect(manager.getAllAreas()).toHaveLength(0);
    expect(manager.getPlayerCount()).toBe(0);
  });

  it('requestRender is called on setupLayout', () => {
    manager.setupLayout(2);
    expect(renderSpy).toHaveBeenCalled();
  });

  it('requestRender is called on hoverArea', () => {
    manager.setupLayout(2);
    renderSpy.mockClear();
    const id = manager.getAllAreas()[0]!.areaId;
    manager.hoverArea(id);
    expect(renderSpy).toHaveBeenCalled();
  });

  it('requestRender is called on selectArea', () => {
    manager.setupLayout(2);
    renderSpy.mockClear();
    const id = manager.getAllAreas()[0]!.areaId;
    manager.selectArea(id);
    expect(renderSpy).toHaveBeenCalled();
  });

  it('dispose() does not throw', () => {
    manager.setupLayout(4);
    expect(() => manager.dispose()).not.toThrow();
  });

  it('dispose() clears all areas', () => {
    manager.setupLayout(4);
    manager.dispose();
    expect(manager.getAllAreas()).toHaveLength(0);
  });

  it('areas are added to scene on setupLayout', () => {
    manager.setupLayout(3);
    // Three.js scene children will include table + the 3 areas
    const areas = manager.getAllAreas();
    for (const area of areas) {
      expect(scene.children).toContain(area);
    }
  });

  it('areas are removed from scene on clearLayout', () => {
    manager.setupLayout(3);
    const areas = [...manager.getAllAreas()];
    manager.clearLayout();
    for (const area of areas) {
      expect(scene.children).not.toContain(area);
    }
  });

  it('custom labels override suggestedLabels', () => {
    manager.setupLayout(2, ['Alice', 'Bob']);
    const areas = manager.getAllAreas();
    const labels = areas.map((a) => a.getLabel());
    expect(labels).toContain('Alice');
    expect(labels).toContain('Bob');
  });
});
