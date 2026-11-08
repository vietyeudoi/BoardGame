import * as THREE from 'three';
import { getDefaultSeatPlacement } from '@shared/constants/config';
import { TABLE_ROLL, tableRollLabel, type DieFace, type TableRollEvent, type TableRollOutcome } from '@shared/types/tableRoll';

const DIE_SIZE = 0.95;
const COIN_RADIUS = 0.62;
const COIN_HEIGHT = 0.15;
const COIN_MARKS = { heads: 'N', tails: 'S' } as const;

// Thứ tự vật liệu của BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
export const DIE_SIDES = [3, 4, 1, 6, 2, 5] as const;
const UP = new THREE.Vector3(0, 1, 0);
const NORMALS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), UP,
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const COIN_AXIS = new THREE.Vector3(1, 0, 0);
const DIE_AXIS = new THREE.Vector3(0.83, 0.43, 0.35).normalize();
const CORNER_PIPS = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
export const DIE_PIPS = {
  1: [[0, 0]],
  2: CORNER_PIPS.slice(0, 2),
  3: [...CORNER_PIPS.slice(0, 2), [0, 0]],
  4: CORNER_PIPS,
  5: [...CORNER_PIPS, [0, 0]],
  6: [...CORNER_PIPS, [-1, 0], [1, 0]],
} satisfies Record<DieFace, number[][]>;

export function rollLandingRotation(roll: TableRollOutcome): THREE.Quaternion {
  if (roll.kind === 'coin') return new THREE.Quaternion().setFromAxisAngle(COIN_AXIS, roll.result === 'heads' ? 0 : Math.PI);
  return new THREE.Quaternion().setFromUnitVectors(NORMALS[DIE_SIDES.indexOf(roll.result)]!, UP);
}

function makeTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dieMaterial(face: DieFace): THREE.MeshStandardMaterial {
  const map = makeTexture(128, 128, ctx => {
    ctx.fillStyle = '#bdafa0';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#fff3dc';
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 120, 13);
    ctx.fill();
    ctx.fillStyle = face === 1 ? '#be2532' : '#202433';
    for (const [x, y] of DIE_PIPS[face]) {
      ctx.beginPath();
      ctx.arc(64 + x! * 32, 64 + y! * 32, face === 1 ? 14 : 9, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.5 });
}

function coinMaterial(face: keyof typeof COIN_MARKS): THREE.MeshStandardMaterial {
  const map = makeTexture(128, 128, ctx => {
    ctx.fillStyle = face === 'heads' ? '#f5c35a' : '#d9e7f3';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = face === 'heads' ? '#8f4b19' : '#394e76';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 68px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(COIN_MARKS[face], 64, 67);
  });
  // UV hai nắp của CylinderGeometry ngược dấu nhau; xoay chữ về phía ghế.
  map.center.set(0.5, 0.5);
  map.rotation = face === 'heads' ? Math.PI / 2 : -Math.PI / 2;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.45 });
}

function makeLabel(name: string, result: string): THREE.Sprite {
  const map = makeTexture(384, 128, ctx => {
    ctx.fillStyle = '#172033';
    ctx.beginPath();
    ctx.roundRect(2, 2, 380, 124, 24);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 33px Arial, sans-serif';
    ctx.fillText(name, 192, 42, 352);
    ctx.fillStyle = '#ffe097';
    ctx.font = 'bold 55px Arial, sans-serif';
    ctx.fillText(result, 192, 105, 352);
  });
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
  label.scale.set(2.65, 0.88, 1);
  // Neo theo mép trái của nhãn để không che mặt kết quả ở các góc camera.
  label.center.x = -0.32;
  label.position.y = 0.8;
  return label;
}

interface Effect {
  id: string;
  start: number;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
  label: THREE.Sprite;
  target: THREE.Quaternion;
  coin: boolean;
  settled: boolean;
  reduced: boolean;
  onResult: () => void;
}

export class TableRollEffects {
  private readonly _effects = new Map<string, Effect>();
  private readonly _spin = new THREE.Quaternion();
  private _frame?: number;
  private _assets?: {
    dice: { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] };
    coin: { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] };
  };

  constructor(
    private readonly _surfaceY: number,
    private readonly _add: (id: string, group: THREE.Group) => void,
    private readonly _remove: (id: string) => void,
    private readonly _requestRender: () => void,
  ) {}

  show({ roll, sentAt }: TableRollEvent, onResult: () => void): void {
    if (this._effects.has(roll.id)) return;
    if (roll.replacesId) this._clearEffect(roll.replacesId);
    if (this._effects.size >= TABLE_ROLL.maxVisible) {
      const oldest = this._effects.keys().next().value;
      if (oldest) this._clearEffect(oldest);
    }

    this._assets ??= {
      dice: { geometry: new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE), materials: DIE_SIDES.map(dieMaterial) },
      coin: {
        geometry: new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, 48),
        materials: [new THREE.MeshStandardMaterial({ color: '#bb8035' }), coinMaterial('heads'), coinMaterial('tails')],
      },
    };
    const coin = roll.kind === 'coin';
    const asset = this._assets[roll.kind];
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(asset.geometry, asset.materials.map(material => material.clone()));
    const label = makeLabel(roll.playerName, tableRollLabel(roll));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    // Dùng tuổi của lượt tung lúc gửi và đồng hồ đơn điệu của tab, tránh lệch giờ hệ thống.
    const age = Math.max(0, sentAt - roll.startedAt, reduced ? TABLE_ROLL.animationMs : 0);
    const effect: Effect = {
      id: roll.id, start: performance.now() - age, group, mesh, label,
      target: rollLandingRotation(roll), coin, reduced, settled: false, onResult,
    };
    group.position.set(roll.x, this._surfaceY, roll.z);
    group.rotation.y = getDefaultSeatPlacement(roll.seat).rotationY;
    group.add(mesh, label);
    this._effects.set(roll.id, effect);
    this._pose(effect, age);
    this._add('table-roll:' + roll.id, group);
    this._frame ??= requestAnimationFrame(this._tick);
  }

  private _pose(effect: Effect, age: number): void {
    const { animationMs, holdMs, fadeMs } = TABLE_ROLL;
    const { mesh, label, coin, target } = effect;
    const t = Math.max(0, Math.min(1, age / animationMs));
    const airborne = Math.min(1, t / 0.88);
    const bounce = Math.max(0, (t - 0.88) / 0.12);
    const progress = 1 - (1 - airborne) ** 2;
    const turns = coin ? 4 : 2;
    const lift = (coin ? 2.35 : 1.45) * Math.sin(Math.PI * airborne) + 0.15 * Math.sin(Math.PI * bounce);
    this._spin.setFromAxisAngle(coin ? COIN_AXIS : DIE_AXIS, turns * 2 * Math.PI * progress);
    mesh.quaternion.copy(target).multiply(this._spin);
    mesh.position.y = (coin ? COIN_HEIGHT : DIE_SIZE) / 2 + lift + 0.015;
    mesh.position.z = -0.48 * (1 - progress);
    label.visible = t >= 1;
    if (label.visible && !effect.settled) {
      effect.settled = true;
      effect.onResult();
    }
    const opacity = 1 - Math.max(0, (age - animationMs - holdMs) / fadeMs);
    label.material.opacity = opacity;
    if (opacity < 1) {
      for (const material of mesh.material) {
        material.transparent = true;
        material.depthWrite = false;
        material.opacity = opacity;
      }
    }
  }

  private readonly _tick = (now: number): void => {
    this._frame = undefined;
    for (const effect of this._effects.values()) {
      const age = now - effect.start;
      const lifetime = TABLE_ROLL.animationMs + TABLE_ROLL.holdMs + (effect.reduced ? 0 : TABLE_ROLL.fadeMs);
      if (age >= lifetime) this._clearEffect(effect.id);
      else this._pose(effect, age);
    }
    this._requestRender();
    if (this._effects.size) this._frame = requestAnimationFrame(this._tick);
  };

  private _clearEffect(id: string): void {
    const effect = this._effects.get(id);
    if (!effect) return;
    this._effects.delete(id);
    this._remove('table-roll:' + id);
    effect.mesh.material.forEach(material => material.dispose());
    effect.label.material.map?.dispose();
    effect.label.material.dispose();
  }

  clear(): void {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    for (const id of this._effects.keys()) this._clearEffect(id);
  }

  dispose(): void {
    this.clear();
    if (!this._assets) return;
    for (const asset of Object.values(this._assets)) {
      asset.geometry.dispose();
      for (const material of asset.materials) {
        material.map?.dispose();
        material.dispose();
      }
    }
    this._assets = undefined;
  }
}
