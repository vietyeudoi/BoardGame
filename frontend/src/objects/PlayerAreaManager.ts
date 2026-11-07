/**
 * PlayerAreaManager.ts — Manages all PlayerAreaObject3D instances in the scene.
 * Handles layout setup, selection, hover state, and spatial queries.
 */
import * as THREE from 'three';
import { PlayerAreaObject3D } from './PlayerAreaObject3D';
import { LAYOUT_CONFIGS, getLayoutForShape } from './PlayerAreaConfig';
import { PLAYER_AREA_VISUAL_CONFIG } from './PlayerAreaConfig';
import { PlayerCount } from './TableShapeConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('PlayerAreaManager');

export class PlayerAreaManager {
  private readonly _areas = new Map<string, PlayerAreaObject3D>();
  private readonly _scene: THREE.Scene;
  private readonly _requestRender: () => void;
  private _playerCount = 0;
  private _visible = true;
  private _selectedAreaId: string | null = null;
  private _hoveredAreaId: string | null = null;

  constructor(scene: THREE.Scene, requestRender: () => void) {
    this._scene = scene;
    this._requestRender = requestRender;
  }

  // ─── Layout Management ────────────────────────────────────────────────────

  setupLayout(
    playerCount: PlayerCount,
    playerLabels?: string[],
    circumradius?: number
  ): void {
    this.clearLayout();

    const positions =
      circumradius !== undefined
        ? getLayoutForShape(playerCount, circumradius)
        : LAYOUT_CONFIGS[playerCount].positions;
    this._playerCount = playerCount;

    positions.forEach((pos, i) => {
      const id = `player_area_${i + 1}`;
      const label = playerLabels?.[i] ?? pos.suggestedLabel;
      const area = new PlayerAreaObject3D({
        id,
        x: pos.x,
        z: pos.z,
        rotationY: pos.rotationY,
        label,
        areaWidth: PLAYER_AREA_VISUAL_CONFIG.AREA_WIDTH,
        areaDepth: PLAYER_AREA_VISUAL_CONFIG.AREA_DEPTH,
      });
      area.visible = this._visible;
      this._areas.set(id, area);
      this._scene.add(area);
    });

    this._requestRender();
    logger.info(`Player layout set up for ${playerCount} players`);
  }

  clearLayout(): void {
    for (const area of this._areas.values()) {
      this._scene.remove(area);
      area.dispose();
    }
    this._areas.clear();
    this._selectedAreaId = null;
    this._hoveredAreaId = null;
    this._playerCount = 0;
    this._requestRender();
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getArea(areaId: string): PlayerAreaObject3D | undefined {
    return this._areas.get(areaId);
  }

  getAllAreas(): PlayerAreaObject3D[] {
    return Array.from(this._areas.values());
  }

  getPlayerCount(): number {
    return this._playerCount;
  }

  // ─── Visibility ───────────────────────────────────────────────────────────

  setAllVisible(visible: boolean): void {
    this._visible = visible;
    for (const area of this._areas.values()) {
      area.setVisible(visible);
    }
    this._requestRender();
  }

  isVisible(): boolean {
    return this._visible;
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  selectArea(areaId: string): void {
    // Deselect previous
    if (this._selectedAreaId && this._selectedAreaId !== areaId) {
      this._areas.get(this._selectedAreaId)?.setSelected(false);
    }
    const area = this._areas.get(areaId);
    if (area) {
      area.setSelected(true);
      this._selectedAreaId = areaId;
      this._requestRender();
    }
  }

  deselectAll(): void {
    if (this._selectedAreaId) {
      this._areas.get(this._selectedAreaId)?.setSelected(false);
      this._selectedAreaId = null;
      this._requestRender();
    }
  }

  getSelectedAreaId(): string | null {
    return this._selectedAreaId;
  }

  // ─── Hover ────────────────────────────────────────────────────────────────

  hoverArea(areaId: string | null): void {
    if (this._hoveredAreaId === areaId) return;

    // Clear previous hover
    if (this._hoveredAreaId) {
      this._areas.get(this._hoveredAreaId)?.setHovered(false);
    }

    this._hoveredAreaId = areaId;

    if (areaId) {
      this._areas.get(areaId)?.setHovered(true);
    }
    this._requestRender();
  }

  getHoveredAreaId(): string | null {
    return this._hoveredAreaId;
  }

  // ─── Spatial Queries ──────────────────────────────────────────────────────

  findAreaAtPoint(x: number, z: number): PlayerAreaObject3D | null {
    for (const area of this._areas.values()) {
      if (area.containsPoint(x, z)) {
        return area;
      }
    }
    return null;
  }

  /**
   * Validates that no two area bounding boxes overlap excessively.
   * Returns valid=true if all areas are non-overlapping within tolerance.
   */
  validateNoOverlap(tolerance = 0.1): { valid: boolean; conflicts: string[] } {
    const areas = this.getAllAreas();
    const conflicts: string[] = [];

    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        const a = areas[i]!;
        const b = areas[j]!;
        const bbA = a.getBoundingBox();
        const bbB = b.getBoundingBox();
        const overlapX = bbA.maxX - tolerance > bbB.minX && bbB.maxX - tolerance > bbA.minX;
        const overlapZ = bbA.maxZ - tolerance > bbB.minZ && bbB.maxZ - tolerance > bbA.minZ;
        if (overlapX && overlapZ) {
          conflicts.push(`${a.areaId} ↔ ${b.areaId}`);
        }
      }
    }

    return { valid: conflicts.length === 0, conflicts };
  }

  // ─── Dispose ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.clearLayout();
    logger.debug('PlayerAreaManager disposed');
  }
}

