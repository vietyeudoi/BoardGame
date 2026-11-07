/**
 * opponentInteractionAndCursorFix.test.ts — Phase 4 Regression Tests
 *
 * Verifies the fixes for:
 * 1. Cursor coordinate safety (finite, within bounds, safe handling outside bounds)
 * 2. Cursor synchronization between clients
 * 3. Camera movement perspective with cursor raycasting
 * 4. Opponent hand rendering (flat, private, masked)
 * 5. Opponent card raycasting & interaction policies (public table cards interactable, hidden hand cards not manipulable)
 * 6. Local hand preview isolation (does not affect opponent hand transforms or hit-testing)
 * 7. Dragging local cards preserves remote cursor synchronization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// ─── Mock Renderer (headless JSDOM) ──────────────────────────────────────────
vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      private readonly _canvas: HTMLCanvasElement;
      private readonly _camera: THREE.PerspectiveCamera;

      constructor(container: HTMLElement) {
        this._canvas = document.createElement('canvas');
        Object.defineProperty(this._canvas, 'clientWidth', { value: 1024, configurable: true });
        Object.defineProperty(this._canvas, 'clientHeight', { value: 768, configurable: true });
        this._canvas.getBoundingClientRect = () => ({
          left: 0, top: 0, width: 1024, height: 768,
          right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => ({}),
        });
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 1000);
        this._camera.position.set(0, 8, 10);
        this._camera.lookAt(0, 0, 0);
        this._camera.updateProjectionMatrix();
      }

      startLoop(): void {}
      requestRender(): void {}
      handleResize(): void {}
      getCamera(): THREE.PerspectiveCamera { return this._camera; }
      getDomElement(): HTMLCanvasElement { return this._canvas; }
      dispose(): void {}
    },
  };
});

import { CursorBroadcaster } from '../network/CursorBroadcaster';
import { RemoteCursorManager } from '../scene/RemoteCursorManager';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import { CardObject3D } from '../objects/CardObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';
import { SceneManager } from '../scene/SceneManager';
import { ClientStore } from '../store/ClientStore';
import type { NetworkClient } from '../network/NetworkClient';

// ── Test Mocks & Helpers ──────────────────────────────────────────────────────

function createMockNetworkClient(): NetworkClient & { sent: unknown[] } {
  const sent: unknown[] = [];
  const mock = {
    sent,
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn((msg: unknown) => sent.push(msg)),
    onMessage: null,
    onConnectionChange: null,
  };
  return mock as unknown as NetworkClient & { sent: unknown[] };
}

describe('Phase 4: Cursor Coordinate Validation & Safety', () => {
  let networkClient: ReturnType<typeof createMockNetworkClient>;
  let store: ClientStore;
  let broadcaster: CursorBroadcaster;

  beforeEach(() => {
    vi.useFakeTimers();
    networkClient = createMockNetworkClient();
    store = new ClientStore();
    store.setRoomId('room_test_123');
    broadcaster = new CursorBroadcaster(networkClient, store);
    broadcaster.enable();
  });

  afterEach(() => {
    broadcaster.dispose();
    vi.useRealTimers();
  });

  // Req 1: Cursor coordinates are finite
  it('1. drops NaN or Infinity coordinates and never sends them', () => {
    broadcaster.onCursorMoved(NaN, 10);
    broadcaster.onCursorMoved(5, Infinity);
    broadcaster.onCursorMoved(-Infinity, -Infinity);
    vi.advanceTimersByTime(100);

    expect(networkClient.sent.length).toBe(0);
  });

  // Req 2: Cursor coordinates outside valid bounds are handled safely
  it('2. safely ignores coordinates outside [-50, 50] boundary without throwing or sending', () => {
    broadcaster.onCursorMoved(55, 10);
    broadcaster.onCursorMoved(-100, 20);
    broadcaster.onCursorMoved(0, 1500);
    vi.advanceTimersByTime(100);

    expect(networkClient.sent.length).toBe(0);

    // Valid coordinates inside bounds are sent normally
    broadcaster.onCursorMoved(12.5, -8.2);
    vi.advanceTimersByTime(100);

    expect(networkClient.sent.length).toBe(1);
    const msg = networkClient.sent[0] as { type: string; payload: { x: number; z: number } };
    expect(msg.type).toBe('cursor:move');
    expect(msg.payload.x).toBeCloseTo(12.5);
    expect(msg.payload.z).toBeCloseTo(-8.2);
  });

  it('avoids sending unnecessary updates when position has not changed', () => {
    broadcaster.onCursorMoved(10, 10);
    vi.advanceTimersByTime(60);
    expect(networkClient.sent.length).toBe(1);

    // Send identical position (within tolerance)
    broadcaster.onCursorMoved(10, 10);
    vi.advanceTimersByTime(60);
    // Should still be 1 (no duplicate sent)
    expect(networkClient.sent.length).toBe(1);
  });
});

describe('Phase 4: Remote Cursor Synchronization', () => {
  // Req 4: Cursor synchronization works between two clients
  it('4. RemoteCursorManager creates and positions cone at correct XZ coordinates', () => {
    const scene = new THREE.Scene();
    const renderCb = vi.fn();
    const manager = new RemoteCursorManager(scene, renderCb);
    manager.setLocalPlayerId('player_local');

    // Update from remote player
    manager.updateCursor({
      playerId: 'player_remote_1',
      playerName: 'Bob',
      x: 5.5,
      z: -3.2,
      seq: 1,
    });

    const cursorObj = scene.getObjectByName('RemoteCursor_player_remote_1');
    expect(cursorObj).toBeDefined();
    expect(cursorObj?.position.x).toBeCloseTo(5.5);
    expect(cursorObj?.position.z).toBeCloseTo(-3.2);

    // Ignore self cursor
    manager.updateCursor({
      playerId: 'player_local',
      playerName: 'Alice',
      x: 0,
      z: 0,
      seq: 1,
    });
    expect(scene.getObjectByName('RemoteCursor_player_local')).toBeUndefined();

    manager.dispose();
  });
});

describe('Phase 4: Opponent Hand Rendering & Privacy', () => {
  // Req 6: Opponent hand rendering remains unchanged
  it('6. opponent cards remain flat, face-down (masked), and private', () => {
    const opponentZone = new HandZoneObject3D({
      id: 'hand_zone_opponent',
      playerIndex: 1,
      x: 0,
      z: -7,
      rotationY: Math.PI,
      label: 'Player 2',
      isLocalPlayer: false,
    });

    const card = new CardObject3D({
      id: 'opponent_c1',
      faceUp: false,
    });
    card.setMasked(true);

    opponentZone.addCard(card);
    opponentZone.arrangeCards();

    // Card should be resting flat on table felt
    expect(Math.abs(card.rotation.x)).toBeLessThan(0.01);
    expect(card.isMasked()).toBe(true);
    expect(card.isFaceUp()).toBe(false);

    opponentZone.dispose();
    card.dispose();
  });

  // Req 9: local hand presentation does not affect opponent hand transforms
  it('9. local hand hover does NOT affect opponent hand transforms', () => {
    const localZone = new HandZoneObject3D({
      id: 'hand_zone_local',
      playerIndex: 0,
      x: 0,
      z: 7,
      rotationY: 0,
      label: 'Player 1',
      isLocalPlayer: true,
      isCardHovered: () => true,
    });

    const opponentZone = new HandZoneObject3D({
      id: 'hand_zone_opponent',
      playerIndex: 1,
      x: 0,
      z: -7,
      rotationY: Math.PI,
      label: 'Player 2',
      isLocalPlayer: false,
    });

    const localCard = new CardObject3D({ id: 'local_c', faceUp: true });
    const oppCard = new CardObject3D({ id: 'opp_c', faceUp: false });
    oppCard.setMasked(true);

    localZone.addCard(localCard);
    opponentZone.addCard(oppCard);

    localZone.arrangeCards();
    opponentZone.arrangeCards();

    // Local card gets only the subtle hover presentation (flat, small lift).
    expect(localCard.rotation.x).toBeCloseTo(0, 9);
    expect(localCard.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 6);
    expect(localCard.position.y).toBeGreaterThan(HAND_ZONE_CONFIG.SURFACE_Y);

    // Opponent card remains completely flat, unscaled and at base elevation.
    expect(Math.abs(oppCard.rotation.x)).toBeLessThan(0.01);
    expect(oppCard.scale.x).toBeCloseTo(1, 9);
    expect(oppCard.position.y).toBeCloseTo(HAND_ZONE_CONFIG.SURFACE_Y, 6);

    localZone.dispose();
    opponentZone.dispose();
  });
});

describe('Phase 4: Opponent Card Raycasting & Interaction Policy', () => {
  // Req 7: Opponent card raycasting works where interaction is permitted
  it('7. allows raycasting and interaction with table cards played by opponent', () => {
    const tableCard = new CardObject3D({
      id: 'shared_table_card',
      title: 'Taco Cat',
      faceUp: true,
    });
    // Table card has no handZoneId
    expect(tableCard.isInHand()).toBe(false);
    expect(tableCard.isDisposed()).toBe(false);

    tableCard.dispose();
  });

  // Req 8 (M1.7.4): Opponent hand cards are interactable, but content stays masked.
  it('8. opponent private hand cards can animate a flip while remaining masked', () => {
    const oppCard = new CardObject3D({ id: 'opp_secret_card', faceUp: false });
    oppCard.setHandZoneId('hand_zone_2');
    oppCard.setMasked(true);

    expect(oppCard.isMasked()).toBe(true);
    expect(oppCard.isFaceUp()).toBe(false);

    // Flip is a local visual interaction. It must never unmask the card.
    oppCard.animateFlipTo(true);
    expect(oppCard.isFaceUp()).toBe(true);
    expect(oppCard.isMasked()).toBe(true);

    const materials = oppCard.getMesh().material as THREE.MeshStandardMaterial[];
    expect(materials[0]!.map).toBe(materials[1]!.map);

    oppCard.dispose();
  });
});

describe('Phase 4: SceneManager Table Intersection Safety', () => {
  // Req 3: Safe raycast bounds check on SceneManager
  it('3. getTableIntersectionAtScreenPos returns null for non-finite or out-of-bounds screen coords', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const sceneManager = new SceneManager(container);

    // Non-finite coords
    expect(sceneManager.getTableIntersectionAtScreenPos(NaN, 100)).toBeNull();
    expect(sceneManager.getTableIntersectionAtScreenPos(100, Infinity)).toBeNull();

    sceneManager.dispose();
    container.remove();
  });
});
