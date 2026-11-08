/**
 * RemoteCursorManager.ts — Renders remote player cursors in 3D scene (M1.5.3)
 *
 * Each remote cursor is a THREE.Group containing:
 * - A cone mesh (pointer shape) colored per playerIndex.
 * - A canvas-based sprite displaying the player name.
 *
 * Features:
 * - Ignores out-of-order cursor:update messages via sequence number.
 * - Disposes geometry and material on cursor removal.
 * - Never creates a cursor for the local player.
 */
import * as THREE from 'three';
import type { CursorUpdatePayload } from '@shared/types/protocol';
import { Logger } from '../utils/Logger';

const logger = Logger.create('RemoteCursorManager');

/** Y offset above table surface so cursor sits visually on top. */
const CURSOR_Y = 0.12;
/** Cone height (world units). */
const CURSOR_HEIGHT = 0.6;
/** Cone base radius. */
const CURSOR_RADIUS = 0.2;
/** Sprite canvas dimensions. */
const SPRITE_W = 256;
const SPRITE_H = 64;

/** Cursor colors indexed by playerIndex (wraps around). */
const CURSOR_COLORS = [
  0xef4444,
  0x3b82f6,
  0x22c55e,
  0xf59e0b,
  0xa855f7,
  0xec4899,
  0x14b8a6,
  0xf97316,
] as const;

interface CursorEntry {
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  geometry: THREE.ConeGeometry;
  sprite: THREE.Sprite;
  spriteMaterial: THREE.SpriteMaterial;
  spriteTexture: THREE.CanvasTexture;
  lastSeq: number;
}

export class RemoteCursorManager {
  private readonly _scene: THREE.Scene;
  private readonly _cursors = new Map<string, CursorEntry>();
  private _localPlayerId: string | null = null;
  private readonly _requestRender: () => void;

  constructor(scene: THREE.Scene, requestRender: () => void) {
    this._scene = scene;
    this._requestRender = requestRender;
    logger.debug('RemoteCursorManager initialized');
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Sets the local player ID so we never create a cursor for ourselves. */
  setLocalPlayerId(playerId: string | null): void {
    this._localPlayerId = playerId;
  }

  /**
   * Updates or creates a remote cursor from a server cursor:update message.
   * Ignores stale messages (seq < last received seq).
   */
  updateCursor(payload: CursorUpdatePayload): void {
    const { playerId, playerName, x, y = 0, z, seq } = payload;

    // Never render our own cursor
    if (playerId === this._localPlayerId) return;

    let entry = this._cursors.get(playerId);

    if (!entry) {
      entry = this._createCursorEntry(playerId, playerName);
      this._cursors.set(playerId, entry);
      this._scene.add(entry.group);
      logger.debug('Created remote cursor', { playerId, playerName });
    }

    // Anti-jitter: ignore out-of-order messages
    if (seq < entry.lastSeq) {
      logger.debug('Ignoring stale cursor update', { playerId, seq, lastSeq: entry.lastSeq });
      return;
    }

    entry.lastSeq = seq;
    entry.group.position.set(x, y + CURSOR_Y, z);
    this._requestRender();
  }

  /**
   * Removes the remote cursor for a player when they leave the room.
   */
  removeCursor(playerId: string): void {
    const entry = this._cursors.get(playerId);
    if (!entry) return;

    this._scene.remove(entry.group);
    this._disposeCursorEntry(entry);
    this._cursors.delete(playerId);
    logger.debug('Removed remote cursor', { playerId });
    this._requestRender();
  }

  /**
   * Removes all remote cursors (e.g., when leaving a room).
   */
  removeAllCursors(): void {
    for (const [playerId, entry] of this._cursors.entries()) {
      this._scene.remove(entry.group);
      this._disposeCursorEntry(entry);
      logger.debug('Removed remote cursor', { playerId });
    }
    this._cursors.clear();
    this._requestRender();
  }

  /** Dispose all resources and clear from scene. */
  dispose(): void {
    this.removeAllCursors();
    logger.debug('RemoteCursorManager disposed');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private _createCursorEntry(playerId: string, playerName: string): CursorEntry {
    const colorIndex = this._cursors.size % CURSOR_COLORS.length;
    const colorHex = CURSOR_COLORS[colorIndex] ?? 0xef4444;

    // Cone geometry (tip pointing up)
    const geometry = new THREE.ConeGeometry(CURSOR_RADIUS, CURSOR_HEIGHT, 8);
    const material = new THREE.MeshBasicMaterial({ color: colorHex });
    const mesh = new THREE.Mesh(geometry, material);
    // Tip points up by default; rotate so it tilts like a cursor
    mesh.rotation.z = -Math.PI / 6;
    mesh.position.set(0, CURSOR_HEIGHT / 2, 0);

    // Name label sprite
    const { sprite, spriteMaterial, spriteTexture } = this._buildNameSprite(
      playerName,
      colorHex
    );
    sprite.position.set(0.4, CURSOR_HEIGHT + 0.3, 0);
    sprite.scale.set(1.4, 0.35, 1);

    const group = new THREE.Group();
    group.name = `RemoteCursor_${playerId}`;
    group.add(mesh, sprite);

    return { group, mesh, material, geometry, sprite, spriteMaterial, spriteTexture, lastSeq: -1 };
  }

  private _buildNameSprite(
    name: string,
    colorHex: number
  ): { sprite: THREE.Sprite; spriteMaterial: THREE.SpriteMaterial; spriteTexture: THREE.CanvasTexture } {
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = document.createElement('canvas');
    } catch {
      // In headless/test environment, create a minimal stub
    }

    let spriteTexture: THREE.CanvasTexture;

    if (canvas) {
      canvas.width = SPRITE_W;
      canvas.height = SPRITE_H;
      const ctx = canvas.getContext('2d');

      // ctx may be null in jsdom/headless environments
      if (ctx) {
        // Background pill
        const r = (colorHex >> 16) & 0xff;
        const g = (colorHex >> 8) & 0xff;
        const b = colorHex & 0xff;
        ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.roundRect(4, 4, SPRITE_W - 8, SPRITE_H - 8, 10);
        ctx.fill();

        // Player name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.slice(0, 20), SPRITE_W / 2, SPRITE_H / 2);

        spriteTexture = new THREE.CanvasTexture(canvas);
      } else {
        // Canvas not supported in this environment (jsdom)
        spriteTexture = new THREE.CanvasTexture(
          { width: 1, height: 1 } as unknown as HTMLCanvasElement
        );
      }
    } else {
      // Fallback for test environment
      spriteTexture = new THREE.CanvasTexture(
        { width: 1, height: 1 } as unknown as HTMLCanvasElement
      );
    }

    const spriteMaterial = new THREE.SpriteMaterial({ map: spriteTexture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);

    return { sprite, spriteMaterial, spriteTexture };
  }

  private _disposeCursorEntry(entry: CursorEntry): void {
    entry.geometry.dispose();
    entry.material.dispose();
    entry.spriteTexture.dispose();
    entry.spriteMaterial.dispose();
    entry.group.clear();
  }
}
