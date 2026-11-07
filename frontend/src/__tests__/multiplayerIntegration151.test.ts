/**
 * multiplayerIntegration151.test.ts — Frontend M1.5.1 Integration & Verification
 * Tests:
 * 1. NetworkConfig dynamic WebSocket URL resolution
 * 2. ClientStore room, player, and connection state management
 * 3. LobbyScreen UI inputs, events, error display, and status updates
 * 4. GameScreen room badge and player badge HUD updates
 * 5. SceneManager.syncDrawnCard — local player face-up vs remote player face-down
 * 6. HandZoneObject3D local hover elevation, scale boost, and renderOrder hierarchy
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { getWebSocketUrl } from '../network/NetworkConfig';
import { ClientStore } from '../store/ClientStore';
import { LobbyScreen } from '../ui/LobbyScreen';
import { GameScreen } from '../ui/GameScreen';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';
import { HandZoneObject3D } from '../objects/HandZoneObject3D';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';

// Mock Renderer for headless JSDOM environment
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
          left: 0,
          top: 0,
          width: 1024,
          height: 768,
          right: 1024,
          bottom: 768,
          x: 0,
          y: 0,
          toJSON: () => ({}),
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
      getCamera(): THREE.PerspectiveCamera {
        return this._camera;
      }
      getDomElement(): HTMLCanvasElement {
        return this._canvas;
      }
      dispose(): void {}
    },
  };
});

describe('M1.5.1 Frontend Multiplayer & Private Hand Integration', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // ─── 1. Network Configuration ─────────────────────────────────────────────
  it('resolves WebSocket URL dynamically based on environment or browser location', () => {
    const url = getWebSocketUrl();
    expect(url).toMatch(/^wss?:\/\/.*:\d+\/ws$/);
  });

  // ─── 2. ClientStore Room & Player State ────────────────────────────────────
  it('manages room state, player ID, player index, and connection status in ClientStore', () => {
    const store = new ClientStore();
    let notified = 0;
    store.subscribe(() => notified++);

    store.setPlayerName('Alice');
    expect(store.getPlayerName()).toBe('Alice');

    store.setConnectionStatus('connected');
    expect(store.getConnectionStatus()).toBe('connected');

    store.setRoomId('ABC123');
    store.setPlayerId('session_alice');
    store.setPlayerIndex(0);

    expect(store.getRoomId()).toBe('ABC123');
    expect(store.getPlayerId()).toBe('session_alice');
    expect(store.getPlayerIndex()).toBe(0);

    store.clearRoom();
    expect(store.getRoomId()).toBeNull();
    expect(notified).toBeGreaterThan(3);
  });

  // ─── 3. LobbyScreen UI & Interactions ─────────────────────────────────────
  it('emits events for Create Room, Join Room, and Offline Sandbox from LobbyScreen', () => {
    const lobby = new LobbyScreen(container);
    let created = false;
    let joined = false;
    let sandboxEntered = false;

    lobby.onCreateRoom = (roomName, playerName) => {
      expect(roomName).toBe('Bàn Chơi Mèo Nổ');
      expect(playerName).toBe('Player 1');
      created = true;
    };

    lobby.onJoinRoom = (roomId, playerName) => {
      expect(roomId).toBe('XYZ789');
      expect(playerName).toBe('Player 1');
      joined = true;
    };

    lobby.onEnterSandbox = () => {
      sandboxEntered = true;
    };

    // Test Create Room button
    const createBtn = container.querySelector<HTMLButtonElement>('#btn-create-room')!;
    expect(createBtn).not.toBeNull();
    createBtn.click();
    expect(created).toBe(true);

    // Test Join Room validation & button
    const joinBtn = container.querySelector<HTMLButtonElement>('#btn-join-room')!;
    const roomIdInput = container.querySelector<HTMLInputElement>('#input-room-id')!;
    
    // Empty room ID shows error
    joinBtn.click();
    expect(joined).toBe(false);
    const errorEl = container.querySelector<HTMLElement>('#lobby-error')!;
    expect(errorEl.style.display).not.toBe('none');

    // Valid room ID
    roomIdInput.value = 'xyz789'; // lowercase should auto-uppercase
    joinBtn.click();
    expect(joined).toBe(true);

    // Test Enter Sandbox
    const sandboxBtn = container.querySelector<HTMLButtonElement>('#btn-enter-sandbox')!;
    sandboxBtn.click();
    expect(sandboxEntered).toBe(true);

    // Test Connection Status display
    lobby.updateConnectionStatus('connected');
    const statusEl = container.querySelector<HTMLElement>('#lobby-status')!;
    expect(statusEl.textContent).toContain('Đã kết nối');

    lobby.dispose();
  });

  // ─── 4. GameScreen HUD Room & Player Badges ───────────────────────────────
  it('updates Room badge and Player badge in GameScreen top HUD bar', () => {
    const game = new GameScreen(container);
    game.show();

    game.updateRoomInfo('ROOM42', 'Bob', 1);

    const roomBadge = container.querySelector<HTMLElement>('#hud-room-badge')!;
    const playerBadge = container.querySelector<HTMLElement>('#hud-player-badge')!;

    expect(roomBadge.style.display).toBe('inline-flex');
    expect(roomBadge.textContent).toContain('ROOM42');

    expect(playerBadge.style.display).toBe('inline-flex');
    expect(playerBadge.textContent).toContain('Bob (P2)');

    // In offline mode
    game.updateRoomInfo(null, 'Alice', 0);
    expect(roomBadge.textContent).toContain('Offline Sandbox');

    game.dispose();
  });

  // ─── 5. SceneManager.syncDrawnCard (Local Face-Up vs Remote Face-Down) ─────
  it('correctly handles face-up for local player card and face-down for opponent card', () => {
    const sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);

    // Draw card for Player 0 (local viewer) — faceUp: true with cardType
    const localCard = sceneManager.syncDrawnCard(
      'card_local_1',
      0,
      'see-the-future',
      true
    );

    expect(localCard).not.toBeNull();
    expect(localCard!.cardId).toBe('card_local_1');
    expect(localCard!.isFaceUp()).toBe(true);
    expect(localCard!.isInHand()).toBe(true);

    // Check hand zone 0 contains the card
    const hand0 = sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;
    expect(hand0.hasCard('card_local_1')).toBe(true);

    // Draw card for Player 1 (remote opponent) — faceUp: false with cardType undefined
    const remoteCard = sceneManager.syncDrawnCard(
      'card_remote_1',
      1,
      undefined,
      false
    );

    expect(remoteCard).not.toBeNull();
    expect(remoteCard!.cardId).toBe('card_remote_1');
    expect(remoteCard!.isFaceUp()).toBe(false);
    expect(remoteCard!.isInHand()).toBe(true);

    // Check hand zone 1 contains the opponent card
    const hand1 = sceneManager.getHandZoneManager().getHandZoneForPlayer(1)!;
    expect(hand1.hasCard('card_remote_1')).toBe(true);

    sceneManager.dispose();
  });

  // ─── 6. HandZoneObject3D Local Hover Elevation & Scale Boost (M1.7.7 subtle hover) ──────
  it('gently elevates (+0.05), scales up (1.05x), and boosts renderOrder (+30) when card in hand is hovered', () => {
    let hoveredCard: CardObject3D | null = null;

    const zone = new HandZoneObject3D({
      id: 'test_hand_hover',
      playerIndex: 0,
      x: 0,
      z: 5,
      rotationY: 0,
      label: 'Player 1',
      isCardHovered: (c) => c === hoveredCard,
    });

    const c1 = new CardObject3D({ id: 'c1' });
    const c2 = new CardObject3D({ id: 'c2' });
    const c3 = new CardObject3D({ id: 'c3' });

    zone.addCard(c1);
    zone.addCard(c2);
    zone.addCard(c3);

    // Baseline unhovered state
    const baseElevC2 = c2.position.y;
    expect(c2.scale.x).toBeCloseTo(1.0, 2);
    expect(c2.getLayerIndex()).toBe(HAND_ZONE_CONFIG.BASE_LAYER_INDEX + 1);

    // Hover c2 — M1.7.7: subtle hover (gentle lift + tiny scale + small render-order bump)
    hoveredCard = c2;
    zone.arrangeCards();

    // Hovered c2 elevation must be higher by HOVER_LIFT_Y (gentle lift, no stand-up)
    expect(c2.position.y).toBeCloseTo(baseElevC2 + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 3);
    // Scale must be slightly boosted (no stand-up pitch, no fan)
    expect(c2.scale.x).toBeCloseTo(HAND_ZONE_CONFIG.HOVER_SCALE, 3);
    // Layer index must be boosted by HOVER_LAYER_OFFSET so it sits just above neighbours
    expect(c2.getLayerIndex()).toBe(HAND_ZONE_CONFIG.BASE_LAYER_INDEX + 1 + HAND_ZONE_CONFIG.HOVER_LAYER_OFFSET);

    // c1 and c3 must remain at baseline scale
    expect(c1.scale.x).toBeCloseTo(1.0, 2);
    expect(c3.scale.x).toBeCloseTo(1.0, 2);

    // Unhover c2
    hoveredCard = null;
    zone.arrangeCards();

    // c2 returns to normal
    expect(c2.position.y).toBeCloseTo(baseElevC2, 2);
    expect(c2.scale.x).toBeCloseTo(1.0, 2);
    expect(c2.getLayerIndex()).toBe(HAND_ZONE_CONFIG.BASE_LAYER_INDEX + 1);

    zone.dispose();
    c1.dispose();
    c2.dispose();
    c3.dispose();
  });
});
