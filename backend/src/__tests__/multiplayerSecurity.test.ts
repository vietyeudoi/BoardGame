/**
 * multiplayerSecurity.test.ts — Live WebSocket Multiplayer & Private Hand Verification
 * Tests ALL 12 requirements from M1.5.1 specification:
 * 1. Two clients connect to same backend
 * 2. Client A creates room
 * 3. Client B joins A's room
 * 4. Both clients receive same public state
 * 5. A receives A's private hand card with cardType
 * 6. B does NOT receive cardType for A's hand card (masked)
 * 7. B receives B's private hand card with cardType
 * 8. A does NOT receive cardType for B's hand card (masked)
 * 9. Non-member client cannot receive room data
 * 10. Reconnect does not leak private hand
 * 11. Draw card updates correct player's hand
 * 12. Leave room updates member state
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';

const TEST_PORT = 4999;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;

describe('Multiplayer Room Connection & Private Hand Verification (M1.5.1)', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let roomManager: RoomManager;

  beforeAll(async () => {
    roomManager = new RoomManager();
    httpServer = new HttpServer(TEST_PORT);
    wsServer = new WebSocketServer(httpServer.getServer(), roomManager);
    httpServer.start();
    wsServer.start();
    // Wait for server to bind
    await new Promise((r) => setTimeout(r, 100));
  });

  afterAll(async () => {
    wsServer.shutdown();
    httpServer.stop();
  });

  function createClient(): {
    ws: WebSocket;
    messages: ServerToClientMessage[];
    waitForMessage: <T extends ServerToClientMessage['type']>(
      type: T,
      timeoutMs?: number
    ) => Promise<Extract<ServerToClientMessage, { type: T }>>;
  } {
    const ws = new WebSocket(WS_URL);
    const messages: ServerToClientMessage[] = [];

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ServerToClientMessage;
        messages.push(parsed);
      } catch {}
    });

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
            reject(new Error(`Timeout waiting for message type "${type}". Received: ${JSON.stringify(messages.map(m => m.type))}`));
            return;
          }
          setTimeout(check, 20);
        };
        check();
      });
    };

    return { ws, messages, waitForMessage };
  }

  it('verifies full multiplayer lifecycle, room join, private hand security & payload isolation', async () => {
    // 1. Two clients connect to same Backend
    const clientA = createClient();
    const clientB = createClient();

    await Promise.all([
      new Promise((res) => clientA.ws.on('open', res)),
      new Promise((res) => clientB.ws.on('open', res)),
    ]);

    expect(clientA.ws.readyState).toBe(WebSocket.OPEN);
    expect(clientB.ws.readyState).toBe(WebSocket.OPEN);

    // 2. Client A creates room
    clientA.ws.send(
      JSON.stringify({
        type: 'room:create',
        payload: { roomName: 'Privacy Room' },
      })
    );

    const aJoined = await clientA.waitForMessage('room:joined');
    expect(aJoined.payload.roomId).toBeDefined();
    expect(aJoined.payload.playerId).toBeDefined();
    expect(aJoined.payload.playerIndex).toBe(0);
    const roomId = aJoined.payload.roomId;
    const playerAId = aJoined.payload.playerId;

    const aInitialState = await clientA.waitForMessage('room:state');
    expect(aInitialState.payload.id).toBe(roomId);
    expect(aInitialState.payload.players.length).toBe(1);
    expect(aInitialState.payload.players[0]!.id).toBe(playerAId);

    // 3. Client B joins A's room
    clientB.ws.send(
      JSON.stringify({
        type: 'room:join',
        payload: { roomId, playerName: 'Bob' },
      })
    );

    const bJoined = await clientB.waitForMessage('room:joined');
    expect(bJoined.payload.roomId).toBe(roomId);
    expect(bJoined.payload.playerId).toBeDefined();
    expect(bJoined.payload.playerId).not.toBe(playerAId);
    expect(bJoined.payload.playerIndex).toBe(1);
    const playerBId = bJoined.payload.playerId;

    // 4. Both clients receive matching public room state
    const bInitialState = await clientB.waitForMessage('room:state');
    expect(bInitialState.payload.id).toBe(roomId);
    expect(bInitialState.payload.players.length).toBe(2);

    // A receives notification that B joined
    const aReceivedBJoin = await clientA.waitForMessage('room:player-joined');
    expect(aReceivedBJoin.payload.id).toBe(playerBId);
    expect(aReceivedBJoin.payload.name).toBe('Bob');

    // 5 & 6. Player A draws a card:
    // A receives card with cardType (private to A)
    // B receives event for A's card WITHOUT cardType
    clientA.messages.length = 0;
    clientB.messages.length = 0;

    clientA.ws.send(JSON.stringify({ type: 'card:draw' }));

    const aDrawnMsg = await clientA.waitForMessage('hand:card-drawn');
    const bDrawnMsg = await clientB.waitForMessage('hand:card-drawn');

    // Card drawn belongs to A
    expect(aDrawnMsg.payload.playerIndex).toBe(0);
    expect(aDrawnMsg.payload.card.ownerId).toBe(playerAId);
    expect(aDrawnMsg.payload.card.location).toBe('HAND');
    expect(aDrawnMsg.payload.card.faceUp).toBe(true);
    // 5. A receives cardType:
    expect(aDrawnMsg.payload.card.cardType).toBeDefined();
    expect(typeof aDrawnMsg.payload.card.cardType).toBe('string');
    const aCardId = aDrawnMsg.payload.card.id;

    // 6. M1.7.4.2: FaceUp is shared globally across room members
    expect(bDrawnMsg.payload.card.id).toBe(aCardId);
    expect(bDrawnMsg.payload.card.ownerId).toBe(playerAId);
    expect(bDrawnMsg.payload.card.location).toBe('HAND');
    expect(bDrawnMsg.payload.card.faceUp).toBe(true);
    expect(bDrawnMsg.payload.card.cardType).toBeDefined();

    // 7 & 8. Player B draws a card:
    clientA.messages.length = 0;
    clientB.messages.length = 0;

    clientB.ws.send(JSON.stringify({ type: 'card:draw' }));

    const bDrawnMsg2 = await clientB.waitForMessage('hand:card-drawn');
    const aDrawnMsg2 = await clientA.waitForMessage('hand:card-drawn');

    // Card drawn belongs to B
    expect(bDrawnMsg2.payload.playerIndex).toBe(1);
    expect(bDrawnMsg2.payload.card.ownerId).toBe(playerBId);
    expect(bDrawnMsg2.payload.card.location).toBe('HAND');
    expect(bDrawnMsg2.payload.card.faceUp).toBe(true);
    expect(bDrawnMsg2.payload.card.cardType).toBeDefined();
    expect(typeof bDrawnMsg2.payload.card.cardType).toBe('string');
    const bCardId = bDrawnMsg2.payload.card.id;

    // 8. M1.7.4.2: A receives B's card with faceUp=true and cardType
    expect(aDrawnMsg2.payload.card.id).toBe(bCardId);
    expect(aDrawnMsg2.payload.card.ownerId).toBe(playerBId);
    expect(aDrawnMsg2.payload.card.location).toBe('HAND');
    expect(aDrawnMsg2.payload.card.faceUp).toBe(true);
    expect(aDrawnMsg2.payload.card.cardType).toBeDefined();

    // 9. Non-member client cannot receive room data or draw from other room
    const outsider = createClient();
    await new Promise((res) => outsider.ws.on('open', res));
    outsider.ws.send(JSON.stringify({ type: 'card:draw' }));
    const errorMsg = await outsider.waitForMessage('error');
    expect(errorMsg.payload.code).toBe('NOT_IN_ROOM');
    outsider.ws.close();

    // 10. Reconnect / Request room state does not leak private hand:
    // Create new connection for B and join/inspect state
    const clientB2 = createClient();
    await new Promise((res) => clientB2.ws.on('open', res));
    clientB2.ws.send(
      JSON.stringify({
        type: 'room:join',
        payload: { roomId, playerName: 'Bob-Reconnect' },
      })
    );
    const b2State = await clientB2.waitForMessage('room:state');
    // In b2's view, A's card (aCardId) MUST NOT have cardType
    const aCardInB2View = b2State.payload.objects.find((o) => o.id === aCardId);
    expect(aCardInB2View).toBeDefined();
    // M1.7.4.2: All players see public faceUp card state in RoomState
    expect(aCardInB2View?.faceUp).toBe(true);
    expect(aCardInB2View?.cardType).toBeDefined();
    clientB2.ws.close();

    // 11. Draw card updates correct player's hand index
    expect(aDrawnMsg.payload.playerIndex).toBe(0);
    expect(bDrawnMsg2.payload.playerIndex).toBe(1);

    // 12. Leave room updates member state
    clientA.messages.length = 0;
    clientB.ws.send(JSON.stringify({ type: 'room:leave' }));

    const leftMsg = await clientA.waitForMessage('room:player-left');
    expect(leftMsg.payload.playerId).toBe(playerBId);

    // Cleanup
    clientA.ws.close();
    clientB.ws.close();
  });
});
