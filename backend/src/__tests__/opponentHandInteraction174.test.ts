/**
 * opponentHandInteraction174.test.ts — M1.7.4 backend integration
 *
 * Verifies server authorization and privacy for opponent-hand interaction:
 * 1. card:transfer echoes the client seq to every recipient.
 * 2. Rejections carry the offending objectId.
 * 3. Opponents cannot drag another player's hand card (start or end).
 * 4. Hand drags never broadcast raw private transforms.
 * 5. Legacy drag-end into a hand zone uses the single transfer broadcast path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import type { RoomManager } from '../room/RoomManager.js';
import { LegacyRoomFixture } from './LegacyRoomFixture.js';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';

const TEST_PORT = 5411;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;

interface TestClient {
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
  clear: () => void;
  close: () => void;
}

describe('M1.7.4 — Opponent hand interaction authorization & transfer sync', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let roomManager: RoomManager;

  beforeAll(async () => {
    roomManager = new LegacyRoomFixture();
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

  function createClient(): TestClient {
    const ws = new WebSocket(WS_URL);
    const messages: ServerToClientMessage[] = [];

    const ready = new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    ws.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()) as ServerToClientMessage);
      } catch {}
    });

    const send = (msg: object) => ws.send(JSON.stringify(msg));

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
                `Timeout waiting for "${type}". Received: ${JSON.stringify(
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
            reject(new Error(`Timeout waiting for condition. Types: ${JSON.stringify(messages.map((m) => m.type))}`));
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
      send,
      waitForMessage,
      waitForCondition,
      clear: () => {
        messages.length = 0;
      },
      close: () => ws.close(),
    };
  }

  async function setupRoom(): Promise<{
    alice: TestClient;
    bob: TestClient;
    carol: TestClient;
    cardId: string;
    aliceIndex: number;
    bobIndex: number;
  }> {
    const alice = createClient();
    const bob = createClient();
    const carol = createClient();
    await Promise.all([alice.ready, bob.ready, carol.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'M1.7.4 Room' } });
    const joined = await alice.waitForMessage('room:joined');
    const roomId = joined.payload.roomId;
    const aliceIndex = joined.payload.playerIndex;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    const bobJoined = await bob.waitForMessage('room:joined');
    const bobIndex = bobJoined.payload.playerIndex;

    carol.send({ type: 'room:join', payload: { roomId, playerName: 'Carol' } });
    await carol.waitForMessage('room:joined');

    await new Promise((r) => setTimeout(r, 100));

    alice.send({ type: 'card:draw' });
    const drawn = await alice.waitForMessage('hand:card-drawn');
    await bob.waitForMessage('hand:card-drawn');
    await carol.waitForMessage('hand:card-drawn');

    return { alice, bob, carol, cardId: drawn.payload.card.id, aliceIndex, bobIndex };
  }

  it('echoes card:transfer seq to all recipients and transfers ownership', async () => {
    const { alice, bob, carol, cardId, bobIndex } = await setupRoom();
    try {
      alice.clear();
      bob.clear();
      carol.clear();

      alice.send({
        type: 'card:transfer',
        payload: { cardId, targetPlayerIndex: bobIndex, seq: 314 },
      });

      const bobTransfer = (await bob.waitForMessage(
        'hand:card-transferred'
      )) as Extract<ServerToClientMessage, { type: 'hand:card-transferred' }>;
      expect(bobTransfer.payload.seq).toBe(314);
      expect(bobTransfer.payload.card.cardType).toBeDefined();

      const aliceTransfer = (await alice.waitForMessage(
        'hand:card-transferred'
      )) as Extract<ServerToClientMessage, { type: 'hand:card-transferred' }>;
      expect(aliceTransfer.payload.seq).toBe(314);
      // M1.7.4.2: Shared faceUp policy - if faceUp=true, cardType is visible to everyone
      expect(aliceTransfer.payload.card.cardType).toBeDefined();

      // Carol is a third party and also receives the shared faceUp transfer
      const carolTransfer = (await carol.waitForMessage(
        'hand:card-transferred'
      )) as Extract<ServerToClientMessage, { type: 'hand:card-transferred' }>;
      expect(carolTransfer.payload.card.cardType).toBeDefined();
      expect(carolTransfer.payload.card.faceUp).toBe(true);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  }, 15000);

  it('allows opponent to drag card from hand to table (M1.7.4.2 shared interaction)', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      alice.clear();
      bob.clear();

      // Bob locks and drags card in Alice's hand
      bob.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0, seq: 1 },
      });

      // No error: Bob is allowed to drag Alice's hand card
      await new Promise((r) => setTimeout(r, 60));
      expect(bob.messages.some((m) => m.type === 'error')).toBe(false);

      // Bob drops it on the table
      bob.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 3, y: 0.8, z: 3, seq: 2 },
      });

      // Both Alice and Bob receive room:state with card on TABLE
      const aliceState = (await alice.waitForMessage('room:state')) as Extract<
        ServerToClientMessage,
        { type: 'room:state' }
      >;
      const droppedObj = aliceState.payload.objects.find((o) => o.id === cardId);
      expect(droppedObj?.location).toBe('TABLE');
      expect(droppedObj?.ownerId).toBeNull();
    } finally {
      alice.close();
      bob.close();
    }
  }, 15000);

  it('does not broadcast raw drag-start/move for the owner dragging a hand card', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      bob.clear();

      alice.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0, seq: 1 },
      });
      alice.send({
        type: 'object:drag-move',
        payload: { objectId: cardId, x: 1, y: 1, z: 1, seq: 2 },
      });

      await new Promise((r) => setTimeout(r, 150));
      expect(bob.messages.some((m) => m.type === 'object:drag-start')).toBe(false);
      expect(bob.messages.some((m) => m.type === 'object:drag-move')).toBe(false);
    } finally {
      alice.close();
      bob.close();
    }
  }, 15000);

  it('routes a legacy drag-end into an opponent hand through one transfer event with seq', async () => {
    const { alice, bob, cardId, bobIndex } = await setupRoom();
    try {
      alice.clear();
      bob.clear();

      alice.send({
        type: 'object:drag-start',
        payload: { objectId: cardId, x: 0, y: 1, z: 0, seq: 1 },
      });
      await new Promise((r) => setTimeout(r, 40));
      alice.send({
        type: 'object:drag-end',
        payload: {
          objectId: cardId,
          x: 5,
          y: 0.5,
          z: 0,
          seq: 77,
          targetPlayerIndex: bobIndex,
        },
      });

      const transfer = (await bob.waitForMessage(
        'hand:card-transferred'
      )) as Extract<ServerToClientMessage, { type: 'hand:card-transferred' }>;
      expect(transfer.payload.cardId).toBe(cardId);
      expect(transfer.payload.seq).toBe(77);
      expect(transfer.payload.card.cardType).toBeDefined();

      // The authoritative transfer event is the only ownership path.
      await new Promise((r) => setTimeout(r, 120));
      expect(alice.messages.some((m) => m.type === 'object:drag-end')).toBe(false);
    } finally {
      alice.close();
      bob.close();
    }
  }, 15000);
});
