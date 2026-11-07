/**
 * opponentHandMasking1743.test.ts — M1.7.4.3 Viewer-Based Card Masking Tests
 *
 * Verifies viewer-based card masking rules:
 * - HAND cards are unmasked ONLY for the owning player (ownerId === localSessionId) when faceUp.
 * - Opponent HAND cards are always masked (isMasked() === true) to the viewer regardless of faceUp.
 * - TABLE / DISCARD cards follow standard faceUp masking (!faceUp) for all players.
 * - Card transfers and flips respect viewer perspective.
 * - syncRoomObjects applies proper masking across local hand, opponent hand, and table cards.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import type { SandboxObject, PlayerInfo } from '@shared/types/room';

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
      stopLoop(): void {}
      requestRender(): void {}
      handleResize(): void {}
      getCamera(): THREE.PerspectiveCamera {
        return this._camera;
      }
      getDomElement(): HTMLCanvasElement {
        return this._canvas;
      }
      dispose(): void {
        this._canvas.remove();
      }
    },
  };
});

import { SceneManager } from '../scene/SceneManager';

describe('M1.7.4.3 — Viewer-Based Card Masking', () => {
  let container: HTMLElement;
  let sceneManager: SceneManager;

  const LOCAL_PLAYER_ID = 'session_local_0';
  const OPPONENT_1_ID = 'session_opp_1';
  const OPPONENT_2_ID = 'session_opp_2';

  beforeEach(() => {
    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
    document.body.appendChild(container);

    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    // Local player is index 0
    sceneManager.setPlayerPerspective(0, 4, false);
    sceneManager.setLocalSessionId(LOCAL_PLAYER_ID);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  it('1. Local player draws card with faceUp=true -> card is unmasked', () => {
    const card = sceneManager.syncDrawnCard('c_loc_up', 0, 'attack', true, LOCAL_PLAYER_ID)!;
    expect(card).not.toBeNull();
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(false);
  });

  it('2. Local player draws card with faceUp=false -> card is masked', () => {
    const card = sceneManager.syncDrawnCard('c_loc_down', 0, 'attack', false, LOCAL_PLAYER_ID)!;
    expect(card).not.toBeNull();
    expect(card.isFaceUp()).toBe(false);
    expect(card.isMasked()).toBe(true);
  });

  it('3. Opponent draws card with faceUp=true -> card is masked to viewer', () => {
    const card = sceneManager.syncDrawnCard('c_opp_up', 1, 'defuse', true, OPPONENT_1_ID)!;
    expect(card).not.toBeNull();
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(true);
  });

  it('4. Opponent draws card with faceUp=false -> card is masked to viewer', () => {
    const card = sceneManager.syncDrawnCard('c_opp_down', 1, 'defuse', false, OPPONENT_1_ID)!;
    expect(card).not.toBeNull();
    expect(card.isFaceUp()).toBe(false);
    expect(card.isMasked()).toBe(true);
  });

  it('5. Card transferred from opponent to local player unmasks if faceUp and masks if faceDown', () => {
    // FaceUp transfer to local player
    const cardUp = sceneManager.syncTransferredCard(
      'c_trans_to_me_up',
      1,
      0,
      'shuffle',
      true,
      undefined,
      undefined,
      LOCAL_PLAYER_ID
    )!;
    expect(cardUp).not.toBeNull();
    expect(cardUp.isFaceUp()).toBe(true);
    expect(cardUp.isMasked()).toBe(false);

    // FaceDown transfer to local player
    const cardDown = sceneManager.syncTransferredCard(
      'c_trans_to_me_down',
      1,
      0,
      'shuffle',
      false,
      undefined,
      undefined,
      LOCAL_PLAYER_ID
    )!;
    expect(cardDown).not.toBeNull();
    expect(cardDown.isFaceUp()).toBe(false);
    expect(cardDown.isMasked()).toBe(true);
  });

  it('6. Card transferred from local player to opponent is masked regardless of faceUp', () => {
    const card = sceneManager.syncTransferredCard(
      'c_trans_to_opp',
      0,
      1,
      'favor',
      true,
      undefined,
      undefined,
      OPPONENT_1_ID
    )!;
    expect(card).not.toBeNull();
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(true);
  });

  it('7. Card transferred between two opponents is masked to viewer', () => {
    const card = sceneManager.syncTransferredCard(
      'c_trans_opp_to_opp',
      1,
      2,
      'nope',
      true,
      undefined,
      undefined,
      OPPONENT_2_ID
    )!;
    expect(card).not.toBeNull();
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(true);
  });

  it('8. Card in opponent hand flipped via syncFlippedCard remains masked', () => {
    const card = sceneManager.syncDrawnCard('c_opp_flip', 1, 'see-the-future', true, OPPONENT_1_ID)!;
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(true);

    // Flip to face down
    sceneManager.syncFlippedCard('c_opp_flip', false, undefined, OPPONENT_1_ID, 'HAND');
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(false);
    expect(card.isMasked()).toBe(true);

    // Flip back to face up
    sceneManager.syncFlippedCard('c_opp_flip', true, 'see-the-future', OPPONENT_1_ID, 'HAND');
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(true);
  });

  it('9. Card in local hand flipped via syncFlippedCard toggles unmasked/masked matching faceUp', () => {
    const card = sceneManager.syncDrawnCard('c_loc_flip', 0, 'attack', true, LOCAL_PLAYER_ID)!;
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(false);

    // Flip to face down
    sceneManager.syncFlippedCard('c_loc_flip', false, undefined, LOCAL_PLAYER_ID, 'HAND');
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(false);
    expect(card.isMasked()).toBe(true);

    // Flip to face up
    sceneManager.syncFlippedCard('c_loc_flip', true, 'attack', LOCAL_PLAYER_ID, 'HAND');
    card.flushFlipAnimation();
    expect(card.isFaceUp()).toBe(true);
    expect(card.isMasked()).toBe(false);
  });

  it('10. Card dropped from hand to table follows table masking (faceUp=unmasked, faceDown=masked)', () => {
    // 10A: Opponent hand card (faceUp=true, currently masked) dropped to table -> unmasked
    const cardOpp = sceneManager.syncDrawnCard('c_opp_drop_table', 1, 'favor', true, OPPONENT_1_ID)!;
    expect(cardOpp.isMasked()).toBe(true);

    cardOpp.position.set(2, 0, 2);
    (sceneManager as any)._onCardDropped(cardOpp, false, []);
    expect(cardOpp.isInHand()).toBe(false);
    expect(cardOpp.isFaceUp()).toBe(true);
    expect(cardOpp.isMasked()).toBe(false);

    // 10B: Face-down card dropped to table -> masked
    const cardDown = sceneManager.syncDrawnCard('c_down_drop_table', 0, 'attack', false, LOCAL_PLAYER_ID)!;
    expect(cardDown.isMasked()).toBe(true);

    cardDown.position.set(-2, 0, 2);
    (sceneManager as any)._onCardDropped(cardDown, false, []);
    expect(cardDown.isInHand()).toBe(false);
    expect(cardDown.isFaceUp()).toBe(false);
    expect(cardDown.isMasked()).toBe(true);
  });

  it('11. syncRoomObjects applies proper masking across local hand, opponent hand, and table', () => {
    const players: PlayerInfo[] = [
      { id: LOCAL_PLAYER_ID, name: 'Alice', isHost: true, isConnected: true, playerIndex: 0 },
      { id: OPPONENT_1_ID, name: 'Bob', isHost: false, isConnected: true, playerIndex: 1 },
      { id: OPPONENT_2_ID, name: 'Charlie', isHost: false, isConnected: true, playerIndex: 2 },
    ];

    const objects: SandboxObject[] = [
      {
        id: 'room_card_local_up',
        type: 'card',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        faceUp: true,
        lockedBy: null,
        ownerId: LOCAL_PLAYER_ID,
        location: 'HAND',
        cardType: 'attack',
      },
      {
        id: 'room_card_local_down',
        type: 'card',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        faceUp: false,
        lockedBy: null,
        ownerId: LOCAL_PLAYER_ID,
        location: 'HAND',
      },
      {
        id: 'room_card_opp_up',
        type: 'card',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        faceUp: true,
        lockedBy: null,
        ownerId: OPPONENT_1_ID,
        location: 'HAND',
        cardType: 'defuse',
      },
      {
        id: 'room_card_opp_down',
        type: 'card',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        faceUp: false,
        lockedBy: null,
        ownerId: OPPONENT_1_ID,
        location: 'HAND',
      },
      {
        id: 'room_card_table_up',
        type: 'card',
        position: { x: 1, y: 0, z: 1 },
        rotation: 0,
        faceUp: true,
        lockedBy: null,
        ownerId: null,
        location: 'TABLE',
        cardType: 'see-the-future',
      },
      {
        id: 'room_card_table_down',
        type: 'card',
        position: { x: -1, y: 0, z: 1 },
        rotation: 0,
        faceUp: false,
        lockedBy: null,
        ownerId: null,
        location: 'TABLE',
      },
    ];

    sceneManager.syncRoomObjects(objects, players);

    const localUp = sceneManager.getCardRegistry().getCardObject('room_card_local_up')!;
    const localDown = sceneManager.getCardRegistry().getCardObject('room_card_local_down')!;
    const oppUp = sceneManager.getCardRegistry().getCardObject('room_card_opp_up')!;
    const oppDown = sceneManager.getCardRegistry().getCardObject('room_card_opp_down')!;
    const tableUp = sceneManager.getCardRegistry().getCardObject('room_card_table_up')!;
    const tableDown = sceneManager.getCardRegistry().getCardObject('room_card_table_down')!;

    expect(localUp).toBeDefined();
    expect(localUp.isMasked()).toBe(false);

    expect(localDown).toBeDefined();
    expect(localDown.isMasked()).toBe(true);

    expect(oppUp).toBeDefined();
    expect(oppUp.isMasked()).toBe(true);

    expect(oppDown).toBeDefined();
    expect(oppDown.isMasked()).toBe(true);

    expect(tableUp).toBeDefined();
    expect(tableUp.isMasked()).toBe(false);

    expect(tableDown).toBeDefined();
    expect(tableDown.isMasked()).toBe(true);
  });

  it('12. Table card flipped via syncFlippedCard toggles masking with faceUp', () => {
    const tableCard = sceneManager.syncDrawnCard('c_table_flip', 0, 'attack', true, LOCAL_PLAYER_ID)!;
    // Move to table
    tableCard.position.set(0, 0, 0);
    (sceneManager as any)._onCardDropped(tableCard, false, []);
    expect(tableCard.isInHand()).toBe(false);
    expect(tableCard.isFaceUp()).toBe(true);
    expect(tableCard.isMasked()).toBe(false);

    // Flip to face down on table
    sceneManager.syncFlippedCard('c_table_flip', false, undefined, null, 'TABLE');
    tableCard.flushFlipAnimation();
    expect(tableCard.isFaceUp()).toBe(false);
    expect(tableCard.isMasked()).toBe(true);

    // Flip to face up on table
    sceneManager.syncFlippedCard('c_table_flip', true, 'attack', null, 'TABLE');
    tableCard.flushFlipAnimation();
    expect(tableCard.isFaceUp()).toBe(true);
    expect(tableCard.isMasked()).toBe(false);
  });
});

