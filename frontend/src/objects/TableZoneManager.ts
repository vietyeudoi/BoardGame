/**
 * TableZoneManager.ts — Manages tabletop functional zones.
 * Coordinates visual indicators and spatial queries for Deck Zone,
 * Discard Pile Zone, and Player Card Placement Zones.
 * Strict TypeScript, no magic numbers, clean Three.js disposal.
 */

import * as THREE from 'three';
import { PlayerCount } from './TableShapeConfig';
import {
  TableZonesLayout,
  ZoneRect,
  ZONE_VISUAL_CONFIG,
  computeTableZones,
} from './TableZonesConfig';
import { TableZoneObject3D } from './TableZoneObject3D';
import { Logger } from '../utils/Logger';

const logger = Logger.create('TableZoneManager');

export class TableZoneManager {
  private readonly _scene: THREE.Scene;
  private readonly _requestRender: () => void;
  private readonly _zones = new Map<string, TableZoneObject3D>();
  private _currentLayout: TableZonesLayout | null = null;
  private _visible = true;

  constructor(scene: THREE.Scene, requestRender: () => void) {
    this._scene = scene;
    this._requestRender = requestRender;
  }

  // ─── Setup & Teardown ───────────────────────────────────────────────────────

  setupZones(playerCount: PlayerCount, customCircumradius?: number): TableZonesLayout {
    this.clearZones();

    const layout = computeTableZones(playerCount, customCircumradius);
    this._currentLayout = layout;

    // 1. Deck Zone
    const deckObj = new TableZoneObject3D({
      id: layout.deckZone.id,
      x: layout.deckZone.x,
      z: layout.deckZone.z,
      rotationY: layout.deckZone.rotationY,
      width: layout.deckZone.width,
      depth: layout.deckZone.depth,
      label: layout.deckZone.label,
      borderColor: ZONE_VISUAL_CONFIG.DECK_COLOR,
      fillColor: ZONE_VISUAL_CONFIG.DECK_COLOR,
    });
    deckObj.visible = this._visible;
    this._zones.set(deckObj.zoneId, deckObj);
    this._scene.add(deckObj);

    // 2. Discard Zone
    const discardObj = new TableZoneObject3D({
      id: layout.discardZone.id,
      x: layout.discardZone.x,
      z: layout.discardZone.z,
      rotationY: layout.discardZone.rotationY,
      width: layout.discardZone.width,
      depth: layout.discardZone.depth,
      label: layout.discardZone.label,
      borderColor: ZONE_VISUAL_CONFIG.DISCARD_COLOR,
      fillColor: ZONE_VISUAL_CONFIG.DISCARD_COLOR,
    });
    discardObj.visible = this._visible;
    this._zones.set(discardObj.zoneId, discardObj);
    this._scene.add(discardObj);

    // Placement zones remain in the layout for drag/drop queries, but their
    // distracting visual markers are intentionally not rendered.

    this._requestRender();
    logger.info(`Table zones configured for ${playerCount} players`);
    return layout;
  }

  clearZones(): void {
    for (const zone of this._zones.values()) {
      this._scene.remove(zone);
      zone.dispose();
    }
    this._zones.clear();
    this._currentLayout = null;
    this._requestRender();
  }

  // ─── Spatial & Data Queries ─────────────────────────────────────────────────

  getDeckPosition(): THREE.Vector3 {
    if (!this._currentLayout) {
      return new THREE.Vector3(-2.4, ZONE_VISUAL_CONFIG.SURFACE_Y, 0);
    }
    return new THREE.Vector3(
      this._currentLayout.deckZone.x,
      ZONE_VISUAL_CONFIG.SURFACE_Y,
      this._currentLayout.deckZone.z
    );
  }

  getDiscardPosition(): THREE.Vector3 {
    if (!this._currentLayout) {
      return new THREE.Vector3(2.4, ZONE_VISUAL_CONFIG.SURFACE_Y, 0);
    }
    return new THREE.Vector3(
      this._currentLayout.discardZone.x,
      ZONE_VISUAL_CONFIG.SURFACE_Y,
      this._currentLayout.discardZone.z
    );
  }

  getPlacementZone(playerIndex: number): ZoneRect | undefined {
    return this._currentLayout?.cardPlacementZones[playerIndex];
  }

  getAllPlacementZones(): ZoneRect[] {
    return this._currentLayout ? [...this._currentLayout.cardPlacementZones] : [];
  }

  getCurrentLayout(): TableZonesLayout | null {
    return this._currentLayout;
  }

  // ─── Visibility ─────────────────────────────────────────────────────────────

  setAllVisible(visible: boolean): void {
    this._visible = visible;
    for (const zone of this._zones.values()) {
      zone.visible = visible;
    }
    this._requestRender();
  }

  isVisible(): boolean {
    return this._visible;
  }

  // ─── Disposal ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.clearZones();
    logger.debug('TableZoneManager disposed');
  }
}

