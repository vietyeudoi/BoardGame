/**
 * fullHandFanPreview178.test.ts — M1.7.8: Full Hand Fan Preview (Reference-Based)
 *
 * Regression suite F178-01 … F178-14.
 *
 * Covers the screen-space FullHandFanPreviewUI overlay:
 *   - F178-01/02/03: hovering the FIRST / MIDDLE / LAST hand card opens the fan
 *                   showing the ENTIRE hand.
 *   - F178-04/05/06: fan geometry for 5 / 10 / 15-card hands (all rendered, distinct
 *                   symmetric rotations, adaptive overlap, no viewport overflow).
 *   - F178-07:     hover switch between hand cards keeps the same fan DOM (no flicker).
 *   - F178-08:     pointer leave closes the fan.
 *   - F178-09:     drag start keeps the fan open (M1.7.10 supersedes M1.7.8).
 *   - F178-10:     played card is dropped from the fan list / hand update syncs it.
 *   - F178-11:     opponent HAND never opens the fan.
 *   - F178-12:     the ORIGINAL 3D card transforms are untouched by the fan.
 *   - F178-13:     no fan state leaks between preview instances (multiplayer scope).
 *   - F178-14:     viewport resize keeps the fan centred and within bounds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      private readonly _canvas: HTMLCanvasElement;
      private readonly _camera: THREE.PerspectiveCamera;

      constructor(container: HTMLElement) {
        this._canvas = document.createElement('canvas');
        Object.defineProperty(this._canvas, 'clientWidth', { value: 1024, configurable: true });
        Object.defineProperty(this._canvas, 'clientHeight', { value: 768, configurable: true });
        this._canvas.getBoundingClientRect = () => ({
          left: 0,
          top: 0,
          width: 1024,
          height: 768,
          right: 1024,
          bottom: 768,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        });
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 1000);
        this._camera.position.set(0, 8, 10);
        this._camera.lookAt(0, 0, 0);
        this._camera.updateProjectionMatrix();
      }

      startLoop(): void {}
      stopLoop(): void {}
      requestRender(): void {}
      handleResize(): void {}
      getCamera(): THREE.PerspectiveCamera {
        return this._camera;
      }
      getDomElement(): HTMLCanvasElement {
        return this._canvas;
      }
      dispose(): void {
        this._canvas.remove();
      }
    },
  };
});

import { SceneManager } from '../scene/SceneManager';
import { FullHandFanPreviewUI, computeFanLayout } from '../ui/components/FullHandFanPreviewUI';
import type { FanCardData } from '../ui/components/FullHandFanPreviewUI';
import { HAND_ZONE_CONFIG } from '../objects/HandZoneConfig';

const LOCAL_SESSION = 'session_local_178';

let rafCallbacks: (() => void)[] = [];
let rafId = 0;
const mockRaf = (cb: () => void): number => {
  rafCallbacks.push(cb);
  return ++rafId;
};
const mockCancelRaf = (): void => {
  /* no-op */
};

function hoverCard(sceneManager: SceneManager, card: any): void {
  const im = sceneManager.getInteractionManager() as unknown as {
    _hoveredObject: any;
    onHoverChanged: ((curr: any, prev: any) => void) | null;
  };
  const prev = im._hoveredObject;
  im._hoveredObject = card;
  im.onHoverChanged?.(card, prev);
}

function leaveHand(sceneManager: SceneManager): void {
  const im = sceneManager.getInteractionManager() as unknown as {
    _hoveredObject: any;
    onHoverChanged: ((curr: any, prev: any) => void) | null;
  };
  const prev = im._hoveredObject;
  im._hoveredObject = null;
  im.onHoverChanged?.(null, prev);
}

describe('M1.7.8 — Full Hand Fan Preview (screen-space overlay)', () => {
  let container: HTMLElement;
  let overlay: HTMLElement;
  let fan: FullHandFanPreviewUI;
  let sceneManager: SceneManager;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);

    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1024, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 768, configurable: true });
    document.body.appendChild(container);

    overlay = document.createElement('div');
    document.body.appendChild(overlay);

    fan = new FullHandFanPreviewUI(overlay);
    sceneManager = new SceneManager(container);
    sceneManager.setupPlayerLayout(4);
    sceneManager.setLocalSessionId(LOCAL_SESSION);
    sceneManager.setPlayerPerspective(0, 4, false);

    // Mirror the App-level wiring: local hover → open/close, hand change → refresh.
    sceneManager.onLocalHandHoverChanged = (hovering) => {
      if (!hovering) {
        fan.hide();
        return;
      }
      const hand = sceneManager.getLocalHandCards();
      if (hand.length === 0) {
        fan.hide();
        return;
      }
      fan.show(
        hand.map(
          (card): FanCardData => ({
            id: card.cardId,
            cardType: card.getCardType(),
            title: card.getContent().title ?? '',
            masked: card.isMasked(),
          })
        )
      );
    };
    sceneManager.onLocalHandChanged = () => {
      if (!fan.isOpen()) return;
      const hand = sceneManager.getLocalHandCards();
      if (hand.length === 0) {
        fan.hide();
        return;
      }
      fan.show(
        hand.map(
          (card): FanCardData => ({
            id: card.cardId,
            cardType: card.getCardType(),
            title: card.getContent().title ?? '',
            masked: card.isMasked(),
          })
        )
      );
    };
  });

  afterEach(() => {
    fan.dispose();
    sceneManager.dispose();
    container.remove();
    overlay.remove();
    vi.unstubAllGlobals();
  });

  const drawHandCard = (id: string, type = 'attack', playerIndex = 0, ownerId = LOCAL_SESSION): any =>
    sceneManager.syncDrawnCard(id, playerIndex, type, true, ownerId)!;

  const localHandZone = () => sceneManager.getHandZoneManager().getHandZoneForPlayer(0)!;

  const drawLocalHand = (prefix: string, count: number) => {
    const ids: string[] = [];
    const cards: any[] = [];
    for (let i = 0; i < count; i++) {
      const id = `${prefix}_${i}`;
      ids.push(id);
      cards.push(drawHandCard(id));
    }
    localHandZone().arrangeCards();
    return { ids, cards };
  };

  // ── F178-01 … F178-03: hovering ANY hand card shows the whole hand ──────────

  it('F178-01: hovering the FIRST hand card opens the fan with the entire hand', () => {
    const { ids, cards } = drawLocalHand('f178_01', 3);
    hoverCard(sceneManager, cards[0]!);

    expect(sceneManager.isLocalHandHovered()).toBe(true);
    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual(ids);
  });

  it('F178-02: hovering the MIDDLE hand card opens the fan with the entire hand', () => {
    const { ids, cards } = drawLocalHand('f178_02', 3);
    hoverCard(sceneManager, cards[1]!);

    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual(ids);
  });

  it('F178-03: hovering the LAST hand card opens the fan with the entire hand', () => {
    const { ids, cards } = drawLocalHand('f178_03', 3);
    hoverCard(sceneManager, cards[2]!);

    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual(ids);
  });

  // ── F178-04 / F178-05 / F178-06: fan geometry per hand size ─────────────────

  it('F178-04: hand of 5 renders a fan of 5 cards with distinct symmetric rotations', () => {
    const { cards } = drawLocalHand('f178_04', 5);
    hoverCard(sceneManager, cards[2]!);

    const els = fan.getCardElements();
    expect(els.length).toBe(5);
    expect(fan.getRenderedCardIds()).toHaveLength(5);

    const layout = computeFanLayout(5, 1024, 768);
    expect(layout.cards).toHaveLength(5);
    const angles = layout.cards.map((c) => c.angleDeg);
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(5); // all rotations distinct
    expect(angles[2]).toBeCloseTo(0, 5); // centre card straight
    expect(Math.abs(angles[0]!) + Math.abs(angles[4]!)).toBeGreaterThan(0); // outer tilted
  });

  it('F178-05: hand of 10 adjusts overlap automatically and keeps all cards visible', () => {
    const { cards } = drawLocalHand('f178_05', 10);
    hoverCard(sceneManager, cards[9]!);

    expect(fan.isOpen()).toBe(true);
    const els = fan.getCardElements();
    expect(els.length).toBe(10);
    expect(fan.getRenderedCardIds()).toHaveLength(10);

    const layout10 = computeFanLayout(10, 1024, 768);
    expect(layout10.cards).toHaveLength(10);
    const angles10 = layout10.cards.map((c) => c.angleDeg);
    expect(new Set(angles10.map((a) => a.toFixed(3))).size).toBe(10);

    const layout5 = computeFanLayout(5, 1024, 768);
    const spacing10 = layout10.cards[1]!.x - layout10.cards[0]!.x;
    const spacing5 = layout5.cards[1]!.x - layout5.cards[0]!.x;
    expect(spacing10).toBeLessThanOrEqual(spacing5); // more overlap for more cards
  });

  it('F178-06: hand of 15 renders 15 cards and the fan fits the viewport', () => {
    const { cards } = drawLocalHand('f178_06', 15);
    hoverCard(sceneManager, cards[7]!);

    const layout = computeFanLayout(15, 1024, 768);
    expect(layout.cards).toHaveLength(15);
    const margin = 30.72; // FAN_PREVIEW_LAYOUT.VIEWPORT_MARGIN_RATIO × 1024 for this width
    expect(layout.totalWidth).toBeLessThanOrEqual(1024 - margin * 2);
    const el = fan.getCardElements();
    expect(el).toHaveLength(15);
  });

  // ── F178-07: hover switch keeps the fan open without flicker ───────────────

  it('F178-07: moving between hand cards keeps the same fan DOM nodes (no flicker)', () => {
    const { cards } = drawLocalHand('f178_07', 3);
    hoverCard(sceneManager, cards[0]!);
    const firstOpen = fan.getCardElements();
    expect(firstOpen).toHaveLength(3);

    hoverCard(sceneManager, cards[2]!);

    const afterSwitch = fan.getCardElements();
    expect(afterSwitch).toHaveLength(3);
    // Same DOM nodes reused → no rebuild / flicker.
    expect(afterSwitch[0]).toBe(firstOpen[0]);
    expect(afterSwitch[2]).toBe(firstOpen[2]);
    expect(fan.isOpen()).toBe(true);
  });

  // ── F178-08: pointer leaving the HAND closes the fan ────────────────────────

  it('F178-08: pointer leaving the HAND closes the fan', () => {
    const { cards } = drawLocalHand('f178_08', 2);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    leaveHand(sceneManager);
    expect(fan.isOpen()).toBe(false);
    expect(fan.getRenderedCardIds()).toEqual([]);
    expect(fan.getRootElement()?.getAttribute('aria-hidden')).toBe('true');
  });

  // ── F178-09: drag start hides the fan immediately ───────────────────────────

  it('F178-09 (M1.7.10): starting a drag keeps the fan open', () => {
    const { cards } = drawLocalHand('f178_09', 2);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    sceneManager.getDragController().onDragStarted?.(cards[0]!);

    // M1.7.10 supersedes the M1.7.8 rule: the fan stays visible during drags.
    expect(fan.isOpen()).toBe(true);
  });

  // ── F178-10: played card is dropped from the fan list ───────────────────────

  it('F178-10: played card is dropped from the open fan list', () => {
    const { ids, cards } = drawLocalHand('f178_10', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.getRenderedCardIds()).toEqual(ids);

    // Card played to the table → leaves the local hand zone.
    localHandZone().removeCard(ids[1]!);

    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual([ids[0]!, ids[2]!]);
  });

  // ── F178-11: opponent HAND never opens the fan ───────────────────────────────

  it('F178-11: hovering an opponent hand card never opens the fan', () => {
    drawHandCard('f178_11_opp', 'attack', 1, 'session_opponent');

    const opponentCard = sceneManager.getObject('f178_11_opp') as any;
    expect(opponentCard).toBeDefined();
    hoverCard(sceneManager, opponentCard);

    expect(sceneManager.isLocalHandHovered()).toBe(false);
    expect(fan.isOpen()).toBe(false);
    expect(fan.getRenderedCardIds()).toEqual([]);
  });

  // ── F178-12: original 3D card transforms stay flat/untouched ─────────────────

  it('F178-12: fan preview never changes the original card transforms', () => {
    const { cards } = drawLocalHand('f178_12', 2);
    const hovered = cards[1]!;
    const baselinePos = hovered.position.clone();

    hoverCard(sceneManager, hovered);
    expect(fan.isOpen()).toBe(true);
    const hoveredLayerDuringFan = hovered.getLayerIndex();
    const hoveredScaleDuringFan = hovered.scale.x;

    // Close + reopen the fan (leave hand → hover again) — the fan must not touch transforms.
    leaveHand(sceneManager);
    hoverCard(sceneManager, hovered);

    expect(hovered.position.y).toBeCloseTo(baselinePos.y + HAND_ZONE_CONFIG.HOVER_LIFT_Y, 5);
    expect(hovered.rotation.x).toBeCloseTo(0, 9);
    expect(hovered.rotation.z).toBeCloseTo(0, 9);
    expect(hovered.scale.x).toBeCloseTo(hoveredScaleDuringFan, 6);
    expect(hovered.getLayerIndex()).toBe(hoveredLayerDuringFan);
    expect(hovered.position.x).toBeCloseTo(baselinePos.x, 6);
    expect(hovered.position.z).toBeCloseTo(baselinePos.z, 6);
  });

  // ── F178-13: no fan state leaks between preview instances ───────────────────

  it('F178-13: fan state does not leak between overlay instances', () => {
    const secondOverlay = document.createElement('div');
    document.body.appendChild(secondOverlay);
    const secondFan = new FullHandFanPreviewUI(secondOverlay);
    try {
      const { cards } = drawLocalHand('f178_13', 2);
      hoverCard(sceneManager, cards[0]!);
      expect(fan.isOpen()).toBe(true);
      expect(secondFan.isOpen()).toBe(false);

      fan.hide(true);
      expect(fan.isOpen()).toBe(false);
      expect(secondFan.isOpen()).toBe(false);
    } finally {
      secondFan.dispose();
      secondOverlay.remove();
    }
  });

  // ── F178-14: resize keeps fan centred and within bounds ─────────────────────

  it('F178-14: resize keeps the fan centred and within bounds', () => {
    const { cards } = drawLocalHand('f178_14', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const layout = computeFanLayout(3, 480, 400);
    expect(layout.cardHeight).toBeLessThan(computeFanLayout(3, 1024, 768).cardHeight);
    expect(layout.cardHeight).toBeLessThan(400 * 0.46);
    const margin = Math.max(16, Math.min(40, 480 * 0.03));
    expect(layout.totalWidth).toBeLessThanOrEqual(480 - margin * 2);
    expect(els.length).toBe(3);
  });
});
