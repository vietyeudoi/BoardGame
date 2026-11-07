/**
 * opponentHandInteraction174.test.ts — M1.7.4
 *
 * Verifies:
 * 1. Single-writer card transfer animation (detach, continuous travel, exact landing).
 * 2. Layout and drag code never fight the transfer animator.
 * 3. Opponent hand hover/select/flip/drag interaction while content stays masked.
 * 4. Server rejection restores an optimistic opponent-hand drag to its original slot.
 * 5. Duplicate/stale transfer sequences are ignored.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      private readonly _canvas: HTMLCanvasElement;
      private readonly _camera: THREE.PerspectiveCamera;

      constructor(container: HTMLElement) {
        this._canvas = document.createElement('canvas');
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      }

      getCamera() {
        return this._camera;
      }
      getDomElement() {
        return this._canvas;
      }
      startLoop() {}
      stopLoop() {}
      requestRender() {}
      handleResize() {}
      dispose() {
        this._canvas.remove();
      }
    },
  };
});

import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { CardTransferAnimator } from '../animation/CardTransferAnimator';
import {
  TRANSFER_DURATION_DEFAULT_MS,
  TRANSFER_DURATION_MAX_MS,
  TRANSFER_DURATION_MIN_MS,
} from '../animation/CardTransferAnimator';

describe('M1.7.4 — CardTransferAnimator (single writer)', () => {
  it('keeps the mandated duration bounds and default', () => {
    expect(TRANSFER_DURATION_MIN_MS).toBeGreaterThanOrEqual(450);
    expect(TRANSFER_DURATION_MAX_MS).toBeLessThanOrEqual(650);
    expect(TRANSFER_DURATION_DEFAULT_MS).toBeGreaterThanOrEqual(TRANSFER_DURATION_MIN_MS);
    expect(TRANSFER_DURATION_DEFAULT_MS).toBeLessThanOrEqual(TRANSFER_DURATION_MAX_MS);
  });

  it('starts from the preserved world transform and lands exactly on the target', () => {
    const scene = new THREE.Scene();
    const animator = new CardTransferAnimator(scene, () => {});
    const card = new CardObject3D({ id: 'anim-card', title: 'Anim' });
    scene.add(card);
    card.position.set(3, 1, -2);
    card.scale.set(1, 1, 1);

    const target = {
      position: new THREE.Vector3(-4, 0.5, 6),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 3, 0)),
      scale: new THREE.Vector3(1.2, 1.2, 1.2),
    };

    animator.start({ card, getTarget: () => target });

    // Detach must preserve the starting world transform — no jump to target.
    expect(card.position.x).toBeCloseTo(3, 6);
    expect(card.position.y).toBeCloseTo(1, 6);
    expect(card.position.z).toBeCloseTo(-2, 6);
    expect(card.isLayoutControlled()).toBe(true);

    animator.flush();

    expect(card.position.distanceTo(target.position)).toBeLessThan(1e-6);
    expect(card.scale.distanceTo(target.scale)).toBeLessThan(1e-6);
    expect(card.quaternion.angleTo(target.quaternion)).toBeLessThan(1e-6);
    expect(card.isLayoutControlled()).toBe(false);
    expect(animator.getActiveCount()).toBe(0);

    animator.dispose();
  });

  it('supersedes an older transfer for the same card instead of running two writers', () => {
    const scene = new THREE.Scene();
    const animator = new CardTransferAnimator(scene, () => {});
    const card = new CardObject3D({ id: 'anim-card-2', title: 'Anim 2' });
    scene.add(card);

    const first = {
      position: new THREE.Vector3(10, 0, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
    };
    const second = {
      position: new THREE.Vector3(-10, 0, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
    };

    animator.start({ card, getTarget: () => first });
    animator.start({ card, getTarget: () => second });
    expect(animator.getActiveCount()).toBe(1);

    animator.flush();
    expect(card.position.x).toBeCloseTo(-10, 6);

    animator.dispose();
  });
});

describe('M1.7.4 — SceneManager transfer, rejection & opponent hand interaction', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setPlayerPerspective(0, 4, false);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  it('animates into the exact destination slot without the hand layout fighting it', () => {
    const card = sceneManager.syncDrawnCard('m174-transfer', 0, 'cat-boom', true)!;
    expect(card.isInHand()).toBe(true);
    const start = card.position.clone();

    const targetZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(2)!;
    const transferred = sceneManager.syncTransferredCard(
      'm174-transfer',
      0,
      2,
      'cat-boom',
      true,
      1,
      0
    )!;

    expect(transferred).toBe(card);
    expect(card.getHandZoneId()).toBe(targetZone.zoneId);
    expect(card.isLayoutControlled()).toBe(true);
    expect(sceneManager.isCardTransferAnimating('m174-transfer')).toBe(true);

    // Still at the preserved source transform (no instant teleport).
    expect(card.position.distanceTo(start)).toBeLessThan(1e-6);

    // A layout pass while animating must not write the card transform.
    targetZone.arrangeCards();
    expect(card.position.distanceTo(start)).toBeLessThan(1e-6);

    sceneManager.flushCardTransfers();

    const expected = targetZone.getCardSlotTransform(card);
    expect(card.position.distanceTo(expected.position)).toBeLessThan(1e-6);
    expect(card.quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-6);
    expect(card.isLayoutControlled()).toBe(false);
    expect(sceneManager.isCardTransferAnimating('m174-transfer')).toBe(false);

    // Settling layout must be a no-op (no post-animation jump).
    const settled = card.position.clone();
    targetZone.arrangeCards();
    expect(card.position.distanceTo(settled)).toBeLessThan(1e-6);
  });

  it('keeps opponent hand cards hover/flip/drag interactable (M1.7.4.2)', () => {
    const card = sceneManager.syncDrawnCard('m174-opponent', 1, 'cat-boom', true)!;

    expect(card.isInHand()).toBe(true);
    expect(sceneManager.isCardInOpponentHand(card)).toBe(true);
    // M1.7.4.3: Opponent hand card is masked to local viewer
    expect(card.isMasked()).toBe(true);
    expect(card.isFaceUp()).toBe(true);
    expect(sceneManager.getDragController().canDragCard!(card)).toBe(true);

    // Flip to face down
    card.animateFlipTo(false);
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(false);
    expect(sceneManager.isCardInOpponentHand(card)).toBe(true);
  });

  it('restores an optimistic opponent-hand drag when the server rejects it', () => {
    const card = sceneManager.syncDrawnCard('m174-reject', 0, 'favor', true)!;
    const sourceZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
    const targetZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;
    const originalSlot = sourceZone.getCardSlotTransform(card).position.clone();

    // Simulate the local drop into the opponent hand: optimistic detach + request.
    card.position.set(targetZone.position.x, 0.4, targetZone.position.z);
    (sceneManager as unknown as {
      _handleDropInHandZone: (
        card: CardObject3D,
        zone: unknown,
        entireStack: boolean,
        stack: unknown,
        followers: CardObject3D[]
      ) => void;
    })._handleDropInHandZone(card, targetZone, false, null, []);

    expect(sceneManager.isCardTransferAnimating('m174-reject')).toBe(true);
    expect(card.isLayoutControlled()).toBe(true);
    // M1.7.4.3: masked while pending transfer to opponent
    expect(card.isMasked()).toBe(true);
    expect(card.getHandZoneId()).toBeNull();

    sceneManager.handleServerRejection('m174-reject', 'TARGET_PLAYER_NOT_FOUND');

    expect(sceneManager.isCardTransferAnimating('m174-reject')).toBe(false);
    expect(card.getHandZoneId()).toBe(sourceZone.zoneId);
    expect(card.isMasked()).toBe(!card.isFaceUp());
    expect(card.isLayoutControlled()).toBe(false);
    expect(card.position.distanceTo(originalSlot)).toBeLessThan(1e-6);
  });

  it('moves an opponent hand card dropped on the table to the table (M1.7.4.2)', () => {
    const card = sceneManager.syncDrawnCard('m174-private-drop', 1, 'cat-boom', true)!;
    const sourceZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;

    // DragController has already moved the card to table space before drop.
    card.position.set(0, 0.15, 0);

    (sceneManager as unknown as {
      _onCardDropped: (
        card: CardObject3D,
        entireStack: boolean,
        followers: CardObject3D[]
      ) => void;
    })._onCardDropped(card, false, []);

    // M1.7.4.2: dropping on table moves card out of hand and onto table!
    expect(card.getHandZoneId()).toBeNull();
    expect(card.isInHand()).toBe(false);
    expect(sceneManager.getCardRegistry().getLocation(card.cardId)).toBe('ON_TABLE');
    expect(sourceZone.hasCard(card.cardId)).toBe(false);
    expect(card.isFaceUp()).toBe(true);
  });

  it('completes a server-authorized hand drop exactly at the destination', () => {
    const card = sceneManager.syncDrawnCard('m174-accept', 0, 'shuffle', true)!;
    const targetZone = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;

    card.position.set(targetZone.position.x, 0.4, targetZone.position.z);
    (sceneManager as unknown as {
      _handleDropInHandZone: (
        card: CardObject3D,
        zone: unknown,
        entireStack: boolean,
        stack: unknown,
        followers: CardObject3D[]
      ) => void;
    })._handleDropInHandZone(card, targetZone, false, null, []);

    expect(sceneManager.isCardTransferAnimating('m174-accept')).toBe(true);

    // Authoritative confirmation arrives with the request's seq.
    sceneManager.syncTransferredCard('m174-accept', 0, 1, 'shuffle', true, 42, 0);
    sceneManager.flushCardTransfers();

    expect(card.getHandZoneId()).toBe(targetZone.zoneId);
    // M1.7.4.3: Opponent hand card is masked to local viewer
    expect(card.isMasked()).toBe(true);
    const expected = targetZone.getCardSlotTransform(card);
    expect(card.position.distanceTo(expected.position)).toBeLessThan(1e-6);
    expect(sceneManager.isCardTransferAnimating('m174-accept')).toBe(false);
  });

  it('ignores stale transfer sequences so a delayed event cannot move a card backwards', () => {
    sceneManager.syncTransferredCard('m174-seq', 0, 2, 'cat-boom', true, 10, 0);
    sceneManager.flushCardTransfers();

    const zone2 = sceneManager.getHandZoneManager().getHandZoneForPlayer(2)!;
    expect((sceneManager.getObject('m174-seq') as CardObject3D).getHandZoneId()).toBe(
      zone2.zoneId
    );

    sceneManager.syncTransferredCard('m174-seq', 0, 1, 'cat-boom', true, 9, 0);
    sceneManager.flushCardTransfers();

    expect((sceneManager.getObject('m174-seq') as CardObject3D).getHandZoneId()).toBe(
      zone2.zoneId
    );
  });
});
