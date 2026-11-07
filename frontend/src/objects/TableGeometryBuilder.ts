/**
 * TableGeometryBuilder.ts — Factory for generating 3D table geometries
 * Handles both rectangular and regular polygon table surfaces, mitered rails, aprons, and legs.
 * Meets PROJECT_RULES.md (SRP, strict TypeScript, no magic numbers).
 */

import * as THREE from 'three';
import { TABLE_CONFIG } from './TableConfig';
import {
  TableShapeParams,
  getPolygonVertices,
  getTableFeltVertices,
  getTableOuterRadius,
} from './TableShapeConfig';

export interface RailMeshSpec {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  rotationY: number;
  name: string;
}

export interface ApronMeshSpec {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
}

export interface LegPositionSpec {
  x: number;
  y: number;
  z: number;
}

export class TableGeometryBuilder {
  /**
   * Builds felt surface BufferGeometry.
   * Top surface is placed at y = 0 relative to geometry origin.
   */
  static buildFeltGeometry(params: TableShapeParams): {
    geometry: THREE.BufferGeometry;
    position: THREE.Vector3;
  } {
    if (params.shapeType === 'rectangle') {
      const geometry = new THREE.BoxGeometry(
        params.feltWidth,
        TABLE_CONFIG.FELT_THICKNESS,
        params.feltDepth
      );
      const position = new THREE.Vector3(
        0,
        TABLE_CONFIG.SURFACE_Y - TABLE_CONFIG.FELT_THICKNESS / 2,
        0
      );
      return { geometry, position };
    }

    // Polygon felt via ExtrudeGeometry
    const vertices = getPolygonVertices(params.sideCount, params.circumradius);
    const shape = new THREE.Shape();
    vertices.forEach((v, idx) => {
      if (idx === 0) {
        shape.moveTo(v.x, v.z);
      } else {
        shape.lineTo(v.x, v.z);
      }
    });
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: TABLE_CONFIG.FELT_THICKNESS,
      bevelEnabled: false,
    });
    // Rotate so extrusion goes downwards in Y
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();

    const position = new THREE.Vector3(0, TABLE_CONFIG.SURFACE_Y, 0);
    return { geometry, position };
  }

  /**
   * Builds rail geometry specs with exact mitered cuts at both ends.
   * Each rail segment is built from consecutive polygon vertices P1, P2.
   * Adjacent rails meet along the corner miter plane with zero gap and zero overlap.
   */
  static buildRailSpecs(params: TableShapeParams): RailMeshSpec[] {
    const railTopY = TABLE_CONFIG.SURFACE_Y + params.railLip;
    const vertices = getTableFeltVertices(params);
    const N = vertices.length;
    const W = params.railWidth;
    const H = params.railHeight;
    const miterOffset = W * Math.tan(Math.PI / N);

    const specs: RailMeshSpec[] = [];

    for (let i = 0; i < N; i++) {
      const p1 = vertices[i]!;
      const p2 = vertices[(i + 1) % N]!;

      // 1. Vector and distance between consecutive vertices
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const length = Math.hypot(dx, dz);

      // 2. Midpoint of the edge
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;

      // 3. Rotation around Y from edge vector
      // In Three.js, rotation by theta around Y transforms (1,0,0) to (cos(theta), -sin(theta)) in XZ.
      // We want (cos(theta), -sin(theta)) = (dx/length, dz/length), so theta = atan2(-dz, dx).
      const rotationY = Math.atan2(-dz, dx);

      // 4. Mitered trapezoid 2D shape in local space:
      // Inner edge along felt: from -length/2 to +length/2 at local z = 0
      // Outer edge with miter expansion: from -length/2 - miterOffset to +length/2 + miterOffset at local z = W
      const shape = new THREE.Shape();
      shape.moveTo(-length / 2, 0);
      shape.lineTo(length / 2, 0);
      shape.lineTo(length / 2 + miterOffset, W);
      shape.lineTo(-length / 2 - miterOffset, W);
      shape.closePath();

      // Extrude height downwards
      const railGeo = new THREE.ExtrudeGeometry(shape, {
        depth: H,
        bevelEnabled: false,
      });
      railGeo.rotateX(Math.PI / 2);
      railGeo.computeVertexNormals();

      // Naming convention: for rectangle (N=4), use cardinal names; for polygon, use edge indices
      let name: string;
      if (params.shapeType === 'rectangle') {
        const cardinalNames = [
          'Table-Rail-South',
          'Table-Rail-East',
          'Table-Rail-North',
          'Table-Rail-West',
        ];
        name = cardinalNames[i]!;
      } else {
        name = `Table-Rail-Edge-${i + 1}`;
      }

      specs.push({
        geometry: railGeo,
        position: new THREE.Vector3(midX, railTopY, midZ),
        rotationY,
        name,
      });
    }

    return specs;
  }

  /**
   * Builds underside apron geometry and position.
   */
  static buildApronSpec(params: TableShapeParams): ApronMeshSpec {
    const apronY =
      TABLE_CONFIG.SURFACE_Y -
      TABLE_CONFIG.FELT_THICKNESS -
      params.apronThickness / 2;

    if (params.shapeType === 'rectangle') {
      const totalWidth = params.feltWidth + 2 * params.railWidth;
      const totalDepth = params.feltDepth + 2 * params.railWidth;
      const apronGeo = new THREE.BoxGeometry(
        totalWidth,
        params.apronThickness,
        totalDepth
      );
      return {
        geometry: apronGeo,
        position: new THREE.Vector3(0, apronY, 0),
      };
    }

    // Polygon apron: extruded outer polygon matching rail outer boundary
    const N = params.sideCount;
    const rOuterApron = getTableOuterRadius(params);
    const vertices = getPolygonVertices(N, rOuterApron);

    const shape = new THREE.Shape();
    vertices.forEach((v, idx) => {
      if (idx === 0) {
        shape.moveTo(v.x, v.z);
      } else {
        shape.lineTo(v.x, v.z);
      }
    });
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: params.apronThickness,
      bevelEnabled: false,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();

    const position = new THREE.Vector3(
      0,
      TABLE_CONFIG.SURFACE_Y - TABLE_CONFIG.FELT_THICKNESS,
      0
    );
    return { geometry, position };
  }

  /**
   * Computes leg positions for rectangular table (4 legs) or polygon table (N legs).
   */
  static buildLegPositions(params: TableShapeParams): LegPositionSpec[] {
    const legY =
      TABLE_CONFIG.SURFACE_Y -
      TABLE_CONFIG.FELT_THICKNESS -
      params.apronThickness -
      params.legHeight / 2;

    if (params.shapeType === 'rectangle') {
      const totalWidth = params.feltWidth + 2 * params.railWidth;
      const totalDepth = params.feltDepth + 2 * params.railWidth;
      const xOffset = totalWidth / 2 - params.legInset;
      const zOffset = totalDepth / 2 - params.legInset;

      return [
        { x: -xOffset, y: legY, z: -zOffset },
        { x: xOffset, y: legY, z: -zOffset },
        { x: -xOffset, y: legY, z: zOffset },
        { x: xOffset, y: legY, z: zOffset },
      ];
    }

    // Polygon legs: placed inside each vertex corner
    const N = params.sideCount;
    const rLeg = Math.max(1.0, params.circumradius - params.legInset);
    const vertices = getPolygonVertices(N, rLeg);

    return vertices.map((v) => ({
      x: v.x,
      y: legY,
      z: v.z,
    }));
  }
}
