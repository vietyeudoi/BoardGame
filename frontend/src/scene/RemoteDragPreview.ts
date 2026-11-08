import * as THREE from 'three';
import type { RemoteDragPreviewFrame } from '@shared/types/protocol';
import { CardObject3D } from '../objects/CardObject3D';
import { CardTextureGenerator } from '../objects/CardTextureGenerator';
import { SEAT_COLORS } from '../objects/PlayerAreaConfig';

const LIFT = 0.24;
const FOLLOW = 0.36;
const STOP_DISTANCE_SQUARED = 0.0004;
const MAX_SETTLE_MS = 210;

interface Preview {
  actor: string;
  dragId: number;
  original: CardObject3D;
  wasVisible: boolean;
  group: THREE.Group;
  target: THREE.Vector3;
  targetRotation: THREE.Quaternion;
  mesh: THREE.Mesh;
  masked: boolean;
  backMaterials?: THREE.Material[];
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  label?: THREE.Sprite;
  settlingSince?: number;
}

export class RemoteDragPreview {
  private readonly _cards = new Map<string, Preview>();
  private _frame: number | null = null;

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _findCard: (id: string) => CardObject3D | undefined,
    private readonly _requestRender: () => void
  ) {}

  isLocked(id: string): boolean {
    const card = this._cards.get(id);
    return !!card && card.settlingSince === undefined;
  }

  update(frame: RemoteDragPreviewFrame): void {
    frame.cards.forEach((position, index) => {
      const card = this._findCard(position.objectId);
      if (!card || card.isDisposed()) return;
      const id = card.cardId;
      let preview = this._cards.get(id);
      if (frame.phase === 'start') {
        if (preview) this._remove(id, preview);
        preview = this._create(card, frame, !!position.masked || card.isInHand(), index === 0);
        this._cards.set(id, preview);
      }
      if (!preview || preview.actor !== frame.playerId || preview.dragId !== frame.dragId || preview.settlingSince !== undefined) return;
      preview.target.set(position.x, Math.max(LIFT, position.y), position.z);
      if (position.rotation !== undefined) {
        preview.targetRotation.set(0, Math.sin(position.rotation / 2), 0, Math.cos(position.rotation / 2));
      }
      if (position.masked !== undefined && preview.backMaterials) {
        const masked = position.masked || preview.original.isInHand();
        if (masked !== preview.masked) {
          preview.masked = masked;
          preview.mesh.material = masked ? preview.backMaterials : preview.original.getMesh().material;
        }
      }
      if (position.faceUp !== undefined) preview.mesh.rotation.z = preview.masked || position.faceUp ? 0 : Math.PI;
    });
    this._schedule();
  }

  stop(playerId: string, dragId?: number): void {
    const now = performance.now();
    for (const preview of this._cards.values()) {
      if (preview.actor !== playerId || (dragId !== undefined && preview.dragId !== dragId)) continue;
      preview.settlingSince = now;
      preview.target.copy(preview.original.position);
    }
    this._schedule();
  }


  finishCard(cardId: string): void {
    const preview = this._cards.get(cardId);
    if (!preview) return;
    this._remove(cardId, preview);
    this._requestRender();
  }

  clear(): void {
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    for (const [id, preview] of this._cards) this._remove(id, preview);
    this._requestRender();
  }

  private _create(card: CardObject3D, frame: RemoteDragPreviewFrame, masked: boolean, showName: boolean): Preview {
    const source = card.getMesh();
    const mesh = source.clone(false);
    // Bài HAND dùng đúng chất liệu lưng ở cả hai mặt, không sao chép chất liệu mặt trước.
    const materials = Array.isArray(source.material) ? source.material : null;
    const back = materials?.[1];
    const backMaterials = back ? [back, back, materials?.[2] ?? back] : undefined;
    if (masked && backMaterials) {
      mesh.material = backMaterials;
      mesh.rotation.set(0, 0, 0);
    }
    mesh.castShadow = true;
    mesh.renderOrder = 300;
    const color = SEAT_COLORS[frame.playerIndex % SEAT_COLORS.length] ?? SEAT_COLORS[0];
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(source.geometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false })
    );
    outline.renderOrder = 301;
    mesh.add(outline);
    const group = new THREE.Group();
    group.name = 'drag-preview-' + card.cardId;
    group.position.copy(card.position);
    group.rotation.y = card.rotation.y;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(card.cardWidth, card.cardHeight),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.09, 0.014 - group.position.y, 0.12);
    group.add(shadow, mesh);
    const label = showName ? this._makeLabel(frame.playerName, color) : undefined;
    if (label) group.add(label);
    const wasVisible = card.visible;
    card.visible = false;
    this._scene.add(group);
    return { actor: frame.playerId, dragId: frame.dragId, original: card, wasVisible, group, target: group.position.clone(), targetRotation: group.quaternion.clone(), mesh, masked, backMaterials, shadow, outline, label };
  }

  private _makeLabel(name: string, color: number): THREE.Sprite | undefined {
    if (!CardTextureGenerator.isCanvasSupported()) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#161111';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32, 236);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.position.y = 0.65;
    sprite.scale.set(1.7, 0.425, 1);
    sprite.renderOrder = 302;
    return sprite;
  }

  private _schedule(): void {
    if (this._frame === null && this._cards.size) this._frame = requestAnimationFrame(this._tick);
  }

  private _tick = (now: number): void => {
    this._frame = null;
    let moving = false;
    for (const [id, preview] of this._cards) {
      if (preview.original.isDisposed()) {
        this._remove(id, preview);
        continue;
      }
      if (preview.settlingSince !== undefined) {
        preview.target.copy(preview.original.position);
        preview.group.quaternion.slerp(preview.original.quaternion, FOLLOW);
        if (now - preview.settlingSince >= MAX_SETTLE_MS) {
          this._remove(id, preview);
          continue;
        }
      }
      const turning = preview.settlingSince === undefined && 1 - Math.abs(preview.group.quaternion.dot(preview.targetRotation)) > STOP_DISTANCE_SQUARED;
      if (preview.settlingSince === undefined) {
        if (turning) preview.group.quaternion.slerp(preview.targetRotation, FOLLOW);
        else preview.group.quaternion.copy(preview.targetRotation);
      }
      const distance = preview.group.position.distanceToSquared(preview.target);
      if (distance <= STOP_DISTANCE_SQUARED) preview.group.position.copy(preview.target);
      else preview.group.position.lerp(preview.target, FOLLOW);
      preview.shadow.position.y = 0.014 - preview.group.position.y;
      moving ||= turning || distance > STOP_DISTANCE_SQUARED || preview.settlingSince !== undefined;
    }
    this._requestRender();
    if (moving) this._schedule();
  };

  private _remove(id: string, preview: Preview): void {
    this._cards.delete(id);
    preview.original.visible = preview.wasVisible;
    preview.group.removeFromParent();
    preview.shadow.geometry.dispose();
    preview.shadow.material.dispose();
    preview.outline.geometry.dispose();
    preview.outline.material.dispose();
    preview.label?.material.map?.dispose();
    preview.label?.material.dispose();
  }
}
