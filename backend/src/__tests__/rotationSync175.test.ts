/**
 * rotationSync175.test.ts — M1.7.5 Part 2 & 3: Rotation Sync over the network
 *
 * Verifies the backend authority for card rotation end-to-end:
 * 1. object:drag-end carrying `rotation` stores it on the TABLE object and
 *    broadcasts the rotation to every OTHER client (seat default at HAND→TABLE).
 * 2. object:move (rotation sync channel) validates membership/lock/location,
 *    stores the rotation, and broadcasts object:moved to everyone EXCEPT the sender.
 * 3. Rejections: locked object → OBJECT_LOCKED; HAND object → INVALID_OPERATION;
 *    unknown object → OBJECT_NOT_FOUND.
 * 4. Validator: malformed position / non-finite rotation are rejected (both
 *    object:move and object:drag-end).
 * 5. Hand transfers never store rotation (hand privacy — M1.7.4.3 preserved).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage, ClientToServerMessage } from '../../../shared/types/protocol.js';

describe('M1.7.5 — Rotation sync (drag-end rotation + object:move)', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let roomManager: RoomManager;
  const PORT = 5571;

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

  /** Creates a 2-player room where Alice holds one drawn card. */
  async function setupRoom() {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'RotationSyncRoom' } });
    const joinedA = await alice.waitForMessage('room:joined');
    const roomId = (joinedA as { payload: { roomId: string } }).payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');
    await new Promise((r) => setTimeout(r, 60));

    alice.send({ type: 'card:draw' });
    const drawn = await alice.waitForMessage('hand:card-drawn');
    const cardId = (drawn as { payload: { card: { id: string } } }).payload.card.id;

    alice.clear();
    bob.clear();
    return { alice, bob, cardId, roomId };
  }

  // ─── 1. drag-end rotation (seat default at HAND→TABLE) ─────────────────────

  it('1. object:drag-end with rotation stores the TABLE yaw and broadcasts it to peers', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      const seatYaw = Math.PI; // e.g. opposite-seat default

      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 3, y: 0, z: 2, seq: 1, faceUp: true, rotation: seatYaw },
      });

      const dragEndB = await bob.waitForMessage('object:drag-end');
      const payloadB = (dragEndB as { payload: { objectId: string; rotation?: number; x: number } }).payload;
      expect(payloadB.objectId).toBe(cardId);
      expect(payloadB.rotation).toBeCloseTo(seatYaw, 9);

      // Authoritative room:state also carries the stored rotation.
      const stateB = await bob.waitForMessage('room:state');
      const objectsB = (stateB as { payload: { objects: Array<{ id: string; rotation: number; location: string }> } }).payload.objects;
      const stored = objectsB.find((o) => o.id === cardId)!;
      expect(stored.location).toBe('TABLE');
      expect(stored.rotation).toBeCloseTo(seatYaw, 9);

      // Alice (the sender) also receives room:state so her store converges.
      const stateA = await alice.waitForMessage('room:state');
      const objectsA = (stateA as { payload: { objects: Array<{ id: string; rotation: number }> } }).payload.objects;
      expect(objectsA.find((o) => o.id === cardId)!.rotation).toBeCloseTo(seatYaw, 9);
    } finally {
      alice.close();
      bob.close();
    }
  });

  it('2. TABLE drag-end updates the stored rotation (manual yaw travels with the drop)', async () => {
    const { alice, bob, cardId, roomId } = await setupRoom();
    try {
      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 3, y: 0, z: 2, seq: 1, faceUp: true, rotation: 0.5 },
      });
      await bob.waitForMessage('object:drag-end');
      await bob.waitForMessage('room:state');
      alice.clear();
      bob.clear();

      // Second drop on the table with a new manual yaw.
      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: -2, y: 0, z: 1, seq: 2, faceUp: true, rotation: 2.25 },
      });
      const dragEndB = await bob.waitForMessage('object:drag-end');
      expect((dragEndB as { payload: { rotation?: number } }).payload.rotation).toBeCloseTo(2.25, 9);

      // Location/owner unchanged → no room:state broadcast, but the rotation IS
      // persisted authoritatively: a fresh client reads the stored yaw on join.
      const carol = createClient();
      await carol.ready;
      carol.send({ type: 'room:join', payload: { roomId, playerName: 'Carol' } });
      const stateC = await carol.waitForMessage('room:state');
      const stored = (stateC as { payload: { objects: Array<{ id: string; rotation: number }> } })
        .payload.objects.find((o) => o.id === cardId)!;
      expect(stored.rotation).toBeCloseTo(2.25, 9);
      carol.close();
    } finally {
      alice.close();
      bob.close();
    }
  });

  // ─── 2. object:move — the rotation sync channel ────────────────────────────

  it('3. object:move stores rotation and broadcasts object:moved to everyone EXCEPT the sender', async () => {
    const { alice, bob, cardId, roomId } = await setupRoom();
    try {
      // First land the card on the table.
      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 3, y: 0, z: 2, seq: 1, faceUp: true, rotation: 0 },
      });
      await bob.waitForMessage('object:drag-end');
      await bob.waitForMessage('room:state');
      alice.clear();
      bob.clear();

      const newRotation = 1.5707963267948966; // π/2 from the wheel
      bob.send({
        type: 'object:move',
        payload: { objectId: cardId, position: { x: 4, y: 0, z: -1 }, rotation: newRotation },
      });

      // Alice (the non-sender) receives object:moved with position + rotation.
      const movedA = await alice.waitForMessage('object:moved');
      const payloadA = (movedA as { payload: { id: string; rotation: number; position: { x: number; z: number } } }).payload;
      expect(payloadA.id).toBe(cardId);
      expect(payloadA.rotation).toBeCloseTo(newRotation, 9);
      expect(payloadA.position.x).toBeCloseTo(4, 6);
      expect(payloadA.position.z).toBeCloseTo(-1, 6);

      // Sender is excluded from the broadcast.
      await new Promise((r) => setTimeout(r, 80));
      expect(bob.messages.filter((m) => m.type === 'object:moved')).toHaveLength(0);

      // The rotation persisted authoritatively — verified through a fresh join.
      const carol = createClient();
      await carol.ready;
      carol.send({ type: 'room:join', payload: { roomId, playerName: 'Carol' } });
      const stateC = await carol.waitForMessage('room:state');
      const storedC = (stateC as { payload: { objects: Array<{ id: string; rotation: number }> } })
        .payload.objects.find((o) => o.id === cardId)!;
      expect(storedC.rotation).toBeCloseTo(newRotation, 9);
      carol.close();
    } finally {
      alice.close();
      bob.close();
    }
  });

  it('4. object:move on a locked object is rejected with OBJECT_LOCKED (no broadcast)', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 3, y: 0, z: 2, seq: 1, faceUp: true, rotation: 0 },
      });
      await bob.waitForMessage('object:drag-end');
      await bob.waitForMessage('room:state');
      alice.clear();
      bob.clear();

      // Alice takes the drag lock.
      alice.send({ type: 'object:drag-start', payload: { objectId: cardId, x: 3, y: 0, z: 2, seq: 2 } });
      await new Promise((r) => setTimeout(r, 60));

      // Bob tries to rotate the locked card.
      bob.send({
        type: 'object:move',
        payload: { objectId: cardId, position: { x: 3, y: 0, z: 2 }, rotation: 1.1 },
      });

      const err = await bob.waitForMessage('error');
      const payload = (err as { payload: { code?: string; objectId?: string } }).payload;
      expect(payload.code).toBe('OBJECT_LOCKED');
      expect(payload.objectId).toBe(cardId);

      // Nobody received a rotation broadcast.
      await new Promise((r) => setTimeout(r, 60));
      expect(alice.messages.filter((m) => m.type === 'object:moved')).toHaveLength(0);
      expect(bob.messages.filter((m) => m.type === 'object:moved')).toHaveLength(0);
    } finally {
      alice.close();
      bob.close();
    }
  });

  it('5. object:move on a HAND object is rejected with INVALID_OPERATION (privacy)', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      // Card is still in Alice's hand — rotation of hand cards is local-only.
      bob.send({
        type: 'object:move',
        payload: { objectId: cardId, position: { x: 0, y: 0, z: 0 }, rotation: 3.14 },
      });

      const err = await bob.waitForMessage('error');
      const payload = (err as { payload: { code?: string; objectId?: string } }).payload;
      expect(payload.code).toBe('INVALID_OPERATION');
      expect(payload.objectId).toBe(cardId);

      await new Promise((r) => setTimeout(r, 60));
      expect(alice.messages.filter((m) => m.type === 'object:moved')).toHaveLength(0);
    } finally {
      alice.close();
      bob.close();
    }
  });

  it('6. object:move for an unknown object is rejected with OBJECT_NOT_FOUND', async () => {
    const { alice, bob } = await setupRoom();
    try {
      bob.send({
        type: 'object:move',
        payload: { objectId: 'no_such_card', position: { x: 0, y: 0, z: 0 }, rotation: 1 },
      });
      const err = await bob.waitForMessage('error');
      expect((err as { payload: { code?: string } }).payload.code).toBe('OBJECT_NOT_FOUND');
    } finally {
      alice.close();
      bob.close();
    }
  });

  // ─── 4. Validator rules ────────────────────────────────────────────────────

  it('7. Validator rejects malformed object:move payloads with INVALID_FORMAT', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      // Missing position.
      bob.send({ type: 'object:move', payload: { objectId: cardId, rotation: 1 } as never });
      let err = await bob.waitForMessage('error');
      expect((err as { payload: { code?: string } }).payload.code).toBe('INVALID_FORMAT');

      // Non-finite rotation.
      bob.send({ type: 'object:move', payload: { objectId: cardId, position: { x: 0, y: 0, z: 0 }, rotation: 'bad' } as never });
      err = await bob.waitForMessage('error');
      expect((err as { payload: { code?: string } }).payload.code).toBe('INVALID_FORMAT');

      // Position out of world bounds.
      bob.send({ type: 'object:move', payload: { objectId: cardId, position: { x: 500, y: 0, z: 0 }, rotation: 1 } });
      err = await bob.waitForMessage('error');
      expect((err as { payload: { code?: string } }).payload.code).toBe('INVALID_FORMAT');
    } finally {
      alice.close();
      bob.close();
    }
  });

  it('8. Validator rejects non-finite drag-end rotation with INVALID_FORMAT', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      alice.send({
        type: 'object:drag-end',
        payload: { objectId: cardId, x: 1, y: 0, z: 1, seq: 1, rotation: NaN } as never,
      });
      const err = await alice.waitForMessage('error');
      expect((err as { payload: { code?: string } }).payload.code).toBe('INVALID_FORMAT');
      void bob;
      void cardId;
    } finally {
      alice.close();
      bob.close();
    }
  });

  // ─── 5. Hand privacy (M1.7.4.3 preserved) ──────────────────────────────────

  it('9. Hand transfer via drag-end ignores rotation — hand transforms stay private', async () => {
    const { alice, bob, cardId } = await setupRoom();
    try {
      // Alice drops her card into Bob's hand WITH a rotation attached.
      const bobIndex = 1;
      alice.send({
        type: 'object:drag-end',
        payload: {
          objectId: cardId,
          x: 0,
          y: 0,
          z: -6,
          seq: 1,
          faceUp: false,
          targetPlayerIndex: bobIndex,
          rotation: 2.75,
        },
      });

      // Membership change is communicated via room:state / hand:card-transferred,
      // never a raw drag-end with a private transform.
      await new Promise((r) => setTimeout(r, 120));
      expect(bob.messages.filter((m) => m.type === 'object:drag-end')).toHaveLength(0);

      const stateB = await bob.waitForMessage('room:state');
      const stored = (stateB as { payload: { objects: Array<{ id: string; location: string; rotation: number; ownerId: string | null }> } })
        .payload.objects.find((o) => o.id === cardId)!;
      expect(stored.location).toBe('HAND');
      expect(stored.ownerId).not.toBeNull();
      // The hand transfer path must NOT have applied the rotation.
      expect(stored.rotation).not.toBeCloseTo(2.75, 6);
    } finally {
      alice.close();
      bob.close();
    }
  });
});
