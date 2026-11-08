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
import type { PlayerInfo } from '@shared/types/room';
import { SEAT_COLORS } from '../objects/PlayerAreaConfig';
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

const UNSEATED_CURSOR_COLOR = 0xe2e8f0;

interface CursorEntry {
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  geometry: THREE.ConeGeometry;
  sprite: THREE.Sprite;
  spriteMaterial: THREE.SpriteMaterial;
  spriteTexture: THREE.CanvasTexture;
  lastSeq: number;
  playerName: string;
  color: number;
}

export class RemoteCursorManager {
  private readonly _scene: THREE.Scene;
  private readonly _cursors = new Map<string, CursorEntry>();
  private _players = new Map<string, { name: string; color: number }>();
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

  setPlayers(players: readonly PlayerInfo[]): void {
    // Màu theo ghế do trạng thái phòng xác nhận, độc lập thứ tự nhận con trỏ.
    this._players = new Map(players.map((player, index) => [
      player.id, {
        name: player.name,
        color: (player.spectator ? undefined : SEAT_COLORS[player.playerIndex ?? index]) ?? UNSEATED_CURSOR_COLOR,
      },
    ]));
    let changed = false;
    for (const [id, entry] of this._cursors) {
      const player = this._players.get(id);
      if (player && this._updateIdentity(entry, player.name, player.color)) changed = true;
    }
    if (changed) this._requestRender();
  }

  /**
   * Updates or creates a remote cursor from a server cursor:update message.
   * Ignores stale messages (seq < last received seq).
   */
  updateCursor(payload: CursorUpdatePayload): void {
    const { playerId, playerName, x, y = 0, z, seq } = payload;

    // Never render our own cursor
    if (playerId === this._localPlayerId) return;

    const identity = this._players.get(playerId);
    const name = identity?.name ?? playerName;
    const color = identity?.color ?? UNSEATED_CURSOR_COLOR;
    let entry = this._cursors.get(playerId);

    if (!entry) {
      entry = this._createCursorEntry(playerId, name, color);
      this._cursors.set(playerId, entry);
      this._scene.add(entry.group);
      logger.debug('Created remote cursor', { playerId, playerName });
    }

    // Anti-jitter: ignore out-of-order messages
    if (seq < entry.lastSeq) {
      logger.debug('Ignoring stale cursor update', { playerId, seq, lastSeq: entry.lastSeq });
      return;
    }

    this._updateIdentity(entry, name, color);
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
    this._players.clear();
    this._requestRender();
  }

  /** Dispose all resources and clear from scene. */
  dispose(): void {
    this.removeAllCursors();
    logger.debug('RemoteCursorManager disposed');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private _createCursorEntry(playerId: string, playerName: string, colorHex: number): CursorEntry {
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
    sprite.position.set(0, CURSOR_HEIGHT + 0.35, 0);
    sprite.scale.set(2.3, 0.575, 1);
    sprite.renderOrder = 7;

    const group = new THREE.Group();
    group.name = `RemoteCursor_${playerId}`;
    group.add(mesh, sprite);

    return { group, mesh, material, geometry, sprite, spriteMaterial, spriteTexture, lastSeq: -1, playerName, color: colorHex };
  }

  private _buildNameSprite(
    name: string,
    colorHex: number
  ): { sprite: THREE.Sprite; spriteMaterial: THREE.SpriteMaterial; spriteTexture: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_W;
    canvas.height = SPRITE_H;
    this._paintLabel(canvas, name, colorHex);
    const spriteTexture = new THREE.CanvasTexture(canvas);
    spriteTexture.colorSpace = THREE.SRGBColorSpace;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: spriteTexture, transparent: true, depthTest: false, depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    return { sprite, spriteMaterial, spriteTexture };
  }

  private _updateIdentity(entry: CursorEntry, name: string, color: number): boolean {
    if (entry.playerName === name && entry.color === color) return false;
    entry.playerName = name;
    entry.color = color;
    entry.material.color.setHex(color);
    this._paintLabel(entry.spriteTexture.image as HTMLCanvasElement, name, color);
    entry.spriteTexture.needsUpdate = true;
    return true;
  }

  private _paintLabel(canvas: HTMLCanvasElement, name: string, color: number): void {
    if (navigator.userAgent.includes('jsdom')) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
    ctx.beginPath();
    ctx.roundRect(4, 4, SPRITE_W - 8, SPRITE_H - 8, 10);
    ctx.fillStyle = '#101827';
    ctx.fill();
    ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 33px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, SPRITE_W / 2, SPRITE_H / 2, SPRITE_W - 24);
  }

  private _disposeCursorEntry(entry: CursorEntry): void {
    entry.geometry.dispose();
    entry.material.dispose();
    entry.spriteTexture.dispose();
    entry.spriteMaterial.dispose();
    entry.group.clear();
  }
}
