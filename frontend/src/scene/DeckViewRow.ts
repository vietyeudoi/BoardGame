import * as THREE from 'three';
import { getDefaultSeatPlacement } from '@shared/constants/config';
import type { DeckViewState } from '@shared/types/protocol';
import { CardTransferAnimator, type CardSlotTransform } from '../animation/CardTransferAnimator';
import { CARD_CONFIG } from '../objects/CardConfig';
import { CardObject3D } from '../objects/CardObject3D';
import { CardTextureGenerator } from '../objects/CardTextureGenerator';
import { getCardTitle } from '../objects/CardTypeHelper';

const ROW_WIDTH = 11;
const CARD_SCALE = 0.53;
const ROW_Y = 0.2;
const LABEL_HEIGHT = 0.32;
const DRAG_HEIGHT = 0.75;
const DRAG_THRESHOLD_PX = 5;
export const DECK_VIEW_PREFIX = 'deck-view:';

interface RowCard {
  card: CardObject3D;
  label: THREE.Sprite;
  index: number;
  slot?: CardSlotTransform;
}

export class DeckViewRow {
  private readonly _events = new AbortController();
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_HEIGHT);
  private readonly _dragPosition = new THREE.Vector3();
  private readonly _pressPoint = new THREE.Vector2();
  private _dragging = false;
  private readonly _cards = new Map<number, RowCard>();
  private readonly _returning = new Set<RowCard>();
  private _state: DeckViewState | null = null;
  private _local = false;
  private _name?: THREE.Sprite;
  private _pressed?: number;
  private _selected?: number;
  onOrder?: (order: number[]) => void;

  constructor(
    private readonly _canvas: HTMLElement,
    private readonly _camera: THREE.Camera,
    private readonly _animator: CardTransferAnimator,
    private readonly _add: (id: string, object: THREE.Object3D) => void,
    private readonly _remove: (id: string) => void,
    private readonly _requestRender: () => void,
  ) {
    const options = { capture: true, signal: this._events.signal };
    _canvas.addEventListener('mousedown', this._onDown, options);
    window.addEventListener('mousemove', this._onMove, options);
    window.addEventListener('mouseup', this._onUp, options);
    window.addEventListener('blur', () => this._releaseDrag(), options);
  }

  sync(state: DeckViewState | null, localId: string | null, deckPosition?: THREE.Vector3): void {
    if (!state) {
      this._return(deckPosition);
      return;
    }
    if (this._state?.id !== state.id) this.clear();
    this._state = state;
    this._local = state.viewerId === localId;
    const seat = getDefaultSeatPlacement(state.seat);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), seat.rotationY);
    const tangent = new THREE.Vector3(Math.cos(seat.rotationY), 0, -Math.sin(seat.rotationY));
    const center = new THREE.Vector3(seat.x * 0.87, ROW_Y, seat.z * 0.87);
    if (!this._name && !this._local) {
      this._name = this._label(state.viewerName + (state.mode === 'alter' ? ' đang xếp bài' : ' đang xem bài'), 3.7);
      this._name.position.set(center.x - Math.sin(seat.rotationY) * 1.7, ROW_Y + LABEL_HEIGHT,
        center.z - Math.cos(seat.rotationY) * 1.7);
      this._add(DECK_VIEW_PREFIX + 'name', this._name);
    }
    const pitch = Math.min(CARD_CONFIG.DEFAULT_WIDTH * CARD_SCALE + 0.15, ROW_WIDTH / state.cards.length);
    state.cards.forEach(({ token, cardType, faceImage }, index) => {
      let entry = this._cards.get(token);
      if (entry?.index === index) return;
      if (!entry) {
        const id = DECK_VIEW_PREFIX + state.id + ':' + token;
        // Mặt bài riêng đã có trong bảng 2D, hàng 3D chỉ giúp theo dõi thứ tự.
        const face = this._local ? undefined : cardType;
        const card = new CardObject3D({ id, cardType: face, faceImage: face ? faceImage : undefined, title: getCardTitle(face), faceUp: Boolean(face) });
        card.setMasked(!face);
        card.position.copy(deckPosition ?? center);
        card.scale.setScalar(0.58);
        const label = this._label('', 0.54);
        label.position.set(0, LABEL_HEIGHT, 1.47);
        card.add(label);
        entry = { card, label, index };
        this._cards.set(token, entry);
        this._add(id, card);
      }
      entry.index = index;
      this._paintLabel(entry.label, String(index + 1), this._selected === token);
      const position = center.clone().addScaledVector(tangent, (index - (state.cards.length - 1) / 2) * pitch);
      position.y += index * 0.009;
      entry.card.setLayerIndex(400 + index);
      entry.slot = { position, quaternion: rotation, scale: new THREE.Vector3().setScalar(CARD_SCALE) };
      this._moveToSlot(entry);
    });
    this._requestRender();
  }

  private _moveToSlot(entry: RowCard): void {
    const target = entry.slot;
    if (target) this._animator.start({ card: entry.card, getTarget: () => target });
  }

  private _setRay(event: MouseEvent): boolean {
    const rect = this._canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this._ndc.set((event.clientX - rect.left) * 2 / rect.width - 1, 1 - (event.clientY - rect.top) * 2 / rect.height);
    this._ray.setFromCamera(this._ndc, this._camera);
    return Math.abs(this._ndc.x) <= 1 && Math.abs(this._ndc.y) <= 1;
  }

  hitsAt(event: MouseEvent): boolean {
    return this._state !== null && this._pick(event) !== undefined;
  }

  private _pick(event: MouseEvent, exclude?: number): number | undefined {
    if (!this._setRay(event)) return;
    const entries = [...this._cards.entries()].filter(([token]) => token !== exclude);
    const hit = this._ray.intersectObjects(entries.map(([, entry]) => entry.card.getMesh()), false)[0];
    return entries.find(([, entry]) => entry.card.getMesh() === hit?.object)?.[0];
  }

  private _onDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !this._local || this._state?.mode !== 'alter') return;
    this._pressed = this._pick(event);
    if (this._pressed !== undefined) {
      this._pressPoint.set(event.clientX, event.clientY);
      event.stopImmediatePropagation();
    }
  };

  private _onMove = (event: MouseEvent): void => {
    if (this._pressed === undefined || !this._setRay(event)) return;
    const entry = this._cards.get(this._pressed);
    if (!entry || !this._ray.ray.intersectPlane(this._dragPlane, this._dragPosition)) return;
    if (!this._dragging) {
      if (Math.hypot(event.clientX - this._pressPoint.x, event.clientY - this._pressPoint.y) < DRAG_THRESHOLD_PX) return;
      this._animator.cancel(entry.card.cardId, false);
      this._dragging = true;
    }
    entry.card.position.copy(this._dragPosition);
    this._requestRender();
    event.stopImmediatePropagation();
  };

  private _releaseDrag(): void {
    const entry = this._pressed === undefined ? undefined : this._cards.get(this._pressed);
    if (this._dragging && entry) this._moveToSlot(entry);
    this._dragging = false;
    this._pressed = undefined;
  }

  private _onUp = (event: MouseEvent): void => {
    const source = this._pressed;
    const dragging = this._dragging;
    this._releaseDrag();
    if (source === undefined || !this._state) return;
    event.stopImmediatePropagation();
    const target = this._pick(event, dragging ? source : undefined);
    if (target === undefined) return;
    const from = source !== target ? source : this._selected;
    if (from === undefined || from === target) {
      this._setSelection(from === target ? undefined : target);
      return;
    }
    const order = this._state.cards.map(card => card.token);
    const a = order.indexOf(from);
    const b = order.indexOf(target);
    // Kéo sang vị trí mới dịch nhóm ở giữa. Hai lần nhấn thì hoán đổi.
    if (source !== target) order.splice(b, 0, ...order.splice(a, 1));
    else [order[a], order[b]] = [order[b]!, order[a]!];
    this._setSelection(undefined);
    this.onOrder?.(order);
  };

  private _setSelection(token?: number): void {
    this._selected = token;
    for (const [id, entry] of this._cards) this._paintLabel(entry.label, String(entry.index + 1), id === token);
    this._requestRender();
  }

  private _label(text: string, width: number): THREE.Sprite {
    const material = new THREE.SpriteMaterial({ depthTest: false });
    const label = new THREE.Sprite(material);
    if (CardTextureGenerator.isCanvasSupported()) {
      const canvas = document.createElement('canvas');
      canvas.width = width > 1 ? 512 : 96;
      canvas.height = 80;
      material.map = new THREE.CanvasTexture(canvas);
      material.map.colorSpace = THREE.SRGBColorSpace;
    }
    label.scale.set(width, LABEL_HEIGHT, 1);
    label.renderOrder = 600;
    this._paintLabel(label, text);
    return label;
  }

  private _paintLabel(label: THREE.Sprite, text: string, selected = false): void {
    const map = label.material.map;
    if (!map) return;
    const canvas = map.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = selected ? '#1d4ed8' : '#171923';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 8);
    map.needsUpdate = true;
  }

  private _removeName(): void {
    if (!this._name) return;
    this._remove(DECK_VIEW_PREFIX + 'name');
    this._name.material.map?.dispose();
    this._name.material.dispose();
    this._name = undefined;
  }

  private _disposeCard(entry: RowCard): void {
    this._animator.cancel(entry.card.cardId, false);
    entry.label.material.map?.dispose();
    entry.label.material.dispose();
    this._remove(entry.card.cardId);
    this._returning.delete(entry);
  }

  private _return(deckPosition?: THREE.Vector3): void {
    if (!this._state) return;
    this._state = null;
    this._dragging = false;
    this._pressed = this._selected = undefined;
    this._removeName();
    for (const entry of this._cards.values()) {
      if (!deckPosition) {
        this._disposeCard(entry);
        continue;
      }
      // Hạ lần lượt theo thứ tự hàng hiện tại trước khi hủy mô hình xem.
      this._returning.add(entry);
      const target = { position: deckPosition.clone(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3().setScalar(0.58) };
      this._animator.start({
        card: entry.card, getTarget: () => target, durationMs: 450 + Math.min(entry.index, 10) * 18,
        onComplete: () => this._disposeCard(entry),
      });
    }
    this._cards.clear();
    this._requestRender();
  }

  clear(): void {
    this._return();
    for (const entry of this._returning) this._disposeCard(entry);
  }

  dispose(): void {
    this._events.abort();
    this.clear();
  }
}
