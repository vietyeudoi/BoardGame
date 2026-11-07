/**
 * gridRemoval1754.test.ts — M1.7.5 Part 4: Snap-to-Grid & "G" key removal
 *
 * The Snap-to-Grid feature (HUD button, G shortcut, context-menu entry, drag
 * snapping, config constants) must be GONE entirely — not disabled. These are
 * source-scan assertions over the production files (loaded as raw text via
 * Vite's import.meta.glob), so a reintroduction of any grid wiring fails the
 * suite immediately:
 *
 * 1. No grid identifiers anywhere in frontend/src production code.
 * 2. App.ts: no G shortcut, no grid context-menu wiring (F/R/H preserved).
 * 3. HUD toolbar HTML no longer renders the "Lưới" button (other buttons kept).
 * 4. UIManager has no grid delegation left.
 * 5. DragController exposes no grid API but keeps clamp + drag-end rotation.
 * 6. INTERACTION_CONFIG keeps interaction + wheel constants, no grid config.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      // Minimal stub — these tests never render.
      getCamera(): never { throw new Error('not needed'); }
    },
  };
});

import { INTERACTION_CONFIG } from '../interaction/InteractionConfig';

// Load every production source file under src/ as raw text (Vite feature,
// available under Vitest). Test files are filtered out below.
const RAW_SOURCES = import.meta.glob('../**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** [relativePath, sourceText] pairs for production files only. */
function productionSources(): Array<[string, string]> {
  // Vite keys are shortest-relative to THIS file: siblings inside
  // src/__tests__/ appear as "./x.test.ts" while production files are
  // "../app/App.ts" etc. Excluding "./" therefore drops every test file.
  return Object.entries(RAW_SOURCES).filter(
    ([path]) => !path.startsWith('./') && !path.endsWith('.d.ts')
  );
}

const SOURCES = productionSources();

/** Returns the raw source of a production file given its path under src/. */
function read(relPath: string): string {
  const key = `../${relPath}`;
  const text = RAW_SOURCES[key];
  if (text === undefined) throw new Error(`Source file not loaded: ${relPath}`);
  return text;
}

describe('M1.7.5 Part 4 — Snap-to-Grid & G key removal', () => {
  it('source scan covers the expected production surface', () => {
    expect(SOURCES.length).toBeGreaterThan(20);
    const rel = SOURCES.map(([p]) => p.replace(/^\.\.\//, '').replace(/\\/g, '/'));
    expect(rel).toContain('app/App.ts');
    expect(rel).toContain('ui/GameScreen.ts');
    expect(rel).toContain('ui/UIManager.ts');
    expect(rel).toContain('interaction/DragController.ts');
    expect(rel).toContain('interaction/InteractionConfig.ts');
  });

  it('1. No grid identifiers remain in any production source file', () => {
    const forbidden = [
      /snapToGridValue/,
      /SNAP_TO_GRID/,
      /GRID_SIZE/,
      /btn-snap-grid/,
      /toggleSnapToGrid/,
      /setSnapToGrid/,
      /isSnapToGridEnabled/,
      /getGridSize/,
      /setGridSize/,
      /onToggleSnapGrid/,
      /setSnapGridState/,
      /_snapGrid/,
      /_snapToGrid/,
      /_gridSize/,
      /Căn Lưới/,
      /Lưới: (Bật|Tắt)/,
    ];
    const violations: string[] = [];
    for (const [path, text] of SOURCES) {
      for (const pattern of forbidden) {
        const match = text.match(pattern);
        if (match) violations.push(`${path} → ${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('2. App.ts has no G shortcut and no grid context-menu wiring', () => {
    const app = read('app/App.ts');
    expect(app).not.toMatch(/key === 'g'/);
    expect(app).not.toMatch(/Phím G/);
    expect(app).not.toMatch(/Tắt Căn Lưới/);
    expect(app).not.toMatch(/Bật Căn Lưới/);
    // Other shortcuts survive.
    expect(app).toMatch(/key === 'f'/);
    expect(app).toMatch(/key === 'r'/);
    expect(app).toMatch(/key === 'h'/);
  });

  it('3. GameScreen HUD no longer renders the Lưới button', () => {
    const game = read('ui/GameScreen.ts');
    expect(game).not.toContain('btn-snap-grid');
    expect(game).not.toContain('📐 Lưới');
    // Sibling toolbar buttons survive (spec: keep the other buttons).
    expect(game).toContain('btn-flip-card');
    expect(game).toContain('btn-rotate-card');
    expect(game).toContain('btn-stack-cards');
    expect(game).toContain('btn-reset-cam');
    // The help hint advertises wheel rotation instead of the G grid toggle.
    expect(game).toContain('Lăn chuột');
    expect(game).not.toMatch(/<b>G:<\/b>/);
  });

  it('4. UIManager has no grid delegation left', () => {
    const ui = read('ui/UIManager.ts');
    expect(ui).not.toMatch(/SnapGrid/);
    expect(ui).not.toMatch(/snapGrid/);
    expect(ui).toContain('onRotateCardRequested');
    expect(ui).toContain('onStackCardsRequested');
  });

  it('5. DragController exposes no grid API but keeps clamp + drag-end rotation', () => {
    const drag = read('interaction/DragController.ts');
    // Specific grid identifiers must be gone ("snap" alone is legitimate for
    // "snap back to origin" on cancel and for "room snapshots").
    expect(drag).not.toMatch(/snapToGrid|_snapToGrid|gridSize|_gridSize|GRID_SIZE/i);
    expect(drag).not.toMatch(/grid/i);
    // Drag still clamps to the table boundary (clamp logic preserved).
    expect(drag).toContain('clampTablePosition');
    // Drag-end broadcast still carries position + rotation (Part 2).
    expect(drag).toMatch(/onDragEndBroadcast/);
  });

  it('6. INTERACTION_CONFIG keeps interaction constants but no grid config', () => {
    const cfg = INTERACTION_CONFIG as unknown as Record<string, unknown>;
    expect(cfg.SNAP_TO_GRID_DEFAULT).toBeUndefined();
    expect(cfg.GRID_SIZE).toBeUndefined();
    // Preserved behavior constants.
    expect(cfg.ROTATION_STEP).toBeCloseTo(Math.PI / 2, 10);
    expect(cfg.DROP_ZONE_RADIUS).toBeGreaterThan(0);
    // M1.7.5 Part 3 constants present alongside the removal.
    expect(cfg.WHEEL_ROTATION_STEP_DEG).toBe(5);
    expect(cfg.WHEEL_ROTATION_STEP_FINE_DEG).toBe(1);
  });

  it('7. No helper function `snapToGridValue` is importable', async () => {
    const mod = await import('../interaction/InteractionConfig');
    expect((mod as Record<string, unknown>).snapToGridValue).toBeUndefined();
  });
});
