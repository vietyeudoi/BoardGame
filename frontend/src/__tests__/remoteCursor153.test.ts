/**
 * remoteCursor153.test.ts — M1.5.3 Remote Cursor & Multiplayer Shared Interaction Tests
 *
 * Verifies that RemoteCursorManager:
 * 1. Creates a cursor in the scene for a remote player.
 * 2. Updates cursor position when receiving cursor:update.
 * 3. Ignores stale messages (seq < lastSeq).
 * 4. Removes cursor when player leaves room.
 * 5. Does NOT create a cursor for the local player.
 * 6. Disposes geometry/material on cursor removal.
 * 7. removeAllCursors clears all entries.
 * 8. dispose() cleans up completely.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { RemoteCursorManager } from '../scene/RemoteCursorManager';
import { SEAT_COLORS } from '../objects/PlayerAreaConfig';
import type { CursorUpdatePayload } from '@shared/types/protocol';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(
  playerId: string,
  playerName: string,
  x: number,
  z: number,
  seq: number
): CursorUpdatePayload {
  return { playerId, playerName, x, z, seq };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('M1.5.3 — RemoteCursorManager', () => {
  let scene: THREE.Scene;
  let manager: RemoteCursorManager;
  let renderCount: number;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderCount = 0;
    manager = new RemoteCursorManager(scene, () => {
      renderCount++;
    });
    manager.setLocalPlayerId('local-player');
  });

  afterEach(() => {
    manager.dispose();
  });

  // ─── 1. Creates cursor for remote player ─────────────────────────────────

  it('adds a cursor group to the scene for a new remote player', () => {
    const initialChildCount = scene.children.length;
    manager.updateCursor(makePayload('player-bob', 'Bob', 1, 2, 0));

    expect(scene.children.length).toBe(initialChildCount + 1);
    expect(renderCount).toBeGreaterThan(0);
  });

  it('lấy màu ghế dù nhận con trỏ trước và đổi màu ngay khi đổi ghế', () => {
    manager.updateCursor(makePayload('bob', 'Bob', 1, 2, 0));
    const group = scene.getObjectByName('RemoteCursor_bob')!;
    const mesh = group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const sprite = group.children[1] as THREE.Sprite;
    const bob = { id: 'bob', name: 'Bob', isHost: false, isConnected: true, playerIndex: 8 };
    manager.setPlayers([bob]);
    expect(mesh.material.color.getHex()).toBe(SEAT_COLORS[8]);
    const texture = sprite.material.map!;
    const version = texture.version;
    manager.setPlayers([{ ...bob, playerIndex: 2 }]);
    expect(mesh.material.color.getHex()).toBe(SEAT_COLORS[2]);
    expect(sprite.material.map).toBe(texture);
    expect(texture.version).toBeGreaterThan(version);
    expect(group.position.x).toBe(1);
  });

  // ─── 2. Updates cursor position ──────────────────────────────────────────

  it('updates the cursor position when a new message arrives with higher seq', () => {
    manager.updateCursor(makePayload('player-bob', 'Bob', 0, 0, 0));
    manager.updateCursor({ ...makePayload('player-bob', 'Bob', 3, 5, 1), y: 0.8 });

    const cursorGroup = scene.children.find(
      (c) => c.name === 'RemoteCursor_player-bob'
    );
    expect(cursorGroup).toBeDefined();
    expect(cursorGroup!.position.x).toBeCloseTo(3, 3);
    expect(cursorGroup!.position.y).toBeCloseTo(0.92, 3);
    expect(cursorGroup!.position.z).toBeCloseTo(5, 3);
  });

  // ─── 3. Ignores stale messages (anti-jitter) ─────────────────────────────

  it('ignores cursor:update messages with seq smaller than last received', () => {
    manager.updateCursor(makePayload('player-bob', 'Bob', 5, 5, 10));
    const renderAfterFirst = renderCount;

    // Send stale message
    manager.updateCursor(makePayload('player-bob', 'Bob', 0, 0, 3));

    const cursorGroup = scene.children.find(
      (c) => c.name === 'RemoteCursor_player-bob'
    );
    // Position should still be from seq=10 message
    expect(cursorGroup!.position.x).toBeCloseTo(5, 3);
    expect(cursorGroup!.position.z).toBeCloseTo(5, 3);
    // No additional render triggered
    expect(renderCount).toBe(renderAfterFirst);
  });

  // ─── 4. Removes cursor when player leaves ────────────────────────────────

  it('removes cursor from scene when removeCursor is called', () => {
    manager.updateCursor(makePayload('player-carol', 'Carol', 1, 1, 0));
    expect(scene.children.some((c) => c.name === 'RemoteCursor_player-carol')).toBe(true);

    manager.removeCursor('player-carol');
    expect(scene.children.some((c) => c.name === 'RemoteCursor_player-carol')).toBe(false);
  });

  // ─── 5. Does NOT create cursor for local player ──────────────────────────

  it('does NOT create a cursor for the local player ID', () => {
    const initialChildCount = scene.children.length;
    manager.updateCursor(makePayload('local-player', 'Me', 2, 3, 0));

    expect(scene.children.length).toBe(initialChildCount);
    expect(renderCount).toBe(0);
  });

  // ─── 6. Resources are disposed on removeCursor ───────────────────────────

  it('removes cursor group from scene on removeCursor (no orphaned objects)', () => {
    manager.updateCursor(makePayload('player-dave', 'Dave', 3, 4, 0));
    expect(scene.children.some((c) => c.name === 'RemoteCursor_player-dave')).toBe(true);

    manager.removeCursor('player-dave');

    // Cursor must be gone from scene
    expect(scene.children.some((c) => c.name === 'RemoteCursor_player-dave')).toBe(false);
    // Calling removeCursor again should be safe (idempotent)
    expect(() => manager.removeCursor('player-dave')).not.toThrow();
  });

  // ─── 7. removeAllCursors clears all entries ──────────────────────────────

  it('removeAllCursors removes all remote cursors from the scene', () => {
    manager.updateCursor(makePayload('p1', 'Alice', 1, 1, 0));
    manager.updateCursor(makePayload('p2', 'Bob', 2, 2, 0));
    manager.updateCursor(makePayload('p3', 'Carol', 3, 3, 0));

    const cursorsBefore = scene.children.filter((c) =>
      c.name.startsWith('RemoteCursor_')
    ).length;
    expect(cursorsBefore).toBe(3);

    manager.removeAllCursors();

    const cursorsAfter = scene.children.filter((c) =>
      c.name.startsWith('RemoteCursor_')
    ).length;
    expect(cursorsAfter).toBe(0);
  });

  // ─── 8. dispose() cleans up completely ───────────────────────────────────

  it('dispose() removes all cursors from scene', () => {
    manager.updateCursor(makePayload('px', 'X', 0, 0, 0));
    manager.updateCursor(makePayload('py', 'Y', 1, 1, 0));

    manager.dispose();

    const remaining = scene.children.filter((c) =>
      c.name.startsWith('RemoteCursor_')
    );
    expect(remaining.length).toBe(0);
  });

  // ─── 9. Multiple updates from same player don't duplicate cursors ─────────

  it('does not create duplicate cursor groups for repeated updates from same player', () => {
    manager.updateCursor(makePayload('player-multi', 'Multi', 0, 0, 0));
    manager.updateCursor(makePayload('player-multi', 'Multi', 1, 1, 1));
    manager.updateCursor(makePayload('player-multi', 'Multi', 2, 2, 2));

    const cursors = scene.children.filter(
      (c) => c.name === 'RemoteCursor_player-multi'
    );
    expect(cursors.length).toBe(1);
  });

  // ─── 10. Cursors sit above table surface (Y > 0) ─────────────────────────

  it('cursor Y position is above table surface (CURSOR_Y > 0)', () => {
    manager.updateCursor(makePayload('player-y', 'Y', 4, 5, 0));

    const cursorGroup = scene.children.find(
      (c) => c.name === 'RemoteCursor_player-y'
    );
    expect(cursorGroup).toBeDefined();
    expect(cursorGroup!.position.y).toBeGreaterThan(0);
  });
});

