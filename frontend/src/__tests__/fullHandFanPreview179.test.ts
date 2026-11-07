/**
 * fullHandFanPreview179.test.ts — M1.7.9 Part B: Interactive Full Hand Fan Preview
 *
 * Regression suite F179-01 … F179-14.
 *
 * Upgrades the M1.7.8 screen-space Full Hand Fan Preview into an interactive
 * fan (hover / click-select / drag) while keeping the verified M1.7.8 design:
 *   - F179-01: Hover HAND → Fan opens showing the entire hand (new handler path).
 *   - F179-02: Move HAND → Preview → fan must NOT close.
 *   - F179-03: Hover a preview card → forwards the exact source cardId.
 *   - F179-04: Click a preview card → selects the REAL card (single-select).
 *   - F179-05: Drag a preview card → real drag pipeline activates, fan stays open.
 *   - F179-06: Drop after fan-drag → existing gameplay drop pipeline runs.
 *   - F179-07: Hover between preview cards → no flicker, same DOM nodes.
 *   - F179-08: Preview → HAND → fan stays open.
 *   - F179-09: Leave both HAND and Preview → fan closes.
 *   - F179-10: Played card leaves the fan list on hand update.
 *   - F179-11: Multi-selection via fan clicks does not conflict.
 *   - F179-12: Flip/rotate paths leave the real card state untouched.
 *   - F179-13: Drag start keeps the fan open for the whole gesture (M1.7.10).
 *   - F179-14: Preview state stays local-only, no leak between instances.
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
import { FullHandFanPreviewUI } from '../ui/components/FullHandFanPreviewUI';
import type { FanCardData } from '../ui/components/FullHandFanPreviewUI';

const LOCAL_SESSION = 'session_local_179';

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

function fireMouseEvent(target: EventTarget, type: string, options: Partial<MouseEventInit> = {}): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
}

describe('M1.7.9 Part B — Interactive Full Hand Fan Preview', () => {
  let container: HTMLElement;
  let overlay: HTMLElement;
  let fan: FullHandFanPreviewUI;
  let sceneManager: SceneManager;
  let interaction: any;
  let dragCtrl: any;

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

    interaction = sceneManager.getInteractionManager();
    dragCtrl = sceneManager.getDragController();

    // Mirror the App-level M1.7.9 Part B wiring: fan → real card pipeline.
    fan.setHandlers({
      onCardHover: (sourceCardId: string) => {
        const card = sceneManager.getObject(sourceCardId) as any;
        if (!card) return;
        interaction.setHoveredObject(card);
      },
      onCardSelect: (sourceCardId: string, addToSelection: boolean) => {
        const card = sceneManager.getObject(sourceCardId) as any;
        if (!card) return;
        if (addToSelection) {
          if (!interaction.isSelected(card)) interaction.selectObject(card, true);
          return;
        }
        const selectedCards = interaction.getSelectedCards();
        const isAloneSelected = selectedCards.length === 1 && selectedCards[0]!.cardId === card.cardId;
        if (isAloneSelected) {
          interaction.deselectObject(card);
        } else {
          interaction.selectObject(card, false);
        }
      },
      onCardDragStart: (sourceCardId: string, event: MouseEvent) => {
        const card = sceneManager.getObject(sourceCardId) as any;
        if (!card) return;
        dragCtrl.beginDrag(card, event);
      },
    });

    // Wire local hand hover → open/close the full fan preview (M1.7.8 behaviour).
    sceneManager.onLocalHandHoverChanged = (hovering: boolean) => {
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
          (card: any): FanCardData => ({
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
          (card: any): FanCardData => ({
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

  const findFanElement = (fanCardId: string): HTMLElement | undefined =>
    fan.getCardElements().find((el) => el.dataset.fanCardId === fanCardId);

  // ── F179-01: Hover HAND opens the fan with the entire hand ────────────────

  it('F179-01: hovering a local HAND card opens the fan with the entire hand', () => {
    const { ids, cards } = drawLocalHand('f179_01', 3);
    hoverCard(sceneManager, cards[0]!);

    expect(sceneManager.isLocalHandHovered()).toBe(true);
    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual(ids);
  });

  // ── F179-02: Moving HAND → Preview keeps the fan open ─────────────────────

  it('F179-02: moving the pointer from HAND into the fan preview keeps the fan open', () => {
    const { ids, cards } = drawLocalHand('f179_02', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    // Pointer now "enters" the fan overlay area → fan card interaction path.
    fireMouseEvent(els[0]!, 'mouseover', { clientX: 100, clientY: 300 });
    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual(ids);
  });

  // ── F179-03: Hovering a preview card forwards the exact source cardId ─────

  it('F179-03: hovering a preview card forwards the exact source cardId to hover', () => {
    const { ids, cards } = drawLocalHand('f179_03', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    const targetEl = findFanElement(ids[1]!);
    expect(targetEl).toBeDefined();
    fireMouseEvent(targetEl!, 'mouseover', { clientX: 100, clientY: 300 });

    expect(interaction.getHoveredObject()?.cardId).toBe(ids[1]);
    expect(fan.isOpen()).toBe(true);
  });

  // ── F179-04: Click on preview card selects the REAL card ───────────────────

  it('F179-04: clicking a preview card selects the real corresponding card', () => {
    const { ids, cards } = drawLocalHand('f179_04', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(findFanElement(ids[2]!)!, 'click', { clientX: 100, clientY: 300 });
    const selected = interaction.getSelectedCards();
    expect(selected).toHaveLength(1);
    expect(selected[0]!.cardId).toBe(ids[2]);
    expect(selected[0]).toBe(cards[2]);
  });

  // ── F179-05: Drag from preview card → real drag pipeline + fan close ───────

  it('F179-05 (M1.7.10): dragging a preview card runs the real drag pipeline and keeps the fan open', () => {
    const { cards } = drawLocalHand('f179_05', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    // Press alone must NOT close the fan — only real drag activation does.
    expect(fan.isOpen()).toBe(true);

    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    expect(dragCtrl.getDraggedCard()?.cardId).toBe(cards[0]!.cardId);
    // M1.7.10 supersedes the M1.7.8 rule: the fan stays open during the drag.
    expect(fan.isOpen()).toBe(true);

    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);
    expect(dragCtrl.getDraggedCard()).toBeNull();
  });

  // ── F179-06: Drop after fan-drag → existing gameplay drop pipeline runs ────

  it('F179-06: dropping a card dragged from the fan runs the existing drop pipeline', () => {
    const { cards } = drawLocalHand('f179_06', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    const dropSpy = vi.fn();
    dragCtrl.onCardDropped = dropSpy;

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    fireMouseEvent(window, 'mouseup');

    expect(dropSpy).toHaveBeenCalledTimes(1);
    expect(dragCtrl.isDragging()).toBe(false);
  });

  // ── F179-07: Hover between preview cards → no flicker / same DOM nodes ────

  it('F179-07: hovering between preview cards keeps the fan open without flicker', () => {
    const { ids, cards } = drawLocalHand('f179_07', 3);
    hoverCard(sceneManager, cards[0]!);
    const firstEls = fan.getCardElements();
    expect(firstEls).toHaveLength(3);

    fireMouseEvent(firstEls[0]!, 'mouseover', { clientX: 100, clientY: 300 });
    expect(fan.isOpen()).toBe(true);

    const secondEl = findFanElement(ids[2]!);
    expect(secondEl).toBeDefined();
    fireMouseEvent(secondEl!, 'mouseover', { clientX: 300, clientY: 300 });

    const afterEls = fan.getCardElements();
    expect(afterEls).toHaveLength(3);
    // Same DOM nodes reused → no rebuild / flicker.
    expect(afterEls[0]).toBe(firstEls[0]);
    expect(afterEls[2]).toBe(firstEls[2]);
    expect(fan.isOpen()).toBe(true);
  });

  // ── F179-08: Preview → HAND boundary keeps the fan open ────────────────────

  it('F179-08: moving from the preview back into the HAND keeps the fan open', () => {
    const { cards } = drawLocalHand('f179_08', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    const els = fan.getCardElements();
    fireMouseEvent(els[0]!, 'mouseover', { clientX: 100, clientY: 300 });
    expect(fan.isOpen()).toBe(true);

    // Pointer leaves the overlay and lands on another real HAND card.
    hoverCard(sceneManager, cards[1]!);
    expect(fan.isOpen()).toBe(true);
    expect(sceneManager.isLocalHandHovered()).toBe(true);
  });

  // ── F179-09: Leaving both HAND and Preview closes the fan ───────────────────

  it('F179-09: leaving both the HAND and the preview closes the fan', () => {
    const { cards } = drawLocalHand('f179_09', 2);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    leaveHand(sceneManager);
    expect(fan.isOpen()).toBe(false);
  });

  // ── F179-10: Played card leaves the fan list on hand update ────────────────

  it('F179-10: a card played from the fan hand update is dropped from the fan', () => {
    const { ids, cards } = drawLocalHand('f179_10', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.getRenderedCardIds()).toEqual(ids);

    localHandZone().removeCard(ids[1]!);

    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual([ids[0]!, ids[2]!]);
  });

  // ── F179-11: Multi-selection via fan clicks does not conflict ───────────────

  it('F179-11: multi-select through fan clicks selects the real cards without conflict', () => {
    const { ids, cards } = drawLocalHand('f179_11', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(findFanElement(ids[0]!)!, 'click', { clientX: 100, clientY: 300 });
    expect(interaction.getSelectedCards()).toHaveLength(1);

    // Ctrl/Cmd-click adds the second real card to the selection.
    fireMouseEvent(findFanElement(ids[1]!)!, 'click', { clientX: 200, clientY: 300, ctrlKey: true });
    const selected = interaction.getSelectedCards();
    expect(selected).toHaveLength(2);
    expect(selected.map((c: any) => c.cardId).sort()).toEqual([ids[0]!, ids[1]!].sort());
  });

  // ── F179-12: Fan interactions must not desync real card state ──────────────

  it('F179-12: selecting via the fan does not alter the real card transforms', () => {
    const { cards } = drawLocalHand('f179_12', 2);
    const target = cards[1]!;
    const baselinePos = target.position.clone();
    const baselineRot = target.rotation.clone();

    hoverCard(sceneManager, cards[0]!);
    fireMouseEvent(findFanElement(cards[0]!.cardId)!, 'click', { clientX: 100, clientY: 300 });
    // Select the second card via its preview element.
    const els = fan.getCardElements();
    const secondEl = els.find((el) => el.dataset.fanCardId === cards[1]!.cardId);
    fireMouseEvent(secondEl!, 'click', { clientX: 200, clientY: 300 });

    expect(interaction.getSelectedCards()).toHaveLength(1);
    expect(target.position.x).toBeCloseTo(baselinePos.x, 6);
    expect(target.position.z).toBeCloseTo(baselinePos.z, 6);
    expect(target.rotation.x).toBeCloseTo(baselineRot.x, 6);
    expect(target.rotation.y).toBeCloseTo(baselineRot.y, 6);
  });

  // ── F179-13: Drag start closes the fan exactly when the drag activates ────

  it('F179-13 (M1.7.10): the fan stays open exactly when the drag from the preview activates', () => {
    const { cards } = drawLocalHand('f179_13', 2);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    const els = fan.getCardElements();
    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    // Plain press: fan stays open (no drag yet).
    expect(fan.isOpen()).toBe(true);

    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    // Real drag activated — M1.7.10 keeps the preview visible for the gesture.
    expect(dragCtrl.isDragging()).toBe(true);
    expect(fan.isOpen()).toBe(true);

    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);
  });

  // ── F179-14: Preview state is local-only (no leak between instances) ───────

  it('F179-14: fan preview state does not leak between overlay instances', () => {
    const secondOverlay = document.createElement('div');
    document.body.appendChild(secondOverlay);
    const secondFan = new FullHandFanPreviewUI(secondOverlay);
    try {
      const { cards } = drawLocalHand('f179_14', 2);
      hoverCard(sceneManager, cards[0]!);
      expect(fan.isOpen()).toBe(true);
      expect(secondFan.isOpen()).toBe(false);

      const els = fan.getCardElements();
      fireMouseEvent(els[0]!, 'mouseover', { clientX: 100, clientY: 300 });
      fireMouseEvent(els[0]!, 'click', { clientX: 100, clientY: 300 });

      expect(fan.isOpen()).toBe(true);
      expect(secondFan.isOpen()).toBe(false);
    } finally {
      secondFan.dispose();
      secondOverlay.remove();
    }
  });
});
