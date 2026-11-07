/**
 * LightingManager.ts — Tabletop Lighting & Soft Shadow Setup
 * Decoupled lighting module per PROJECT_RULES.md Section A.3 & C.1.
 */
import * as THREE from 'three';
import { Logger } from '../utils/Logger';

const logger = Logger.create('LightingManager');

export class LightingManager {
  private readonly _lights: THREE.Light[] = [];

  constructor(private readonly _scene: THREE.Scene) {
    this._setupHemisphereLight();
    this._setupAmbientLight();
    this._setupKeyDirectionalLight();
    this._setupFillDirectionalLight();

    logger.info('LightingManager initialized with balanced 3D tabletop lighting');
  }

  private _setupHemisphereLight(): void {
    // Warm top ambient sky light with subtle dark floor bounce
    const hemiLight = new THREE.HemisphereLight(0xe8f0f8, 0x1a261a, 0.45);
    hemiLight.name = 'HemiLight';
    this._scene.add(hemiLight);
    this._lights.push(hemiLight);
  }

  private _setupAmbientLight(): void {
    // Soft overall baseline illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    ambientLight.name = 'AmbientLight';
    this._scene.add(ambientLight);
    this._lights.push(ambientLight);
  }

  private _setupKeyDirectionalLight(): void {
    // Main directional sunlight casting crisp, soft shadows onto the table
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 0.85);
    keyLight.name = 'KeyDirectionalLight';
    keyLight.position.set(7, 14, 8);
    keyLight.castShadow = true;

    // Optimized shadow camera bounds enclosing the full table with border
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 35.0;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.normalBias = 0.02;

    this._scene.add(keyLight);
    this._lights.push(keyLight);
  }

  private _setupFillDirectionalLight(): void {
    // Secondary soft light from opposite angle to soften dark edge crevices
    const fillLight = new THREE.DirectionalLight(0xdde8f0, 0.35);
    fillLight.name = 'FillDirectionalLight';
    fillLight.position.set(-8, 10, -7);
    fillLight.castShadow = false; // No extra shadow passes for optimal 60fps

    this._scene.add(fillLight);
    this._lights.push(fillLight);
  }

  dispose(): void {
    this._lights.forEach((light) => {
      this._scene.remove(light);
      light.dispose?.();
    });
    this._lights.length = 0;
    logger.info('LightingManager disposed');
  }
}

