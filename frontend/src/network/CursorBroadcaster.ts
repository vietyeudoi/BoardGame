/**
 * CursorBroadcaster.ts — Throttled cursor position sender (M1.5.3)
 *
 * Listens to mouse position on the table surface (received as world XZ)
 * and sends WebSocket `cursor:move` messages at most 20 times/second.
 *
 * Rules:
 * - Throttle interval: 50ms (20 Hz).
 * - Dead zone: ignores position changes < 0.05 world units.
 * - Only sends when in a room.
 * - Maintains monotonically increasing sequence number.
 * - Dispose cleans up the interval.
 */
import type { Vector3Like } from '@shared/types/protocol';
import type { NetworkClient } from './NetworkClient';
import type { ClientStore } from '../store/ClientStore';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CursorBroadcaster');

/** Maximum send rate: 20 messages/second. */
const THROTTLE_INTERVAL_MS = 50;
/** Minimum movement to trigger a send (world units). */
const DEAD_ZONE = 0.05;

export class CursorBroadcaster {
  private _seq = 0;
  private _lastPosition: Vector3Like | null = null;
  private _pendingPosition: Vector3Like | null = null;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _active = false;

  constructor(
    private readonly _networkClient: NetworkClient,
    private readonly _store: ClientStore
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Enables cursor broadcasting. Call when joining a room.
   */
  enable(): void {
    if (this._active) return;
    this._active = true;
    this._seq = 0;
    this._lastPosition = null;

    this._intervalId = setInterval(() => this._flush(), THROTTLE_INTERVAL_MS);
    logger.debug('CursorBroadcaster enabled');
  }

  /**
   * Disables cursor broadcasting. Call when leaving a room.
   */
  disable(): void {
    if (!this._active) return;
    this._active = false;
    this._clearInterval();
    this._pendingPosition = null;
    logger.debug('CursorBroadcaster disabled');
  }

  /**
   * Receives the world-space XZ cursor position (from SceneManager raycasting).
   * The position is queued and sent on the next throttle tick.
   */
  onCursorMoved(x: number, z: number, y = 0): void {
    if (!this._active || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (Math.abs(x) > 50 || Math.abs(z) > 50 || y < 0 || y > 50) return;

    const last = this._lastPosition;
    const unchanged = last && Math.abs(x - last.x) < DEAD_ZONE &&
      Math.abs(z - last.z) < DEAD_ZONE && Math.abs(y - last.y) < DEAD_ZONE;
    this._pendingPosition = unchanged ? null : { x, y, z };
  }

  resetPosition(): void {
    this._pendingPosition = null;
    this._lastPosition = null;
  }

  /** Dispose and stop broadcasting. */
  dispose(): void {
    this.disable();
    logger.debug('CursorBroadcaster disposed');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private _flush(): void {
    if (!this._active) return;
    const position = this._pendingPosition;
    if (!position || !this._store.getRoomId()) return;

    this._pendingPosition = null;
    this._lastPosition = position;
    const { x, y, z } = position;
    this._networkClient.send({
      type: 'cursor:move',
      payload: { x, z, ...(y > 0 ? { y } : {}), seq: ++this._seq },
    });
  }

  private _clearInterval(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
