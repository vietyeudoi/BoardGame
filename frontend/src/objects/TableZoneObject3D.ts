/**
 * TableZoneObject3D.ts — 3D Visual representation of tabletop zones.
 * Renders distinct borders and text labels for Deck Zone, Discard Zone,
 * and Player Card Placement Zones flush on the table surface.
 * Strict TypeScript, no magic numbers, clean Three.js disposal.
 */

import * as THREE from 'three';
import { ZONE_VISUAL_CONFIG } from './TableZonesConfig';

export interface TableZoneObject3DOptions {
  id: string;
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
  label: string;
  borderColor?: number;
  borderOpacity?: number;
  fillColor?: number;
  fillOpacity?: number;
}

const DEFAULT_BORDER_OPACITY = 0.65;
const DEFAULT_FILL_OPACITY = 0.08;
const SPRITE_Y_OFFSET = 0.02;
const SPRITE_SCALE_X = 2.4;
const SPRITE_SCALE_Y = 0.6;
const SPRITE_SCALE_Z = 1.0;
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 64;
const CANVAS_FONT = 'bold 20px Arial';
const CANVAS_BG_COLOR = 'rgba(0, 0, 0, 0.45)';

export class TableZoneObject3D extends THREE.Group {
  readonly zoneId: string;
  private readonly _label: string;
  private readonly _width: number;
  private readonly _depth: number;

  private _borderLine: THREE.LineLoop | null = null;
  private _fillMesh: THREE.Mesh | null = null;
  private _labelSprite: THREE.Sprite | null = null;

  private readonly _borderMaterial: THREE.LineBasicMaterial;
  private readonly _fillMaterial: THREE.MeshBasicMaterial;
  private _labelTexture: THREE.CanvasTexture | null = null;
  private _labelMaterial: THREE.SpriteMaterial | null = null;

  constructor(opts: TableZoneObject3DOptions) {
    super();
    this.zoneId = opts.id;
    this._label = opts.label;
    this._width = opts.width;
    this._depth = opts.depth;

    this.position.set(opts.x, ZONE_VISUAL_CONFIG.SURFACE_Y, opts.z);
    this.rotation.y = opts.rotationY;

    const borderColor = opts.borderColor ?? ZONE_VISUAL_CONFIG.PLACEMENT_COLOR;
    const borderOpacity = opts.borderOpacity ?? DEFAULT_BORDER_OPACITY;
    const fillColor = opts.fillColor ?? borderColor;
    const fillOpacity = opts.fillOpacity ?? DEFAULT_FILL_OPACITY;

    this._borderMaterial = new THREE.LineBasicMaterial({
      color: borderColor,
      transparent: true,
      opacity: borderOpacity,
      depthWrite: false,
    });

    this._fillMaterial = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: fillOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this._buildBorder();
    this._buildFill();
    if (this._label) this._buildLabel(borderColor);
  }

  private _buildBorder(): void {
    const hw = this._width / 2;
    const hd = this._depth / 2;
    const geom = new THREE.BufferGeometry();
    const pts = new Float32Array([
      -hw, 0, -hd,
       hw, 0, -hd,
       hw, 0,  hd,
      -hw, 0,  hd,
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this._borderLine = new THREE.LineLoop(geom, this._borderMaterial);
    this._borderLine.renderOrder = 1;
    this.add(this._borderLine);
  }

  private _buildFill(): void {
    const geom = new THREE.PlaneGeometry(this._width, this._depth);
    this._fillMesh = new THREE.Mesh(geom, this._fillMaterial);
    this._fillMesh.rotation.x = -Math.PI / 2; // Flat on table
    this._fillMesh.renderOrder = 0;
    this.add(this._fillMesh);
  }

  private _buildLabel(textColorHex: number): void {
    this._disposeLabel();

    const canvas = this._createLabelCanvas(this._label, textColorHex);
    this._labelTexture = new THREE.CanvasTexture(canvas);
    this._labelMaterial = new THREE.SpriteMaterial({
      map: this._labelTexture,
      transparent: true,
      depthWrite: false,
    });
    this._labelSprite = new THREE.Sprite(this._labelMaterial);
    this._labelSprite.scale.set(SPRITE_SCALE_X, SPRITE_SCALE_Y, SPRITE_SCALE_Z);
    this._labelSprite.position.set(0, SPRITE_Y_OFFSET, 0);
    this._labelSprite.renderOrder = 2;
    this.add(this._labelSprite);
  }

  private _createLabelCanvas(text: string, colorHex: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = CANVAS_BG_COLOR;
    ctx.beginPath();
    ctx.roundRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8, 6);
    ctx.fill();

    const hexStr = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.font = CANVAS_FONT;
    ctx.fillStyle = hexStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    return canvas;
  }

  getLabel(): string {
    return this._label;
  }

  getWidth(): number {
    return this._width;
  }

  getDepth(): number {
    return this._depth;
  }

  private _disposeLabel(): void {
    if (this._labelSprite) {
      this.remove(this._labelSprite);
      this._labelSprite = null;
    }
    this._labelTexture?.dispose();
    this._labelTexture = null;
    this._labelMaterial?.dispose();
    this._labelMaterial = null;
  }

  dispose(): void {
    if (this._borderLine) {
      this._borderLine.geometry.dispose();
      this.remove(this._borderLine);
      this._borderLine = null;
    }
    this._borderMaterial.dispose();

    if (this._fillMesh) {
      this._fillMesh.geometry.dispose();
      this.remove(this._fillMesh);
      this._fillMesh = null;
    }
    this._fillMaterial.dispose();

    this._disposeLabel();
    this.parent?.remove(this);
  }
}

