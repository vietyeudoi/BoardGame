/**
 * PlayerSession.ts — Per-player WebSocket session state
 */
import { WebSocket } from 'ws';
import type { ServerToClientMessage } from '../../../shared/types/protocol.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('PlayerSession');

export class PlayerSession {
  public roomId: string | null = null;
  public playerName: string | null = null;
  public isAlive = true;

  constructor(
    public sessionId: string,
    private readonly _ws: WebSocket
  ) {
    this._ws.on('pong', () => {
      this.isAlive = true;
    });
  }

  sendRaw(message: ServerToClientMessage): void {
    if (this._ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send: WebSocket not open', { sessionId: this.sessionId });
      return;
    }
    try {
      this._ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message to client', { sessionId: this.sessionId, error: String(error) });
    }
  }

  sendError(message: string, code?: string, objectId?: string): void {
    this.sendRaw({ type: 'error', payload: { message, code, objectId } });
  }

  ping(): void {
    this.isAlive = false;
    this._ws.ping();
  }

  terminate(): void {
    this._ws.terminate();
  }
}

