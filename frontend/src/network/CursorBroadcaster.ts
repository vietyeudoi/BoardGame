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
  private _lastX = NaN;
  private _lastZ = NaN;
  private _pendingX: number | null = null;
  private _pendingZ: number | null = null;
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
    this._lastX = NaN;
    this._lastZ = NaN;

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
    this._pendingX = null;
    this._pendingZ = null;
    logger.debug('CursorBroadcaster disabled');
  }

  /**
   * Receives the world-space XZ cursor position (from SceneManager raycasting).
   * The position is queued and sent on the next throttle tick.
   */
  onCursorMoved(x: number, z: number): void {
    if (!this._active) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (Math.abs(x) > 50 || Math.abs(z) > 50) return;

    // Dead zone check against last successfully sent position
    if (!Number.isNaN(this._lastX)) {
      const dx = Math.abs(x - this._lastX);
      const dz = Math.abs(z - this._lastZ);
      if (dx < DEAD_ZONE && dz < DEAD_ZONE) return;
    }

    this._pendingX = x;
    this._pendingZ = z;
  }

  /** Dispose and stop broadcasting. */
  dispose(): void {
    this.disable();
    logger.debug('CursorBroadcaster disposed');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private _flush(): void {
    if (!this._active) return;
    if (this._pendingX === null || this._pendingZ === null) return;
    if (!this._store.getRoomId()) return;

    const x = this._pendingX;
    const z = this._pendingZ;
    this._pendingX = null;
    this._pendingZ = null;

    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (Math.abs(x) > 50 || Math.abs(z) > 50) return;

    // Avoid sending unnecessary updates if position has not changed
    if (!Number.isNaN(this._lastX) && !Number.isNaN(this._lastZ)) {
      if (Math.abs(x - this._lastX) < 1e-4 && Math.abs(z - this._lastZ) < 1e-4) {
        return;
      }
    }

    this._seq += 1;
    this._lastX = x;
    this._lastZ = z;

    this._networkClient.send({
      type: 'cursor:move',
      payload: { x, z, seq: this._seq },
    });
  }

  private _clearInterval(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }
}
