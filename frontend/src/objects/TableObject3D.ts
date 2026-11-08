/**
 * TableObject3D.ts — 3D Table Surface & Border Mesh Group
 * Single source of truth for the tabletop play area.
 * Supports dynamic polygon rebuilds (2–8 players) per M1.4.1.
 */
import * as THREE from 'three';
import { SHARED_CONFIG } from '../../../shared/constants/config';

import { TABLE_CONFIG } from './TableConfig';
import {
  PlayerCount,
  TableShapeParams,
  TableShapeType,
  getTableShape,
} from './TableShapeConfig';
import { TableGeometryBuilder } from './TableGeometryBuilder';
import { Disposer } from '../utils/Disposer';
import { Logger } from '../utils/Logger';

const logger = Logger.create('TableObject3D');

export class TableObject3D extends THREE.Group {
  private _proceduralTexture: THREE.CanvasTexture | null = null;
  private _currentParams: TableShapeParams;

  constructor(initialPlayerCount: PlayerCount = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM) {
    super();
    this.name = 'TableObject3D';
    this._currentParams = getTableShape(initialPlayerCount);

    this._buildTable(this._currentParams);

    logger.info('TableObject3D constructed successfully', {
      playerCount: this._currentParams.playerCount,
      shapeType: this._currentParams.shapeType,
      circumradius: this._currentParams.circumradius,
      surfaceY: TABLE_CONFIG.SURFACE_Y,
    });
  }

  /** Authoritative Y coordinate of the playing surface */
  get surfaceY(): number {
    return TABLE_CONFIG.SURFACE_Y;
  }

  get playerCount(): PlayerCount {
    return this._currentParams.playerCount;
  }

  get shapeType(): TableShapeType {
    return this._currentParams.shapeType;
  }

  get circumradius(): number {
    return this._currentParams.circumradius;
  }

  get currentParams(): TableShapeParams {
    return this._currentParams;
  }

  /**
   * Rebuilds the table dynamically for a new player count.
   * Disposes previous meshes and builds appropriate polygon or rectangle geometry.
   */
  rebuild(playerCount: PlayerCount): void {
    logger.info('Rebuilding table for player count', {
      from: this._currentParams.playerCount,
      to: playerCount,
    });

    this._clearTableParts();
    this._currentParams = getTableShape(playerCount);
    this._buildTable(this._currentParams);
  }

  private _clearTableParts(): void {
    // Dispose all child meshes
    while (this.children.length > 0) {
      const child = this.children[0]!;
      this.remove(child);
      Disposer.disposeObject3D(child);
    }
  }

  private _buildTable(params: TableShapeParams): void {
    this._buildFeltSurface(params);
    this._buildWoodRails(params);
    this._buildTableApron(params);
    this._buildTableLegs(params);
  }

  /**
   * Generates a subtle procedural felt bump pattern using HTML Canvas.
   * Runs client-side with zero external assets needed.
   */
  private _createFeltTexture(): THREE.CanvasTexture | null {
    if (
      typeof document === 'undefined' ||
      typeof navigator === 'undefined' ||
      navigator.userAgent?.includes('jsdom')
    ) {
      return null; // Headless / test environment fallback
    }

    try {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Base felt green
      ctx.fillStyle = '#1e5628';
      ctx.fillRect(0, 0, size, size);

      // Fine stochastic felt fiber noise
      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 16;
        data[i] = Math.min(255, Math.max(0, data[i]! + noise * 0.7));     // R
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1]! + noise));   // G
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2]! + noise * 0.6)); // B
      }
      ctx.putImageData(imgData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(12, 8);
      this._proceduralTexture = texture;
      return texture;
    } catch (e) {
      logger.warn('Failed to generate procedural felt texture, using solid material fallback', {
        error: String(e),
      });
      return null;
    }
  }

  private _buildFeltSurface(params: TableShapeParams): void {
    const { geometry, position } = TableGeometryBuilder.buildFeltGeometry(params);
    const texture = this._createFeltTexture();
    const material = new THREE.MeshStandardMaterial({
      color: TABLE_CONFIG.FELT_COLOR,
      roughness: TABLE_CONFIG.FELT_ROUGHNESS,
      metalness: TABLE_CONFIG.FELT_METALNESS,
      map: texture,
    });

    const feltMesh = new THREE.Mesh(geometry, material);
    feltMesh.name = 'Table-FeltSurface';
    feltMesh.position.copy(position);
    feltMesh.receiveShadow = true;

    this.add(feltMesh);
  }

  private _buildWoodRails(params: TableShapeParams): void {
    const specs = TableGeometryBuilder.buildRailSpecs(params);
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: TABLE_CONFIG.WOOD_COLOR,
      roughness: TABLE_CONFIG.WOOD_ROUGHNESS,
      metalness: TABLE_CONFIG.WOOD_METALNESS,
    });

    for (const spec of specs) {
      const railMesh = new THREE.Mesh(spec.geometry, woodMaterial);
      railMesh.name = spec.name;
      railMesh.position.copy(spec.position);
      railMesh.rotation.y = spec.rotationY;
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      this.add(railMesh);
    }
  }

  private _buildTableApron(params: TableShapeParams): void {
    const { geometry, position } = TableGeometryBuilder.buildApronSpec(params);
    const apronMaterial = new THREE.MeshStandardMaterial({
      color: TABLE_CONFIG.WOOD_TRIM_COLOR,
      roughness: TABLE_CONFIG.WOOD_TRIM_ROUGHNESS,
      metalness: 0.05,
    });

    const apronMesh = new THREE.Mesh(geometry, apronMaterial);
    apronMesh.name = 'Table-Apron';
    apronMesh.position.copy(position);
    apronMesh.castShadow = true;
    apronMesh.receiveShadow = true;

    this.add(apronMesh);
  }

  private _buildTableLegs(params: TableShapeParams): void {
    const legPositions = TableGeometryBuilder.buildLegPositions(params);
    const legGeo = new THREE.CylinderGeometry(
      params.legRadius * 1.1,
      params.legRadius * 0.8,
      params.legHeight,
      16
    );

    const legMaterial = new THREE.MeshStandardMaterial({
      color: TABLE_CONFIG.LEG_COLOR,
      roughness: TABLE_CONFIG.LEG_ROUGHNESS,
      metalness: 0.05,
    });

    legPositions.forEach((pos, idx) => {
      const legMesh = new THREE.Mesh(legGeo, legMaterial);
      legMesh.name = `Table-Leg-${idx + 1}`;
      legMesh.position.set(pos.x, pos.y, pos.z);
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      this.add(legMesh);
    });
  }

  /**
   * Frees all Three.js resources per PROJECT_RULES.md Section C.2.
   */
  dispose(): void {
    if (this._proceduralTexture) {
      this._proceduralTexture.dispose();
      this._proceduralTexture = null;
    }
    this._clearTableParts();
    Disposer.disposeObject3D(this);
    this.clear();
    logger.info('TableObject3D disposed');
  }
}
