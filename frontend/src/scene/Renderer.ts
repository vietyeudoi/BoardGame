/**
 * Renderer.ts — WebGLRenderer Wrapper
 * Manages the single WebGLRenderer instance for the entire app.
 */
import * as THREE from 'three';
import { Logger } from '../utils/Logger';

const logger = Logger.create('Renderer');

export class Renderer {
  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _camera: THREE.PerspectiveCamera;
  private _needsRender = false;

  constructor(container: HTMLElement) {
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(container.clientWidth, container.clientHeight);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this._renderer.domElement);

    const aspect = container.clientWidth / container.clientHeight;
    this._camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this._camera.position.set(0, 8, 10);
    this._camera.lookAt(0, 0, 0);

    logger.info('Renderer initialized');
  }

  startLoop(
    getScene: () => THREE.Scene,
    getCamera: () => THREE.Camera
  ): void {
    const tick = (): void => {
      requestAnimationFrame(tick);
      if (this._needsRender) {
        this._renderer.render(getScene(), getCamera());
        this._needsRender = false;
      }
    };
    this._needsRender = true; // First frame
    tick();
    logger.debug('Render loop started');
  }

  requestRender(): void {
    this._needsRender = true;
  }

  handleResize(): void {
    const canvas = this._renderer.domElement;
    const container = canvas.parentElement;
    const w = (container ? container.clientWidth : 0) || window.innerWidth || 800;
    const h = (container ? container.clientHeight : 0) || window.innerHeight || 600;
    if (w === 0 || h === 0) return;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  getCamera(): THREE.PerspectiveCamera {
    return this._camera;
  }

  getDomElement(): HTMLCanvasElement {
    return this._renderer.domElement;
  }

  dispose(): void {
    this._renderer.dispose();
    logger.info('Renderer disposed');
  }
}
