/**
 * dragJitterAndPrivacy1531.test.ts
 *
 * M1.5.3.1 Integration tests verifying:
 * 1. Drag lock prevents two clients from dragging the same object concurrently.
 * 2. Drag lock is released on object:drag-end, allowing other players to grab it.
 * 3. Drag lock is automatically released and broadcast when client disconnects.
 * 4. Drag-end retains faceUp orientation (face-down stays face-down, face-up stays face-up).
 * 5. Flipping a card in HAND sends object:flipped ONLY to owner; opponent NEVER receives faceUp=true or cardType.
 * 6. ViewStateBuilder strips cardType and forces faceUp=false for opponent's hand cards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';

const TEST_PORT = 5300;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;

describe('M1.5.3.1 — Drag Lock, Anti-Jitter & Hand Privacy', () => {
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
      timeoutMs = 2000
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
      timeoutMs = 2000
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
            reject(new Error(`Timeout waiting for custom condition. Received: ${JSON.stringify(messages.map((m) => m.type))}`));
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

  it('rejects drag-start on an object already locked by another player', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'LockRoom' } });
    const joinedAlice = await alice.waitForMessage('room:joined');
    const roomId = joinedAlice.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Alice starts dragging card_1
    alice.send({
      type: 'object:drag-start',
      payload: { objectId: 'card-lock-test', x: 0, y: 0.5, z: 0, seq: 1 },
    });
    await bob.waitForMessage('object:drag-start');

    // Bob attempts to drag the same card while Alice holds lock
    bob.send({
      type: 'object:drag-start',
      payload: { objectId: 'card-lock-test', x: 1, y: 0.5, z: 1, seq: 1 },
    });

    const errorMsg = (await bob.waitForCondition(
      (m) => m.type === 'error' && (m as { payload: { code?: string } }).payload.code === 'OBJECT_LOCKED'
    )) as { type: 'error'; payload: { message: string; code?: string } };

    expect(errorMsg.payload.code).toBe('OBJECT_LOCKED');

    alice.close();
    bob.close();
  });

  it('releases drag lock on drag-end so another player can acquire it', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'ReleaseLockRoom' } });
    const joinedAlice = await alice.waitForMessage('room:joined');
    const roomId = joinedAlice.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Alice starts dragging
    alice.send({
      type: 'object:drag-start',
      payload: { objectId: 'card-release-test', x: 0, y: 0.5, z: 0, seq: 1 },
    });
    await bob.waitForMessage('object:drag-start');

    // Alice ends dragging
    alice.send({
      type: 'object:drag-end',
      payload: { objectId: 'card-release-test', x: 5, y: 0.5, z: 5, seq: 2, faceUp: true },
    });
    await bob.waitForMessage('object:drag-end');

    // Bob can now start dragging the card successfully
    bob.send({
      type: 'object:drag-start',
      payload: { objectId: 'card-release-test', x: 5, y: 0.5, z: 5, seq: 3 },
    });
    const bobDragStart = await alice.waitForMessage('object:drag-start');
    expect(bobDragStart.payload.objectId).toBe('card-release-test');

    alice.close();
    bob.close();
  });

  it('releases drag lock and broadcasts object:drag-end when client disconnects', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'DisconnectLockRoom' } });
    const joinedAlice = await alice.waitForMessage('room:joined');
    const roomId = joinedAlice.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Alice grabs a card
    alice.send({
      type: 'object:drag-start',
      payload: { objectId: 'card-disconnect-test', x: 1, y: 0.5, z: 1, seq: 1 },
    });
    await bob.waitForMessage('object:drag-start');

    // Alice suddenly closes connection
    alice.close();

    // Bob should receive object:drag-end releasing the lock
    const releasedMsg = await bob.waitForMessage('object:drag-end');
    expect(releasedMsg.payload.objectId).toBe('card-disconnect-test');

    bob.close();
  });

  it('drag-end retains faceUp orientation in room state', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'FaceUpRetentionRoom' } });
    const joinedAlice = await alice.waitForMessage('room:joined');
    const roomId = joinedAlice.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Alice draws a card from deck
    alice.send({ type: 'card:draw' });
    const drawMsg = await alice.waitForMessage('hand:card-drawn');
    const cardId = drawMsg.payload.card.id;

    // Alice drags card out to table face-down (faceUp: false)
    alice.send({
      type: 'object:drag-end',
      payload: { objectId: cardId, x: 2.5, y: 0.1, z: 1.0, seq: 10, faceUp: false },
    });

    const bobDragEnd = await bob.waitForMessage('object:drag-end');
    expect(bobDragEnd.payload.objectId).toBe(cardId);
    expect(bobDragEnd.payload.faceUp).toBe(false);

    alice.close();
    bob.close();
  });

  it('hand card flipped broadcasts object:flipped to all players (M1.7.4.2 shared interaction)', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'HandPrivacyRoom' } });
    const joinedAlice = await alice.waitForMessage('room:joined');
    const roomId = joinedAlice.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Alice draws card
    alice.send({ type: 'card:draw' });
    const aliceDraw = await alice.waitForMessage('hand:card-drawn');
    const bobDraw = await bob.waitForMessage('hand:card-drawn');

    // M1.7.4.2: Both see drawn card as faceUp: true
    expect(aliceDraw.payload.card.faceUp).toBe(true);
    expect(bobDraw.payload.card.faceUp).toBe(true);

    const handCardId = aliceDraw.payload.card.id;

    // Bob flips Alice's hand card!
    bob.send({ type: 'object:flip', payload: { objectId: handCardId } });

    // Both Alice and Bob receive object:flipped with faceUp: false
    const aliceFlip = await alice.waitForMessage('object:flipped');
    expect(aliceFlip.payload.objectId).toBe(handCardId);
    expect(aliceFlip.payload.faceUp).toBe(false);

    const bobFlip = await bob.waitForMessage('object:flipped');
    expect(bobFlip.payload.objectId).toBe(handCardId);
    expect(bobFlip.payload.faceUp).toBe(false);

    alice.close();
    bob.close();
  });
});

