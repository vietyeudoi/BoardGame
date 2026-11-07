/**
 * server.test.ts — Live verification test for HTTP and WebSocket
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import { WebSocket } from 'ws';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';
import { RoomManager } from '../room/RoomManager.js';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';

const TEST_PORT = 4099;

describe('M0 Server Live Verification (HTTP + WebSocket)', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let roomManager: RoomManager;

  beforeAll(async () => {
    roomManager = new RoomManager();
    httpServer = new HttpServer(TEST_PORT);
    wsServer = new WebSocketServer(httpServer.getServer(), roomManager);

    await new Promise<void>((resolve) => {
      httpServer.getServer().listen(TEST_PORT, () => {
        wsServer.start();
        resolve();
      });
    });
  });

  afterAll(async () => {
    wsServer.shutdown();
    httpServer.stop();
  });

  it('HTTP /health endpoint returns 200 and expected JSON payload', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.get(`http://localhost:${TEST_PORT}/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
    });

    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe('ok');
    expect(data.service).toBe('cat-boom-online');
    expect(data.milestone).toBe('M0');
  });

  it('WebSocket connects, receives initial greeting pong, and handles room:create', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
    const receivedMessages: ServerToClientMessage[] = [];

    // Register message handler before awaiting open to avoid race conditions
    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString()) as ServerToClientMessage;
      receivedMessages.push(parsed);
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Wait up to 500ms for initial greeting pong
    await new Promise((r) => setTimeout(r, 200));
    expect(receivedMessages.some((m) => m.type === 'pong')).toBe(true);

    // Send room:create
    ws.send(
      JSON.stringify({
        type: 'room:create',
        payload: { roomName: 'Test Sandbox Room' },
      })
    );

    // Wait for room:joined and room:state
    await new Promise((r) => setTimeout(r, 300));

    const joinedMsg = receivedMessages.find((m) => m.type === 'room:joined');
    expect(joinedMsg).toBeDefined();
    if (joinedMsg && joinedMsg.type === 'room:joined') {
      expect(joinedMsg.payload.roomId).toBeDefined();
      expect(typeof joinedMsg.payload.roomId).toBe('string');
    }

    const stateMsg = receivedMessages.find((m) => m.type === 'room:state');
    expect(stateMsg).toBeDefined();
    if (stateMsg && stateMsg.type === 'room:state') {
      expect(stateMsg.payload.name).toBe('Test Sandbox Room');
      expect(stateMsg.payload.players.length).toBe(1);
      expect(stateMsg.payload.players[0].isHost).toBe(true);
      expect(stateMsg.payload.objects.length).toBeGreaterThan(0);
    }

    ws.close();
  });
});
