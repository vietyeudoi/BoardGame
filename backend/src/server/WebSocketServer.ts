/**
 * WebSocketServer.ts — WS Connection Management + Heartbeat
 */
import * as http from 'http';
import { WebSocket, WebSocketServer as WSSLib } from 'ws';
import type { ClientToServerMessage } from '../../../shared/types/protocol.js';
import type { RoomManager } from '../room/RoomManager.js';
import { PlayerSession } from '../player/PlayerSession.js';
import { MessageDispatcher } from '../protocol/MessageDispatcher.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import { SHARED_CONFIG } from '../../../shared/constants/config.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('WebSocketServer');

export class WebSocketServer {
  private readonly _wss: WSSLib;
  private readonly _sessions = new Map<string, PlayerSession>();
  private readonly _dispatcher: MessageDispatcher;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(server: http.Server, private readonly _roomManager: RoomManager) {
    this._wss = new WSSLib({ server, path: '/ws' });
    this._dispatcher = new MessageDispatcher(this._roomManager, this._sessions);
  }

  start(): void {
    this._wss.on('connection', (ws) => this._onConnection(ws));
    this._startHeartbeat();
    logger.info('WebSocket server started on /ws');
  }

  private _onConnection(ws: WebSocket): void {
    const sessionId = IdGenerator.generate();
    const session = new PlayerSession(sessionId, ws);
    this._sessions.set(sessionId, session);
    logger.info('Client connected', { sessionId });

    ws.on('message', (raw) => {
      // Wrap per-message handler — one client error must NOT crash the server
      try {
        const data = JSON.parse(raw.toString()) as ClientToServerMessage;
        this._dispatcher.dispatch(session.sessionId, data);
      } catch (error) {
        logger.error('Failed to parse client message', { sessionId, error: String(error) });
        session.sendError('Invalid message format');
      }
    });


    ws.on('close', () => {
      if (this._sessions.get(session.sessionId) === session) this._onDisconnect(session.sessionId);
    });

    ws.on('error', (error) => {
      // Log but do not re-throw — one client error must NOT affect other rooms
      logger.error('WebSocket client error', { sessionId, error: String(error) });
    });

    // Greet new connection
    session.sendRaw({ type: 'pong' });
  }

  private _onDisconnect(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (session?.roomId) {
      this._dispatcher.handleDisconnect(sessionId);
    }
    this._sessions.delete(sessionId);
    logger.info('Client disconnected', { sessionId });
  }

  private _startHeartbeat(): void {
    this._heartbeatTimer = setInterval(() => {
      this._sessions.forEach((session, sessionId) => {
        if (!session.isAlive) {
          logger.warn('Terminating dead connection', { sessionId });
          session.terminate();
          this._onDisconnect(sessionId);
          return;
        }
        session.ping();
      });
    }, SHARED_CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  shutdown(): void {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    for (const session of this._sessions.values()) {
      session.terminate();
    }
    this._sessions.clear();
    this._wss.close();
    logger.info('WebSocket server shut down');
  }
}

