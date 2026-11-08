/**
 * persistentFanDrag1710.test.ts — M1.7.10 Part A: Full Hand Fan Preview stays
 * visible during drag + Part B: hover / selection visual effects.
 *
 * Regression suite F1710-01 … F1710-17.
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

const LOCAL_SESSION = 'session_local_1710';

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

describe('M1.7.10 Part A+B — Persistent Interactive Fan Preview & Hover/Select visuals', () => {
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

    // Mirror the App-level M1.7.10 wiring.
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
        } else {
          const selectedCards = interaction.getSelectedCards();
          const isAloneSelected = selectedCards.length === 1 && selectedCards[0]!.cardId === card.cardId;
          if (isAloneSelected) {
            interaction.deselectObject(card);
          } else {
            interaction.selectObject(card, false);
          }
        }
        fan.setSelectedSourceIds(interaction.getSelectedCards().map((c: any) => c.cardId));
      },
      onCardDragStart: (sourceCardId: string, event: MouseEvent, offset) => {
        const card = sceneManager.getObject(sourceCardId) as any;
        if (!card) return;
        fan.setDraggingSourceId(sourceCardId);
        if (offset) dragCtrl.beginPreviewDrag(card, event, offset);
        else dragCtrl.beginDrag(card, event);
      },
      onCardReorder: (sourceCardId: string, targetIndex: number) => {
        const hand = localHandZone();
        const order = hand.getCardIds();
        const sourceIndex = order.indexOf(sourceCardId);
        if (sourceIndex < 0) return;
        order.splice(sourceIndex, 1);
        order.splice(Math.max(0, Math.min(order.length, targetIndex)), 0, sourceCardId);
        hand.reorderCards(order);
      },
      onFanDragStateChanged: (sourceCardId: string | null) => {
        sceneManager.setLocalHandFanDragActive(sourceCardId !== null);
      },
    });

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

  const dragFromFan = (fanCardId: string, targetClientX: number, targetClientY: number): void => {
    const el = findFanElement(fanCardId);
    expect(el).toBeDefined();
    // Press inside the hand region (400,400) so a short drag keeps the drop
    // target inside HAND — jsdom reports an empty element rect otherwise.
    fireMouseEvent(el!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: targetClientX, clientY: targetClientY });
  };

  // ── F1710-01: Drag bắt đầu từ Preview → Preview vẫn hiện ──────────────────

  it('F1710-01: fan preview stays open when a drag starts from the preview', () => {
    const { ids, cards } = drawLocalHand('f1710_01', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    const els = fan.getCardElements();
    expect(els).toHaveLength(3);
    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    expect(fan.isOpen()).toBe(true); // press alone keeps fan open

    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    // M1.7.10: fan must REMAIN open during the drag.
    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toEqual(ids);

    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);
  });

  // ── F1710-02/03/04: drag lifecycle & fan updates ────────────────────────────

  it('F1710-02: dragging a preview card to the table keeps the fan open; drop updates preview', () => {
    sceneManager.isPointOverLocalHandPreview = () => true;
    const { cards } = drawLocalHand('f1710_02', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    expect(fan.isOpen()).toBe(true);

    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);

    // Drop to table → dragged card leaves hand → fan (still open) refreshes.
    expect(fan.isOpen()).toBe(true);
  });

  it('F1710-03: dragging a preview card to reorder the hand keeps the fan open', () => {
    sceneManager.isPointOverLocalHandPreview = () => true;
    const { cards } = drawLocalHand('f1710_03', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(els[2]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 420, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    expect(fan.isOpen()).toBe(true);

    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);
    // Card returned / reordered → fan stays open and reflects the hand.
    expect(fan.isOpen()).toBe(true);
  });

  it('F1710-04: successful drop updates the fan preview accordingly', () => {
    const { cards } = drawLocalHand('f1710_04', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    const dropSpy = vi.fn();
    dragCtrl.onCardDropped = dropSpy;
    fireMouseEvent(window, 'mouseup');
    expect(dropSpy).toHaveBeenCalledTimes(1);
    expect(fan.isOpen()).toBe(true);
  });

  it('F1710-05: failed (cancelled) drag returns the card to the hand', () => {
    const { cards } = drawLocalHand('f1710_05', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    dragCtrl.cancelDrag();
    expect(dragCtrl.isDragging()).toBe(false);
    expect(fan.isOpen()).toBe(true); // fan keeps open after cancel + hover re-eval
  });

  it('F1710-06: consecutive fan drags map to the correct source cards', () => {
    sceneManager.isPointOverLocalHandPreview = () => true;
    const first = drawLocalHand('f1710_06a', 3);
    hoverCard(sceneManager, first.cards[0]!);
    dragFromFan(first.ids[0]!, 410, 400);
    expect(dragCtrl.isDragging()).toBe(true);
    // The real card driven by the drag is exactly the fan card the user grabbed.
    expect(dragCtrl.getDraggedCard()?.cardId).toBe(first.ids[0]);
    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);

    const second = drawLocalHand('f1710_06b', 3);
    hoverCard(sceneManager, second.cards[0]!);
    dragFromFan(second.ids[0]!, 412, 400);
    expect(dragCtrl.isDragging()).toBe(true);
    expect(dragCtrl.getDraggedCard()?.cardId).toBe(second.ids[0]);
    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);
    expect(fan.isOpen()).toBe(true);
  });

  // ── F1710-07: Hover lift / scale / highlight ───────────────────────────────

  it('F1710-07: hovering a preview card applies lift + scale visuals', () => {
    const { cards } = drawLocalHand('f1710_07', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    const target = findFanElement(cards[1]!.cardId)!;
    fireMouseEvent(target, 'mouseover', { clientX: 200, clientY: 300 });
    expect(target.style.getPropertyValue('--dy-hover')).toBe('-10px');
    expect(target.style.getPropertyValue('--scale')).toBe('1.04');
    expect(target.classList.contains('fhfp-card--selected')).toBe(false);
    // Hover must render above every neighbouring card (exactly one layer above
    // the current hand's maximum slot z — no stale z from a larger hand).
    const hoveredZ = Number(target.style.zIndex || 0);
    const otherZ = fan
      .getCardElements()
      .filter((el) => el !== target)
      .map((el) => Number(el.style.zIndex || 0));
    expect(hoveredZ).toBeGreaterThan(Math.max(...otherZ));
    expect(hoveredZ).toBe(Math.max(...otherZ) + 1);

    fireMouseEvent(target, 'mouseout', { clientX: 200, clientY: 300 });
    expect(target.style.getPropertyValue('--dy-hover')).toBe('0px');
    expect(target.style.getPropertyValue('--scale')).toBe('1');
  });

  it('F1711-01/02: dragging through the fan previews order, then commits one ID order on release', () => {
    // jsdom không đo được root; con trỏ y=600 nằm trong vùng preview thật.
    sceneManager.isPointOverLocalHandPreview = () => true;
    const { ids } = drawLocalHand('f1711_reorder', 5);
    hoverCard(sceneManager, localHandZone().getCard(ids[0]!)!);
    const original = localHandZone().getCardIds();
    const elements = fan.getCardElements();
    const moved = elements[1]!;
    const targetSlotX = Number(elements[3]!.dataset.fanX);
    const centerX = window.innerWidth / 2 + targetSlotX;

    fireMouseEvent(moved, 'mousedown', { button: 0, clientX: 400, clientY: 600 });
    fireMouseEvent(window, 'mousemove', { clientX: centerX, clientY: 600 });
    expect(localHandZone().getCardIds()).toEqual(original);
    expect(dragCtrl.isDragging()).toBe(false);
    fireMouseEvent(window, 'mouseup');

    expect(localHandZone().getCardIds()).toEqual([ids[0], ids[2], ids[3], ids[1], ids[4]]);
    expect(fan.getRenderedCardIds()).toEqual(localHandZone().getCardIds());
    expect(new Set(localHandZone().getCardIds()).size).toBe(5);
  });

  it('F1711-03: pointer cancellation rolls back a fan-only reorder and clears drag state', () => {
    sceneManager.isPointOverLocalHandPreview = () => true;
    const { ids, cards } = drawLocalHand('f1711_cancel', 4);
    hoverCard(sceneManager, cards[0]!);
    const original = localHandZone().getCardIds();
    const elements = fan.getCardElements();
    const targetSlotX = Number(elements[3]!.dataset.fanX);

    fireMouseEvent(elements[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 600 });
    fireMouseEvent(window, 'mousemove', { clientX: window.innerWidth / 2 + targetSlotX, clientY: 600 });
    expect(sceneManager.isLocalHandDragActive()).toBe(true);
    window.dispatchEvent(new Event('pointercancel'));

    expect(localHandZone().getCardIds()).toEqual(original);
    expect(fan.getRenderedCardIds()).toEqual(ids);
    expect(sceneManager.isLocalHandDragActive()).toBe(false);
    expect(fan.isOpen()).toBe(true);
  });

  // ── F1710-08/09/10: Selected visuals ───────────────────────────────────────

  it('F1710-08: clicking a preview card marks the fan card selected', () => {
    const { cards } = drawLocalHand('f1710_08', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(findFanElement(cards[2]!.cardId)!, 'click', { clientX: 100, clientY: 300 });
    expect(interaction.getSelectedCards()).toHaveLength(1);
    const selectedEl = findFanElement(cards[2]!.cardId)!;
    expect(selectedEl.classList.contains('fhfp-card--selected')).toBe(true);
    // Selected outranks every other slot.
    const selectedZ = Number(selectedEl.style.zIndex || 0);
    const otherZ = fan
      .getCardElements()
      .filter((el) => el !== selectedEl)
      .map((el) => Number(el.style.zIndex || 0));
    expect(selectedZ).toBeGreaterThan(Math.max(...otherZ));
  });

  it('F1710-09: hovering another preview card while selected does not clear selection', () => {
    const { cards } = drawLocalHand('f1710_09', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(findFanElement(cards[0]!.cardId)!, 'click', { clientX: 100, clientY: 300 });
    expect(interaction.getSelectedCards()).toHaveLength(1);
    const selectedEl = findFanElement(cards[0]!.cardId)!;

    const target = findFanElement(cards[1]!.cardId)!;
    fireMouseEvent(target, 'mouseover', { clientX: 200, clientY: 300 });
    expect(interaction.getSelectedCards()).toHaveLength(1);
    expect(interaction.getSelectedCards()[0]!.cardId).toBe(cards[0]!.cardId);
    expect(target.classList.contains('fhfp-card--selected')).toBe(false);
    // Hover never outranks the selection.
    expect(Number(selectedEl.style.zIndex || 0)).toBeGreaterThan(
      Number(target.style.zIndex || 0)
    );
  });

  it('F1710-10: multi-selection through fan clicks selects several real cards', () => {
    const { ids, cards } = drawLocalHand('f1710_10', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    fireMouseEvent(findFanElement(ids[0]!)!, 'click', { clientX: 100, clientY: 300 });
    fireMouseEvent(findFanElement(ids[1]!)!, 'click', { clientX: 200, clientY: 300, ctrlKey: true });
    const selected = interaction.getSelectedCards();
    expect(selected).toHaveLength(2);
  });

  // ── F1710-11/12: boundary during / after drag ───────────────────────────────

  it('F1710-11: fan does not close during a drag (boundary stays open)', () => {
    const { cards } = drawLocalHand('f1710_11', 2);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(2);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    expect(fan.isOpen()).toBe(true);

    // While dragging, the interaction zone (hand + preview) is still "held".
    expect(sceneManager.isLocalHandDragActive()).toBe(true);
    // Drag outranks both selection and hover in the fan stacking order.
    const draggedEl = findFanElement(cards[0]!.cardId)!;
    const dragZ = Number(draggedEl.style.zIndex || 0);
    const otherZ = fan
      .getCardElements()
      .filter((el) => el !== draggedEl)
      .map((el) => Number(el.style.zIndex || 0));
    expect(dragZ).toBeGreaterThan(Math.max(...otherZ));
    fireMouseEvent(window, 'mouseup');
    expect(dragCtrl.isDragging()).toBe(false);
    expect(sceneManager.isLocalHandDragActive()).toBe(false);
  });

  it('F1710-12: after drag ends and pointer leaves both regions, fan closes', () => {
    const { cards } = drawLocalHand('f1710_12', 2);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(2);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    fireMouseEvent(window, 'mouseup');

    // Drag ended; now move pointer out of HAND + Preview → fan must close.
    leaveHand(sceneManager);
    expect(fan.isOpen()).toBe(false);
  });

  // ── F1710-13: 15 cards layout intact during/after drag ─────────────────────

  it('F1710-13: 15-card fan keeps its layout while the drag runs', () => {
    const { cards } = drawLocalHand('f1710_13', 15);
    hoverCard(sceneManager, cards[7]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(15);

    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);
    expect(fan.isOpen()).toBe(true);
    expect(fan.getCardElements()).toHaveLength(15);

    fireMouseEvent(window, 'mouseup');
  });

  // ── F1710-14: hand change from server → preview updates ─────────────────────

  it('F1710-14: hand change refreshes the open fan preview', () => {
    const { ids, cards } = drawLocalHand('f1710_14', 3);
    hoverCard(sceneManager, cards[0]!);
    const els = fan.getCardElements();
    expect(els).toHaveLength(3);

    localHandZone().removeCard(ids[1]!);
    // Fan stays in authoritative HAND order (whatever the zone re-arranged it to).
    expect(fan.getRenderedCardIds()).toEqual(
      sceneManager.getLocalHandCards().map((c) => c.cardId)
    );
    expect(fan.getRenderedCardIds()).toHaveLength(2);
    expect(fan.getRenderedCardIds()).not.toContain(ids[1]);
  });

  // ── F1710-15: repeated drags do not leak DOM / state ────────────────────────

  it('F1710-15: repeated fan drags keep working without DOM leaks', () => {
    sceneManager.isPointOverLocalHandPreview = () => true;
    for (let i = 0; i < 30; i++) {
      const { ids, cards } = drawLocalHand(`f1710_15_${i}`, 2);
      hoverCard(sceneManager, cards[0]!);
      const els = fan.getCardElements();
      expect(els).toHaveLength(sceneManager.getLocalHandCards().length);

      fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
      fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
      expect(dragCtrl.isDragging()).toBe(true);
      expect(fan.isOpen()).toBe(true);
      fireMouseEvent(window, 'mouseup');
      expect(dragCtrl.isDragging()).toBe(false);

      sceneManager.flushCardTransfers();
      // No orphaned nodes: rendered fan nodes always match the live hand size.
      expect(fan.getCardElements()).toHaveLength(sceneManager.getLocalHandCards().length);
      expect(document.querySelectorAll('.fhfp-card')).toHaveLength(
        sceneManager.getLocalHandCards().length
      );

      // Reset the hand for the next iteration (keeps the fan at 2 cards).
      ids.forEach((id) => localHandZone().removeCard(id));
    }
  });

  // ── F1710-16/17: drag-end boundary rule (HAND + Preview) ───────────────────

  it('F1710-16: fan closes when a drop leaves the HAND and the pointer is outside the preview', () => {
    const { cards } = drawLocalHand('f1710_16', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    const els = fan.getCardElements();
    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);

    // Force the dragged card onto the table (outside every hand zone) so the
    // drop definitely leaves the local HAND, then finish the gesture there.
    cards[0]!.position.set(0, 0, 0);
    fireMouseEvent(window, 'mouseup', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(false);

    expect(sceneManager.getLocalHandCards().some((c) => c.cardId === cards[0]!.cardId)).toBe(
      false
    );
    expect(sceneManager.isLocalHandDragActive()).toBe(false);
    // Pointer is outside HAND + Preview after a table drop → fan closes.
    expect(fan.isOpen()).toBe(false);
  });

  it('F1710-17: fan stays open when the drop ends over the preview overlay', () => {
    const { cards } = drawLocalHand('f1710_17', 3);
    hoverCard(sceneManager, cards[0]!);
    expect(fan.isOpen()).toBe(true);

    // Mirror the App wiring: the preview overlay reports the pointer inside.
    sceneManager.isPointOverLocalHandPreview = () => true;

    const els = fan.getCardElements();
    fireMouseEvent(els[0]!, 'mousedown', { button: 0, clientX: 400, clientY: 400 });
    fireMouseEvent(window, 'mousemove', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(true);

    cards[0]!.position.set(0, 0, 0);
    fireMouseEvent(window, 'mouseup', { clientX: 410, clientY: 400 });
    expect(dragCtrl.isDragging()).toBe(false);

    expect(sceneManager.getLocalHandCards().some((c) => c.cardId === cards[0]!.cardId)).toBe(
      false
    );
    // Preview is part of the interaction zone → fan remains visible.
    expect(fan.isOpen()).toBe(true);
  });

  it.each([0, 1, 5])('Nhận bài vào HAND có %i lá: nhả drag và mở fan ngay tại con trỏ đứng yên', (count) => {
    drawLocalHand('receive', count);
    const zone = localHandZone();
    vi.spyOn(sceneManager, 'getTableIntersectionAtScreenPos').mockReturnValue({ x: zone.position.x, z: zone.position.z });
    const card = sceneManager.getAllCards().find((item) => !item.isInHand())!;
    dragCtrl.beginDrag(card, new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 }));
    fireMouseEvent(window, 'mousemove', { clientX: 430, clientY: 300 });
    expect(sceneManager.isLocalHandDragActive()).toBe(true);
    card.position.set(zone.position.x, zone.position.y, zone.position.z);
    fireMouseEvent(window, 'mouseup', { clientX: 430, clientY: 300 });
    expect(sceneManager.isLocalHandDragActive()).toBe(false);
    expect(card.isInHand()).toBe(true);
    expect(fan.isOpen()).toBe(true);
    expect(fan.getRenderedCardIds()).toHaveLength(count + 1);
    sceneManager.flushCardTransfers();
    expect(fan.isOpen()).toBe(true);
  });

  it.each(['Escape', 'pointercancel', 'blur'])('Hủy kéo bài TABLE bằng %s không giữ cờ khóa hover', (kind) => {
    drawLocalHand('cancel_table', 1);
    const card = sceneManager.getAllCards().find((item) => !item.isInHand())!;
    dragCtrl.beginDrag(card, new MouseEvent('mousedown', { button: 0, clientX: 400, clientY: 300 }));
    fireMouseEvent(window, 'mousemove', { clientX: 430, clientY: 300 });
    window.dispatchEvent(kind === 'Escape' ? new KeyboardEvent('keydown', { key: 'Escape' }) : new Event(kind));
    expect(dragCtrl.isDragging()).toBe(false);
    expect(sceneManager.isLocalHandDragActive()).toBe(false);
    sceneManager.flushCardTransfers();
    hoverCard(sceneManager, sceneManager.getLocalHandCards()[0]);
    expect(fan.isOpen()).toBe(true);
  });
});
