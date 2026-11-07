/**
 * StackBadge.ts — 3D Stack Count Indicator (M1.3.4.3)
 * Renders a crisp, stylish bill/circle badge above a card stack indicating
 * the current number of cards, with distinct colors for selected vs neutral states.
 */
import * as THREE from 'three';
import { Logger } from '../utils/Logger';

const logger = Logger.create('StackBadge');

export class StackBadge {
  private readonly _sprite: THREE.Sprite;
  private readonly _canvas: HTMLCanvasElement | null = null;
  private readonly _ctx: CanvasRenderingContext2D | null = null;
  private readonly _texture: THREE.CanvasTexture | null = null;
  private _lastCount = 0;
  private _lastSelected = false;

  constructor(private readonly _scene: THREE.Scene) {
    try {
      this._canvas = document.createElement('canvas');
      this._canvas.width = 128;
      this._canvas.height = 128;
      this._ctx = this._canvas.getContext('2d');
    } catch {
      // Node/JSDOM environment without canvas support
    }

    if (this._canvas) {
      this._texture = new THREE.CanvasTexture(this._canvas);
      const material = new THREE.SpriteMaterial({
        map: this._texture,
        depthTest: false,
        depthWrite: false,
      });
      this._sprite = new THREE.Sprite(material);
      this._sprite.scale.set(0.65, 0.65, 1);
      this._sprite.visible = false;
      this._sprite.renderOrder = 999;
      this._scene.add(this._sprite);
    } else {
      this._sprite = new THREE.Sprite();
    }
  }

  update(count: number, topCardPosition: { x: number; y: number; z: number }, isSelected = false): void {
    if (count <= 1) {
      this.hide();
      return;
    }

    this._sprite.visible = true;
    this._sprite.position.set(
      topCardPosition.x + 0.85,
      topCardPosition.y + 0.35,
      topCardPosition.z - 1.1
    );

    if (this._ctx && this._texture && (this._lastCount !== count || this._lastSelected !== isSelected)) {
      this._lastCount = count;
      this._lastSelected = isSelected;
      this._renderCanvas(count, isSelected);
      this._texture.needsUpdate = true;
    }
  }

  private _renderCanvas(count: number, isSelected: boolean): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, 128, 128);

    ctx.save();
    // Pill circle background
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? 'rgba(20, 42, 28, 0.94)' : 'rgba(16, 24, 40, 0.92)';
    ctx.fill();

    // Border
    ctx.lineWidth = 6;
    ctx.strokeStyle = isSelected ? 'rgba(96, 210, 50, 0.95)' : 'rgba(58, 140, 240, 0.92)';
    ctx.stroke();

    // Count text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${count}`, 64, 65);
    ctx.restore();
  }

  hide(): void {
    this._sprite.visible = false;
  }

  dispose(): void {
    this.hide();
    this._scene.remove(this._sprite);
    if (this._texture) {
      this._texture.dispose();
    }
    if (this._sprite.material) {
      this._sprite.material.dispose();
    }
    logger.debug('StackBadge disposed');
  }
}

