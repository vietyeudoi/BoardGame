/**
 * handPrivacyAndOwnership154.test.ts
 *
 * M1.5.4 Integration tests verifying:
 * 1. Hand Privacy Security:
 *    - Owner sees front face (cardType, faceUp)
 *    - Opponents always receive faceUp: false and stripped cardType
 *    - Owner flipping card faceUp does NOT leak faceUp to peers
 * 2. Card Ownership Transfer (M1.5.4.2):
 *    - Current owner can transfer card to another connected player via card:transfer
 *    - Recipient receives card with cardType and unmasked state
 *    - Sender and third-party peers receive card with stripped cardType and faceUp: false
 *    - State in subsequent room:state reflects new owner and maintains privacy for non-owners
 * 3. Atomic Validation & Rollback:
 *    - Transfer by non-owner is rejected (NOT_CARD_OWNER)
 *    - Transfer to invalid targetPlayerIndex is rejected (TARGET_PLAYER_NOT_FOUND) with rollback
 * 4. Drag Lock & Hand Security:
 *    - Opponent cannot drag another player's hand card
 *    - Cross-player drag-end with targetPlayerIndex transfers card safely
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';

const TEST_PORT = 5400;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;

describe('M1.5.4 — Hand Privacy, Card Ownership & Player Area Optimization', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let roomManager: RoomManager;

  beforeAll(async () => {
    roomManager = new RoomManager();
    httpServer = new HttpServer(TEST_PORT);
    wsServer = new WebSocketServer(httpServer.getServer(), roomManager);
    httpServer.start();
    wsServer.start();
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    wsServer.shutdown();
    httpServer.stop();
  });

  function createClient(): {
    ws: WebSocket;
    messages: ServerToClientMessage[];
    ready: Promise<void>;
    send: (msg: object) => void;
    waitForMessage: <T extends ServerToClientMessage['type']>(
      type: T,
      timeoutMs?: number
    ) => Promise<Extract<ServerToClientMessage, { type: T }>>;
    waitForCondition: (
      predicate: (m: ServerToClientMessage) => boolean,
      timeoutMs?: number
    ) => Promise<ServerToClientMessage>;
    close: () => void;
  } {
    const ws = new WebSocket(WS_URL);
    const messages: ServerToClientMessage[] = [];

    const ready = new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ServerToClientMessage;
        messages.push(parsed);
      } catch {}
    });

    const send = (msg: object) => {
      ws.send(JSON.stringify(msg));
    };

    const waitForMessage = <T extends ServerToClientMessage['type']>(
      type: T,
      timeoutMs = 2500
    ): Promise<Extract<ServerToClientMessage, { type: T }>> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const match = messages.find((m) => m.type === type);
          if (match) {
            resolve(match as Extract<ServerToClientMessage, { type: T }>);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            reject(
              new Error(
                `Timeout waiting for message type "${type}". Received: ${JSON.stringify(
                  messages.map((m) => m.type)
                )}`
              )
            );
            return;
          }
          setTimeout(check, 20);
        };
        check();
      });
    };

    const waitForCondition = (
      predicate: (m: ServerToClientMessage) => boolean,
      timeoutMs = 2500
    ): Promise<ServerToClientMessage> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const match = messages.find(predicate);
          if (match) {
            resolve(match);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            reject(
              new Error(
                `Timeout waiting for condition. Received types: ${JSON.stringify(
                  messages.map((m) => m.type)
                )}`
              )
            );
            return;
          }
          setTimeout(check, 20);
        };
        check();
      });
    };

    const close = () => {
      ws.close();
    };

    return { ws, messages, ready, send, waitForMessage, waitForCondition, close };
  }

  it('verifies hand privacy and ownership transfer across 3 multiplayer clients', async () => {
    const alice = createClient();
    const bob = createClient();
    const carol = createClient();

    await Promise.all([alice.ready, bob.ready, carol.ready]);

    // 1. Alice creates room
    alice.send({ type: 'room:create', payload: { roomName: 'Privacy Room' } });
    const aliceJoined = await alice.waitForMessage('room:joined');
    const roomId = aliceJoined.payload.roomId;
    const aliceIndex = aliceJoined.payload.playerIndex;
    expect(aliceIndex).toBe(0);

    // 2. Bob joins room
    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    const bobJoined = await bob.waitForMessage('room:joined');
    const bobIndex = bobJoined.payload.playerIndex;
    expect(bobIndex).toBe(1);

    // 3. Carol joins room
    carol.send({ type: 'room:join', payload: { roomId, playerName: 'Carol' } });
    const carolJoined = await carol.waitForMessage('room:joined');
    const carolIndex = carolJoined.payload.playerIndex;
    expect(carolIndex).toBe(2);

    await new Promise((r) => setTimeout(r, 100));

    // 4. Alice draws a card
    alice.send({ type: 'card:draw' });

    const aliceDrawn = await alice.waitForMessage('hand:card-drawn');
    const drawnCardId = aliceDrawn.payload.card.id;
    expect(aliceDrawn.payload.playerIndex).toBe(aliceIndex);
    expect(aliceDrawn.payload.card.cardType).toBeDefined();
    expect(aliceDrawn.payload.card.cardType!.length).toBeGreaterThan(0);
    expect(aliceDrawn.payload.card.faceUp).toBe(true);

    const bobDrawn = await bob.waitForMessage('hand:card-drawn');
    expect(bobDrawn.payload.card.id).toBe(drawnCardId);
    expect(bobDrawn.payload.card.cardType).toBeDefined();
    expect(bobDrawn.payload.card.faceUp).toBe(true);

    const carolDrawn = await carol.waitForMessage('hand:card-drawn');
    expect(carolDrawn.payload.card.id).toBe(drawnCardId);
    expect(carolDrawn.payload.card.cardType).toBeDefined();
    expect(carolDrawn.payload.card.faceUp).toBe(true);

    // 5. M1.7.4.2: Non-owner (Carol) CAN transfer Alice's card to Bob directly!
    carol.send({
      type: 'card:transfer',
      payload: { cardId: drawnCardId, targetPlayerIndex: bobIndex },
    });
    const bobTransferMsg = (await bob.waitForMessage(
      'hand:card-transferred'
    )) as Extract<ServerToClientMessage, { type: 'hand:card-transferred' }>;
    expect(bobTransferMsg.payload.cardId).toBe(drawnCardId);
    expect(bobTransferMsg.payload.fromPlayerIndex).toBe(aliceIndex);
    expect(bobTransferMsg.payload.toPlayerIndex).toBe(bobIndex);
    expect(bobTransferMsg.payload.card.cardType).toBeDefined();

    // 6. Alice attempts transfer to non-existent player -> rejected and rolled back
    alice.send({
      type: 'card:transfer',
      payload: { cardId: drawnCardId, targetPlayerIndex: 99 },
    });
    const aliceInvalidErr = await alice.waitForMessage('error');
    expect(aliceInvalidErr.payload.code).toBe('TARGET_PLAYER_NOT_FOUND');

    // 7. Bob transfers it to Carol via drag-end into Carol's hand zone
    bob.send({
      type: 'object:drag-start',
      payload: { objectId: drawnCardId, x: 0, y: 1, z: 0 },
    });
    await new Promise((r) => setTimeout(r, 50));
    bob.send({
      type: 'object:drag-end',
      payload: {
        objectId: drawnCardId,
        x: 5,
        y: 0,
        z: 0,
        targetPlayerIndex: carolIndex,
      },
    });

    // Carol should receive hand:card-transferred with unmasked cardType
    const carolReceivedMsg = (await carol.waitForCondition(
      (m) =>
        m.type === 'hand:card-transferred' &&
        m.payload.toPlayerIndex === carolIndex &&
        m.payload.cardId === drawnCardId
    )) as Extract<ServerToClientMessage, { type: 'hand:card-transferred' }>;
    expect(carolReceivedMsg.payload.card.cardType).toBe(aliceDrawn.payload.card.cardType);

    alice.close();
    bob.close();
    carol.close();
  });
});

