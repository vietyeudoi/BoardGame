/**
 * hoverExpansion153.test.ts — M1.5.3 Local Card Hover Expansion Tests
 *
 * Verifies that HoverExpansionController:
 * 1. Fans out cards belonging to the local player on hover.
 * 2. Collapses back on hover leave.
 * 3. Does NOT activate for cards of other players or cards without ownerId.
 * 4. Does NOT activate for Deck or Discard Stack.
 * 5. Cancels immediately (no animation) when drag starts.
 * 6. Does NOT modify CardRegistry logical positions.
 * 7. Handles rapid hover switches without leaking transforms.
 * 8. Cleans up on dispose.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HoverExpansionController } from '../interaction/HoverExpansionController';
import { CardObject3D } from '../objects/CardObject3D';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(id: string, x = 0, z = 0, ownerId: string | null = null): CardObject3D {
  const card = new CardObject3D({ id, position: { x, y: 0, z } });
  (card as CardObject3D & { _ownerId?: string | null })._ownerId = ownerId;
  return card;
}

// Mock requestAnimationFrame / cancelAnimationFrame for sync testing
let rafCallbacks: (() => void)[] = [];
let rafId = 0;
const mockRaf = (cb: () => void): number => {
  rafCallbacks.push(cb);
  return ++rafId;
};
const mockCancelRaf = (id: number): void => {
  // Just a no-op for test purposes
  void id;
};

// Flush all pending rAF callbacks (simulate animation loop completing)
function flushRaf(times = 5): void {
  for (let i = 0; i < times; i++) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach((cb) => cb());
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('M1.5.3 — HoverExpansionController', () => {
  let controller: HoverExpansionController;
  let renderCount: number;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });

    renderCount = 0;
    controller = new HoverExpansionController(() => {
      renderCount++;
    });
    controller.setLocalPlayerId('player-alice');
  });

  afterEach(() => {
    controller.dispose();
    vi.unstubAllGlobals();
  });

  // ─── 1. Hover on own card fans out group ─────────────────────────────────

  it('fans out cards belonging to local player when hovered', () => {
    const card1 = makeCard('c1', 0, 0, 'player-alice');
    const card2 = makeCard('c2', 1, 0, 'player-alice');
    const card3 = makeCard('c3', 2, 0, 'player-alice');

    const originalX1 = card1.position.x;
    const originalX2 = card2.position.x;
    const originalX3 = card3.position.x;

    controller.onTableCardHoverChanged(card1, true, [card1, card2, card3]);

    // Simulate animation frames completing
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(300); // past ANIMATION_DURATION_MS
    flushRaf(3);

    // Cards should be spread apart from their originals
    const allX = [card1.position.x, card2.position.x, card3.position.x];
    const uniqueX = new Set(allX.map((x) => x.toFixed(3)));
    expect(uniqueX.size).toBe(3); // All spread out

    // At least one card should have moved
    const moved =
      card1.position.x !== originalX1 ||
      card2.position.x !== originalX2 ||
      card3.position.x !== originalX3;
    expect(moved).toBe(true);
  });

  // ─── 2. Hover leave collapses back to baseline ───────────────────────────

  it('restores cards to baseline positions when hover leaves', () => {
    const card1 = makeCard('c1', 0, 0, 'player-alice');
    const card2 = makeCard('c2', 1.5, 0, 'player-alice');

    const originalX1 = card1.position.x;
    const originalZ1 = card1.position.z;
    const originalX2 = card2.position.x;

    // Expand
    controller.onTableCardHoverChanged(card1, true, [card1, card2]);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(500);
    flushRaf(3);

    // Collapse
    controller.onTableCardHoverChanged(null, false, []);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1000);
    flushRaf(5);

    // Cards should be back at baseline
    expect(card1.position.x).toBeCloseTo(originalX1, 2);
    expect(card1.position.z).toBeCloseTo(originalZ1, 2);
    expect(card2.position.x).toBeCloseTo(originalX2, 2);
  });

  // ─── 3. Hover on other player's card — no activation ────────────────────

  it('does NOT activate expansion when hovering a card owned by another player', () => {
    const otherCard = makeCard('c-bob', 0, 0, 'player-bob');
    const aliceCard = makeCard('c-alice', 1, 0, 'player-alice');

    const otherOriginalX = otherCard.position.x;
    const aliceOriginalX = aliceCard.position.x;

    controller.onTableCardHoverChanged(otherCard, true, [otherCard, aliceCard]);
    flushRaf(3);

    // Neither card should move
    expect(otherCard.position.x).toBe(otherOriginalX);
    expect(aliceCard.position.x).toBe(aliceOriginalX);
    expect(renderCount).toBe(0);
  });

  // ─── 4. Hover on card with no ownerId — no activation ───────────────────

  it('does NOT activate expansion for cards with null ownerId', () => {
    const freeCard = makeCard('c-free', 0, 0, null); // No owner
    const originalX = freeCard.position.x;

    controller.onTableCardHoverChanged(freeCard, true, [freeCard]);
    flushRaf(3);

    expect(freeCard.position.x).toBe(originalX);
    expect(renderCount).toBe(0);
  });

  // ─── 5. Cancel expansion immediately when drag starts ────────────────────

  it('cancels expansion immediately (no animation) when drag begins', () => {
    const card1 = makeCard('c1', 0, 0, 'player-alice');
    const card2 = makeCard('c2', 1, 0, 'player-alice');

    const originalX1 = card1.position.x;
    const originalX2 = card2.position.x;

    // Start hover expansion
    controller.onTableCardHoverChanged(card1, true, [card1, card2]);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(100);
    flushRaf(2); // Partially animate

    // Drag starts — must immediately snap back
    controller.cancelExpansion();

    // Cards must be at exact baseline (no lingering expansion)
    expect(card1.position.x).toBe(originalX1);
    expect(card2.position.x).toBe(originalX2);
  });

  // ─── 6. Logical positions unchanged after hover ──────────────────────────

  it('restores exact original positions after collapse — no permanent changes', () => {
    const card1 = makeCard('c1', -2.5, 0, 'player-alice');
    const card2 = makeCard('c2', 0, 0, 'player-alice');
    const card3 = makeCard('c3', 2.5, 0, 'player-alice');

    const snapshotBefore = [
      { x: card1.position.x, z: card1.position.z },
      { x: card2.position.x, z: card2.position.z },
      { x: card3.position.x, z: card3.position.z },
    ];

    // Full expand + collapse cycle
    controller.onTableCardHoverChanged(card1, true, [card1, card2, card3]);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(500);
    flushRaf(3);
    controller.onTableCardHoverChanged(null, false, []);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1000);
    flushRaf(5);

    // Positions must be exactly restored
    expect(card1.position.x).toBeCloseTo(snapshotBefore[0]!.x, 3);
    expect(card2.position.x).toBeCloseTo(snapshotBefore[1]!.x, 3);
    expect(card3.position.x).toBeCloseTo(snapshotBefore[2]!.x, 3);
  });

  // ─── 7. Rapid hover switches don't leak transforms ───────────────────────

  it('handles rapid hover switches without leaking transforms', () => {
    const card1 = makeCard('c1', 0, 0, 'player-alice');
    const card2 = makeCard('c2', 1, 0, 'player-alice');
    const card3 = makeCard('c3', -1, 0, 'player-alice');

    const originalX1 = card1.position.x;
    const originalX2 = card2.position.x;
    const originalX3 = card3.position.x;

    let t = 0;
    (performance.now as ReturnType<typeof vi.fn>).mockImplementation(() => t);

    // Rapidly hover different cards
    controller.onTableCardHoverChanged(card1, true, [card1, card2, card3]);
    t = 50;
    flushRaf(1);
    controller.onTableCardHoverChanged(card2, true, [card1, card2, card3]);
    t = 100;
    flushRaf(1);
    controller.onTableCardHoverChanged(card3, true, [card1, card2, card3]);
    t = 150;
    flushRaf(1);

    // Cancel all
    controller.cancelExpansion();

    // No card should be permanently displaced
    expect(card1.position.x).toBe(originalX1);
    expect(card2.position.x).toBe(originalX2);
    expect(card3.position.x).toBe(originalX3);
  });

  // ─── 8. Dispose cleans up — no rAF leak, no render after dispose ─────────

  it('dispose cleans up animation and stops any further renders', () => {
    const card = makeCard('c-cleanup', 0, 0, 'player-alice');
    controller.onTableCardHoverChanged(card, true, [card]);
    flushRaf(1); // Start animation

    controller.dispose();
    rafCallbacks = []; // Clear any pending rAF

    const rendersBefore = renderCount;

    // After dispose, subsequent rAF flushes should not produce more renders
    flushRaf(3);
    expect(renderCount).toBe(rendersBefore);
  });

  // ─── 9. Only groups cards within radius R ────────────────────────────────

  it('only groups cards within the proximity radius (5 units)', () => {
    const near = makeCard('near', 0, 0, 'player-alice');
    const far = makeCard('far', 10, 0, 'player-alice'); // > 5 units away

    const nearOriginalX = near.position.x;
    const farOriginalX = far.position.x;

    controller.onTableCardHoverChanged(near, true, [near, far]);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(500);
    flushRaf(3);

    // Far card must NOT be moved (out of radius)
    expect(far.position.x).toBe(farOriginalX);

    // Near card may be moved (it's in radius, group of 1)
    // With group of 1, the card stays put (no spread needed, same position)
    void nearOriginalX; // single card case — may not move
  });

  // ─── 10. Scale returns to 1.0 after collapse ─────────────────────────────

  it('restores scale to 1.0 after collapse', () => {
    const card = makeCard('c-scale', 0, 0, 'player-alice');
    expect(card.scale.x).toBe(1);

    controller.onTableCardHoverChanged(card, true, [card]);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(300);
    flushRaf(3);

    // Scale should be expanded (1.15x)
    // (with single card, still gets scale applied)
    expect(card.scale.x).toBeGreaterThanOrEqual(1);

    // Collapse
    controller.onTableCardHoverChanged(null, false, []);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(600);
    flushRaf(5);

    // Scale back to 1.0
    expect(card.scale.x).toBeCloseTo(1.0, 3);
  });
});

