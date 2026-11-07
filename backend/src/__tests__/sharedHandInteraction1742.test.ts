/**
 * sharedHandInteraction1742.test.ts — M1.7.4.2 Full Shared Card Interaction & Direct Hand Transfer
 *
 * Verifies sandbox rules:
 * 1. Member B flips Card in Hand A -> PASS (both see updated faceUp and cardType if faceUp).
 * 2. Member B drags Card from Hand A to Table -> PASS (location='TABLE', ownerId=null).
 * 3. Member B drags Card from Hand A directly to Hand B -> PASS (location='HAND', ownerId=B).
 * 4. Member B drags Card from Hand A directly to Hand C -> PASS (location='HAND', ownerId=C).
 * 5. Member B drags Card on Table to Hand C -> PASS (location='HAND', ownerId=C).
 * 6. Concurrency: dragLock rejects simultaneous drag attempt by another player with OBJECT_LOCKED.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage, ClientToServerMessage } from '../../../shared/types/protocol.js';

describe('M1.7.4.2 — Full Shared Card Interaction & Direct Hand Transfer', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let roomManager: RoomManager;
  const PORT = 5510;

  beforeAll(async () => {
    roomManager = new RoomManager();
    httpServer = new HttpServer(PORT);
    wsServer = new WebSocketServer(httpServer.getServer(), roomManager);
    httpServer.start();
    wsServer.start();
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    wsServer.shutdown();
    httpServer.stop();
  });

  interface TestClient {
    messages: ServerToClientMessage[];
    ready: Promise<void>;
    send: (msg: ClientToServerMessage) => void;
    waitForMessage: (type: ServerToClientMessage['type'], timeoutMs?: number) => Promise<ServerToClientMessage>;
    clear: () => void;
    close: () => void;
  }

  function createClient(): TestClient {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const messages: ServerToClientMessage[] = [];

    const ready = new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    ws.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()) as ServerToClientMessage);
      } catch {}
    });

    const waitForMessage = (type: ServerToClientMessage['type'], timeoutMs = 4000): Promise<ServerToClientMessage> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const idx = messages.findIndex((m) => m.type === type);
          if (idx >= 0) {
            resolve(messages.splice(idx, 1)[0]!);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for "${type}". Received: ${JSON.stringify(messages.map((m) => m.type))}`));
            return;
          }
          setTimeout(check, 20);
        };
        check();
      });
    };

    return {
      messages,
      ready,
      send: (msg) => ws.send(JSON.stringify(msg)),
      waitForMessage,
      clear: () => {
        messages.length = 0;
      },
      close: () => ws.close(),
    };
  }

  async function setupThreePlayerRoom() {
    const alice = createClient();
    const bob = createClient();
    const carol = createClient();
    await Promise.all([alice.ready, bob.ready, carol.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'SharedSandboxRoom' } });
    const joinedA = await alice.waitForMessage('room:joined');
    const roomId = (joinedA as any).payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    carol.send({ type: 'room:join', payload: { roomId, playerName: 'Carol' } });
    await carol.waitForMessage('room:joined');

    await new Promise((r) => setTimeout(r, 60));

    // Alice draws card
    alice.send({ type: 'card:draw' });
    const drawnA = await alice.waitForMessage('hand:card-drawn');
    const cardId = (drawnA as any).payload.card.id;

    alice.clear();
    bob.clear();
    carol.clear();

    return { alice, bob, carol, cardId, roomId };
  }

  it('1. Member B flips Card in Hand A -> allowed, all 3 receive object:flipped with faceUp', async () => {
    const { alice, bob, carol, cardId } = await setupThreePlayerRoom();
    try {
      // Bob flips Alice's card (currently faceUp: true)
      bob.send({ type: 'object:flip', payload: { objectId: cardId } });

      const flipA = await alice.waitForMessage('object:flipped');
      const flipB = await bob.waitForMessage('object:flipped');
      const flipC = await carol.waitForMessage('object:flipped');

      expect((flipA as any).payload.objectId).toBe(cardId);
      expect((flipA as any).payload.faceUp).toBe(false);
      expect((flipB as any).payload.faceUp).toBe(false);
      expect((flipC as any).payload.faceUp).toBe(false);

      // Alice flips it back face up
      alice.clear();
      bob.clear();
      carol.clear();
      alice.send({ type: 'object:flip', payload: { objectId: cardId } });

      const flipBackB = await bob.waitForMessage('object:flipped');
      expect((flipBackB as any).payload.faceUp).toBe(true);
      expect((flipBackB as any).payload.cardType).toBeDefined();
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });

  it('2. Member B drags Card from Hand A to Table -> allowed, location becomes TABLE, ownerId becomes null', async () => {
    const { alice, bob, carol, cardId } = await setupThreePlayerRoom();
    try {
      bob.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });
      await new Promise((r) => setTimeout(r, 40));

      bob.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 2, y: 0.8, z: 1, targetPlayerIndex: null },
      });

      const stateA = (await alice.waitForMessage('room:state')) as any;
      const cardObj = stateA.payload.objects.find((o: any) => o.id === cardId);
      expect(cardObj.location).toBe('TABLE');
      expect(cardObj.ownerId).toBeNull();
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });

  it('3. Member B drags Card from Hand A directly to Hand B -> allowed, location becomes HAND, ownerId becomes B', async () => {
    const { alice, bob, carol, cardId } = await setupThreePlayerRoom();
    try {
      // Bob's index is 1
      bob.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });
      await new Promise((r) => setTimeout(r, 40));

      bob.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 0, y: 0.1, z: 7, targetPlayerIndex: 1 },
      });

      const transferMsg = (await bob.waitForMessage('hand:card-transferred')) as any;
      expect(transferMsg.payload.cardId).toBe(cardId);
      expect(transferMsg.payload.fromPlayerIndex).toBe(0);
      expect(transferMsg.payload.toPlayerIndex).toBe(1);

      const stateA = (await alice.waitForMessage('room:state')) as any;
      const cardObj = stateA.payload.objects.find((o: any) => o.id === cardId);
      expect(cardObj.location).toBe('HAND');
      // Owner is Bob
      const bobRecord = stateA.payload.players.find((p: any) => p.name === 'Bob');
      expect(cardObj.ownerId).toBe(bobRecord.id);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });

  it('4. Member B drags Card from Hand A directly to Hand C -> allowed, location becomes HAND, ownerId becomes C', async () => {
    const { alice, bob, carol, cardId } = await setupThreePlayerRoom();
    try {
      // Carol's index is 2
      bob.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });
      await new Promise((r) => setTimeout(r, 40));

      bob.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 7, y: 0.1, z: 0, targetPlayerIndex: 2 },
      });

      const transferMsg = (await carol.waitForMessage('hand:card-transferred')) as any;
      expect(transferMsg.payload.cardId).toBe(cardId);
      expect(transferMsg.payload.toPlayerIndex).toBe(2);

      const stateC = (await carol.waitForMessage('room:state')) as any;
      const cardObj = stateC.payload.objects.find((o: any) => o.id === cardId);
      expect(cardObj.location).toBe('HAND');
      const carolRecord = stateC.payload.players.find((p: any) => p.name === 'Carol');
      expect(cardObj.ownerId).toBe(carolRecord.id);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });

  it('5. Member B drags Card on Table to Hand C -> allowed, location becomes HAND, ownerId becomes C', async () => {
    const { alice, bob, carol, cardId } = await setupThreePlayerRoom();
    try {
      // First Alice drags card to table
      alice.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });
      await new Promise((r) => setTimeout(r, 40));
      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 0, y: 0.8, z: 0, targetPlayerIndex: null },
      });
      await alice.waitForMessage('room:state');
      await bob.waitForMessage('room:state');
      await carol.waitForMessage('room:state');

      alice.clear();
      bob.clear();
      carol.clear();

      // Bob drags table card into Carol's hand (index 2)
      bob.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });
      await new Promise((r) => setTimeout(r, 40));

      bob.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 7, y: 0.1, z: 0, targetPlayerIndex: 2 },
      });

      const transferMsg = (await carol.waitForMessage('hand:card-transferred')) as any;
      expect(transferMsg.payload.cardId).toBe(cardId);
      expect(transferMsg.payload.toPlayerIndex).toBe(2);

      const stateC = (await carol.waitForMessage('room:state')) as any;
      const cardObj = stateC.payload.objects.find((o: any) => o.id === cardId);
      expect(cardObj.location).toBe('HAND');
      const carolRecord = stateC.payload.players.find((p: any) => p.name === 'Carol');
      expect(cardObj.ownerId).toBe(carolRecord.id);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });

  it('6. Concurrency: dragLock rejects simultaneous drag attempt by another player with OBJECT_LOCKED', async () => {
    const { alice, bob, carol, cardId } = await setupThreePlayerRoom();
    try {
      // Bob locks cardId
      bob.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });
      await new Promise((r) => setTimeout(r, 40));

      // Alice tries to lock the same card concurrently -> rejected with OBJECT_LOCKED
      alice.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0 },
      });

      const err = (await alice.waitForMessage('error')) as any;
      expect(err.payload.code).toBe('OBJECT_LOCKED');
      expect(err.payload.objectId).toBe(cardId);

      // Once Bob drops it, the lock is released
      bob.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 1, y: 0.8, z: 1 },
      });
      await new Promise((r) => setTimeout(r, 50));

      // Alice can now lock and drag the card
      alice.clear();
      alice.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 1, y: 1, z: 1 },
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(alice.messages.some((m) => m.type === 'error')).toBe(false);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });
});
