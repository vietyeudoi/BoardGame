/**
 * NetworkClient.ts — WebSocket Client Wrapper
 * Manages connection lifecycle and reconnect logic.
 */
import type { ClientToServerMessage, ServerToClientMessage } from '@shared/types/protocol';
import { Logger } from '../utils/Logger';

const logger = Logger.create('NetworkClient');

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class NetworkClient {
  private _ws: WebSocket | null = null;
  private _reconnectAttempts = 0;
  private _intentionalDisconnect = false;
  private _status: ConnectionStatus = 'disconnected';

  onMessage: ((msg: ServerToClientMessage) => void) | null = null;
  onConnectionChange: ((status: ConnectionStatus) => void) | null = null;

  connect(url: string): void {
    this._intentionalDisconnect = false;
    this._doConnect(url);
  }

  private _doConnect(url: string): void {
    this._setStatus('connecting');
    logger.info(`Connecting to ${url}`);

    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      this._reconnectAttempts = 0;
      this._setStatus('connected');
      logger.info('WebSocket connected');
    };

    this._ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as ServerToClientMessage;
        this.onMessage?.(data);
      } catch (error) {
        logger.error('Failed to parse server message', { error });
      }
    };

    this._ws.onerror = () => {
      logger.error('WebSocket error occurred');
      this._setStatus('error');
    };

    this._ws.onclose = () => {
      if (this._intentionalDisconnect) {
        this._setStatus('disconnected');
        logger.info('WebSocket disconnected intentionally');
        return;
      }
      this._setStatus('disconnected');
      this._scheduleReconnect(url);
    };
  }

  private _scheduleReconnect(url: string): void {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
      this._setStatus('error');
      return;
    }
    this._reconnectAttempts++;
    logger.warn(`Reconnecting in ${RECONNECT_DELAY_MS}ms (attempt ${this._reconnectAttempts})`);
    setTimeout(() => this._doConnect(url), RECONNECT_DELAY_MS);
  }

  send(message: ClientToServerMessage): void {
    if (this._ws?.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send: WebSocket not open', { status: this._status });
      return;
    }
    try {
      this._ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send WebSocket message', { error });
    }
  }

  disconnect(): void {
    this._intentionalDisconnect = true;
    this._ws?.close();
    this._ws = null;
  }

  getStatus(): ConnectionStatus {
    return this._status;
  }

  private _setStatus(status: ConnectionStatus): void {
    this._status = status;
    this.onConnectionChange?.(status);
  }
}
