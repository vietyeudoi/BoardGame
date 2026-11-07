/**
 * multiplayerSync153.test.ts — M1.5.3 Backend Multiplayer Sync & Remote Cursor Tests
 *
 * Integration tests verifying:
 * 1. cursor:move is broadcast to all other clients in the room.
 * 2. cursor:move from a client NOT in a room is rejected or ignored.
 * 3. cursor:move with out-of-range coordinates is rejected with error.
 * 4. object:drag-start broadcasts to other clients.
 * 5. object:drag-end broadcasts to other clients.
 * 6. object:drag-move with invalid objectId is rejected with error.
 * 7. Cursor position is NOT stored in Room state.
 * 8. Clients in different rooms do NOT receive each other's cursors.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';

const TEST_PORT = 5200;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;

describe('M1.5.3 — Multiplayer Sync (cursor & drag)', () => {
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

    const close = () => {
      ws.close();
    };

    return { ws, messages, ready, send, waitForMessage, close };
  }

  // ─── 1. cursor:move broadcasts to other clients ──────────────────────────

  it('cursor:move broadcasts cursor:update to other clients in the room', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'CursorRoom' } });
    const joined = await alice.waitForMessage('room:joined');
    const roomId = joined.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Alice moves cursor
    alice.send({ type: 'cursor:move', payload: { x: 3.5, z: -2.0, seq: 1 } });

    const cursorUpdate = await bob.waitForMessage('cursor:update');
    expect(cursorUpdate.payload.x).toBeCloseTo(3.5, 2);
    expect(cursorUpdate.payload.z).toBeCloseTo(-2.0, 2);
    expect(cursorUpdate.payload.seq).toBe(1);

    alice.close();
    bob.close();
  });

  // ─── 2. cursor:move from client NOT in a room — safely ignored ───────────

  it('cursor:move from a client not in any room is safely ignored', async () => {
    const guest = createClient();
    await guest.ready;

    // Send cursor:move without joining a room
    guest.send({ type: 'cursor:move', payload: { x: 1, z: 1, seq: 0 } });

    // Send ping to verify connection is alive and healthy
    guest.send({ type: 'ping' });
    const pong = await guest.waitForMessage('pong');
    expect(pong).toBeDefined();

    guest.close();
  });

  // ─── 3. cursor:move with invalid coords is rejected with error ───────────

  it('cursor:move with coordinates outside [-50, 50] is rejected with error', async () => {
    const alice = createClient();
    await alice.ready;

    alice.send({ type: 'room:create', payload: { roomName: 'ValidateRoom' } });
    await alice.waitForMessage('room:joined');

    // Send out of bounds X
    alice.send({ type: 'cursor:move', payload: { x: 999, z: 0, seq: 0 } });
    const errorMsg = await alice.waitForMessage('error');
    expect(errorMsg.payload.code).toBe('INVALID_FORMAT');

    alice.close();
  });

  // ─── 4. object:drag-start broadcasts to other clients ────────────────────

  it('object:drag-start broadcasts to other clients in the room', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'DragStartRoom' } });
    const joined = await alice.waitForMessage('room:joined');
    const roomId = joined.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    alice.send({
      type: 'object:drag-start',
      payload: { objectId: 'card-101', x: 2.0, y: 0.5, z: -1.0 },
    });

    const dragStart = await bob.waitForMessage('object:drag-start');
    expect(dragStart.payload.objectId).toBe('card-101');
    expect(dragStart.payload.x).toBeCloseTo(2.0, 2);
    expect(dragStart.payload.playerId).toBeDefined();

    alice.close();
    bob.close();
  });

  // ─── 5. object:drag-end broadcasts to other clients ──────────────────────

  it('object:drag-end broadcasts to other clients in the room', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'DragEndRoom' } });
    const joined = await alice.waitForMessage('room:joined');
    const roomId = joined.payload.roomId;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    alice.send({
      type: 'object:drag-end',
      payload: { objectId: 'card-101', x: 4.5, y: 0.0, z: -2.5 },
    });

    const dragEnd = await bob.waitForMessage('object:drag-end');
    expect(dragEnd.payload.objectId).toBe('card-101');
    expect(dragEnd.payload.x).toBeCloseTo(4.5, 2);

    alice.close();
    bob.close();
  });

  // ─── 6. object:drag-move with invalid objectId is rejected ───────────────

  it('object:drag-move with empty objectId string is rejected', async () => {
    const alice = createClient();
    await alice.ready;

    alice.send({ type: 'room:create', payload: { roomName: 'ValidateDragRoom' } });
    await alice.waitForMessage('room:joined');

    alice.send({
      type: 'object:drag-move',
      payload: { objectId: '', x: 1, y: 0, z: 1, seq: 0 },
    });

    const errorMsg = await alice.waitForMessage('error');
    expect(errorMsg.payload.code).toBe('INVALID_FORMAT');

    alice.close();
  });

  // ─── 7. Cursor position NOT stored in Room state ──────────────────────────

  it('cursor:move does NOT pollute or expand room:state objects', async () => {
    const alice = createClient();
    const bob = createClient();
    await Promise.all([alice.ready, bob.ready]);

    alice.send({ type: 'room:create', payload: { roomName: 'StatePollutionRoom' } });
    const joined = await alice.waitForMessage('room:joined');
    const roomId = joined.payload.roomId;
    const initialState = await alice.waitForMessage('room:state');
    const originalCount = initialState.payload.objects.length;

    bob.send({ type: 'room:join', payload: { roomId, playerName: 'Bob' } });
    await bob.waitForMessage('room:joined');

    // Bob sends several cursor:move messages
    bob.send({ type: 'cursor:move', payload: { x: 5.0, z: 5.0, seq: 1 } });
    bob.send({ type: 'cursor:move', payload: { x: 6.0, z: 6.0, seq: 2 } });

    // Wait for Alice to receive cursor updates
    await alice.waitForMessage('cursor:update');

    // Verify room state objects array in roomManager has not gained cursor objects
    const room = roomManager.getRoom(roomId);
    expect(room).toBeDefined();
    expect(room!.getRawState().objects.length).toBe(originalCount);

    alice.close();
    bob.close();
  });

  // ─── 8. Clients in different rooms don't receive each other's cursors ─────

  it('cursor:move is NOT broadcast to clients in different rooms', async () => {
    const alice = createClient();
    const carol = createClient();
    await Promise.all([alice.ready, carol.ready]);

    // Alice creates Room A
    alice.send({ type: 'room:create', payload: { roomName: 'Room A' } });
    await alice.waitForMessage('room:joined');

    // Carol creates Room B
    carol.send({ type: 'room:create', payload: { roomName: 'Room B' } });
    await carol.waitForMessage('room:joined');

    // Alice moves cursor in Room A
    alice.send({ type: 'cursor:move', payload: { x: 10, z: 10, seq: 1 } });

    // Carol pings to verify she receives her pong without any cursor:update
    carol.send({ type: 'ping' });
    await carol.waitForMessage('pong');

    const carolReceivedCursor = carol.messages.some((m) => m.type === 'cursor:update');
    expect(carolReceivedCursor).toBe(false);

    alice.close();
    carol.close();
  });
});
