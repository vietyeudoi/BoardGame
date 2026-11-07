/**
 * CardTransferAnimator.ts — Authoritative card transfer animation (M1.7.4)
 *
 * Single responsibility: move one card from its current world transform to a
 * dynamically resolved destination transform with a continuous ease-in-out
 * trajectory. No hand layout or drag controller may write the position of a
 * card while it is owned by this animator.
 */

import * as THREE from 'three';
import { CardObject3D } from '../objects/CardObject3D';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CardTransferAnimator');

/** Transfer animation duration bounds mandated by M1.7.4 (450–650 ms). */
export const TRANSFER_DURATION_MIN_MS = 450;
export const TRANSFER_DURATION_MAX_MS = 650;
export const TRANSFER_DURATION_DEFAULT_MS = 520;

export interface CardSlotTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  layerIndex?: number;
}

export interface CardTransferOptions {
  card: CardObject3D;
  /** Resolved every frame so the card can follow moving hand layouts. */
  getTarget: () => CardSlotTransform;
  onComplete?: () => void;
  /** Clamped to [TRANSFER_DURATION_MIN_MS, TRANSFER_DURATION_MAX_MS]. */
  durationMs?: number;
}

interface ActiveTransfer {
  card: CardObject3D;
  getTarget: () => CardSlotTransform;
  onComplete?: () => void;
  durationMs: number;
  startTime: number;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  framePending: boolean;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function clampDuration(durationMs?: number): number {
  if (!Number.isFinite(durationMs)) return TRANSFER_DURATION_DEFAULT_MS;
  return Math.max(
    TRANSFER_DURATION_MIN_MS,
    Math.min(TRANSFER_DURATION_MAX_MS, durationMs as number)
  );
}

export class CardTransferAnimator {
  private readonly _active = new Map<string, ActiveTransfer>();

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _requestRender: () => void
  ) {}

  isAnimating(cardId: string): boolean {
    return this._active.has(cardId);
  }

  getActiveCount(): number {
    return this._active.size;
  }

  /**
   * Detaches the card to the scene root preserving its exact world transform,
   * then animates it to the destination provided by `getTarget`.
   */
  start(options: CardTransferOptions): void {
    const { card } = options;
    if (card.isDisposed()) return;

    // A newer transfer supersedes an unfinished one for the same card.
    this.cancel(card.cardId, false);

    // Preserve world transform when leaving a nested parent.
    card.updateWorldMatrix(true, false);
    const startPosition = new THREE.Vector3();
    const startQuaternion = new THREE.Quaternion();
    const startScale = new THREE.Vector3();
    card.getWorldPosition(startPosition);
    card.getWorldQuaternion(startQuaternion);
    card.getWorldScale(startScale);

    if (card.parent && card.parent !== this._scene) {
      this._scene.attach(card);
    } else if (!card.parent) {
      this._scene.add(card);
    }

    card.setLayoutControlled(true);
    card.position.copy(startPosition);
    card.quaternion.copy(startQuaternion);
    card.scale.copy(startScale);

    const active: ActiveTransfer = {
      card,
      getTarget: options.getTarget,
      onComplete: options.onComplete,
      durationMs: clampDuration(options.durationMs),
      startTime: now(),
      startPosition: startPosition.clone(),
      startQuaternion: startQuaternion.clone(),
      startScale: startScale.clone(),
      framePending: false,
    };

    this._active.set(card.cardId, active);
    this._scheduleFrame(active);

    // Headless/test environments may not provide requestAnimationFrame.
    if (typeof requestAnimationFrame === 'undefined') {
      this.flush();
    }
  }

  /** Cancels a transfer without completing it. Optionally snaps to the target. */
  cancel(cardId: string, snapToTarget = true): void {
    const active = this._active.get(cardId);
    if (!active) return;
    this._active.delete(cardId);
    if (snapToTarget && !active.card.isDisposed()) {
      this._applyTarget(active, active.getTarget(), 1);
    }
    active.card.setLayoutControlled(false);
    this._requestRender();
  }

  /** Completes every in-flight transfer immediately. Used by tests and teardown. */
  flush(): void {
    const transfers = Array.from(this._active.values());
    for (const active of transfers) {
      if (!this._active.has(active.card.cardId)) continue;
      this._active.delete(active.card.cardId);
      this._complete(active);
    }
    this._requestRender();
  }

  /** Advances animations using the current clock; exposed for deterministic tests. */
  updateNow(): void {
    const current = now();
    for (const active of Array.from(this._active.values())) {
      this._advance(active, current);
    }
    this._requestRender();
  }

  dispose(): void {
    for (const active of this._active.values()) {
      active.card.setLayoutControlled(false);
    }
    this._active.clear();
  }

  private _scheduleFrame(active: ActiveTransfer): void {
    if (active.framePending) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    active.framePending = true;
    requestAnimationFrame(() => {
      active.framePending = false;
      this._advance(active, now());
    });
  }

  private _advance(active: ActiveTransfer, current: number): void {
    if (!this._active.has(active.card.cardId)) return;
    if (active.card.isDisposed()) {
      this._active.delete(active.card.cardId);
      return;
    }

    const elapsed = current - active.startTime;
    const rawT = active.durationMs <= 0 ? 1 : Math.min(elapsed / active.durationMs, 1);
    const eased = easeInOutCubic(rawT);
    const target = active.getTarget();
    this._applyTarget(active, target, eased);

    if (rawT >= 1) {
      this._active.delete(active.card.cardId);
      this._complete(active);
    } else {
      this._scheduleFrame(active);
    }
    this._requestRender();
  }

  private _applyTarget(active: ActiveTransfer, target: CardSlotTransform, t: number): void {
    const card = active.card;
    if (card.isDisposed()) return;
    card.position.lerpVectors(active.startPosition, target.position, t);
    card.quaternion.slerpQuaternions(active.startQuaternion, target.quaternion, t);
    card.scale.lerpVectors(active.startScale, target.scale, t);
  }

  private _complete(active: ActiveTransfer): void {
    const card = active.card;
    if (!card.isDisposed()) {
      const target = active.getTarget();
      card.position.copy(target.position);
      card.quaternion.copy(target.quaternion);
      card.scale.copy(target.scale);
    }
    card.setLayoutControlled(false);
    try {
      active.onComplete?.();
    } catch (error) {
      logger.error('Card transfer completion callback failed', {
        cardId: card.cardId,
        error: String(error),
      });
    }
    this._requestRender();
  }
}
