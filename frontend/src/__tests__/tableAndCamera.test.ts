/**
 * tableAndCamera.test.ts — Unit tests for M1.1 Table & Orbital Camera
 * Tests table geometry, camera orbit constraints, and lighting setup.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { TableObject3D } from '../objects/TableObject3D';
import { TABLE_CONFIG } from '../objects/TableConfig';
import { CameraController } from '../scene/CameraController';
import { LightingManager } from '../scene/LightingManager';

describe('TableObject3D (M1.1)', () => {
  let table: TableObject3D;

  beforeEach(() => {
    table = new TableObject3D(4);
  });

  afterEach(() => {
    table.dispose();
  });

  it('initializes table with authoritative surface height y = 0', () => {
    expect(table.surfaceY).toBe(TABLE_CONFIG.SURFACE_Y);
    expect(table.surfaceY).toBe(0.0);
  });

  it('builds felt playing surface, rails, apron, and 4 legs without errors', () => {
    const childNames = table.children.map((c) => c.name);

    expect(childNames).toContain('Table-FeltSurface');
    expect(childNames).toContain('Table-Rail-North');
    expect(childNames).toContain('Table-Rail-South');
    expect(childNames).toContain('Table-Rail-East');
    expect(childNames).toContain('Table-Rail-West');
    expect(childNames).toContain('Table-Apron');
    expect(childNames).toContain('Table-Leg-1');
    expect(childNames).toContain('Table-Leg-2');
    expect(childNames).toContain('Table-Leg-3');
    expect(childNames).toContain('Table-Leg-4');
  });

  it('enables shadows on tabletop and rails', () => {
    const felt = table.children.find((c) => c.name === 'Table-FeltSurface') as THREE.Mesh;
    expect(felt).toBeDefined();
    expect(felt.receiveShadow).toBe(true);

    const northRail = table.children.find((c) => c.name === 'Table-Rail-North') as THREE.Mesh;
    expect(northRail).toBeDefined();
    expect(northRail.castShadow).toBe(true);
    expect(northRail.receiveShadow).toBe(true);
  });

  it('disposes table geometry and materials cleanly', () => {
    expect(() => table.dispose()).not.toThrow();
    expect(table.children.length).toBe(0);
  });
});

describe('CameraController (M1.1)', () => {
  let camera: THREE.PerspectiveCamera;
  let domElement: HTMLElement;
  let controller: CameraController;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    domElement = document.createElement('div');
    controller = new CameraController(camera, domElement, {
      minDistance: 4.0,
      maxDistance: 20.0,
      minPolarAngle: 0.1,
      maxPolarAngle: Math.PI / 2 - 0.05,
    });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('initializes camera position looking at central target', () => {
    const target = controller.getTarget();
    expect(target.x).toBe(0);
    expect(target.y).toBe(0);
    expect(target.z).toBe(0);

    // Camera must be elevated above the table (y > 0)
    expect(camera.position.y).toBeGreaterThan(0);
  });

  it('resets camera to default perspective when resetCamera is called', () => {
    // Manually mutate target
    controller.setTarget(new THREE.Vector3(5, 0, 5));
    expect(controller.getTarget().x).toBe(5);

    // Call reset
    controller.resetCamera();
    expect(controller.getTarget().x).toBe(0);
    expect(controller.getTarget().y).toBe(0);
    expect(controller.getTarget().z).toBe(0);
  });

  it('invokes onChange callback when camera moves', () => {
    let triggered = false;
    controller.onChange = () => {
      triggered = true;
    };

    controller.resetCamera();
    expect(triggered).toBe(true);
  });

  it('disposes event listeners cleanly', () => {
    expect(() => controller.dispose()).not.toThrow();
  });
});

describe('LightingManager (M1.1)', () => {
  let scene: THREE.Scene;
  let lighting: LightingManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    lighting = new LightingManager(scene);
  });

  afterEach(() => {
    lighting.dispose();
  });

  it('adds hemisphere, ambient, key directional, and fill directional lights', () => {
    const lightNames = scene.children.map((c) => c.name);
    expect(lightNames).toContain('HemiLight');
    expect(lightNames).toContain('AmbientLight');
    expect(lightNames).toContain('KeyDirectionalLight');
    expect(lightNames).toContain('FillDirectionalLight');

    const keyLight = scene.children.find((c) => c.name === 'KeyDirectionalLight') as THREE.DirectionalLight;
    expect(keyLight.castShadow).toBe(true);
    expect(keyLight.shadow.mapSize.width).toBe(2048);
  });

  it('disposes all lights cleanly from scene', () => {
    lighting.dispose();
    expect(scene.children.length).toBe(0);
  });
});

