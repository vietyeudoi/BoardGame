/**
 * smartDiscard143.test.ts — Unit tests for M1.4.3 Goal B: Smart Discard Stacks
 * Tests automatic grouping, merging, extraction, and dissolution of discard stacks,
 * as well as strict CardRegistry ownership invariants.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { CardObject3D } from '../objects/CardObject3D';

// Mock WebGLRenderer for Node/JSDOM test runner
vi.mock('../scene/Renderer', () => {
  return {
    Renderer: class MockRenderer {
      private readonly _canvas: HTMLCanvasElement;
      private readonly _camera: THREE.PerspectiveCamera;

      constructor(container: HTMLElement) {
        this._canvas = document.createElement('canvas');
        container.appendChild(this._canvas);
        this._camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
      }

      getCamera() {
        return this._camera;
      }
      getDomElement() {
        return this._canvas;
      }
      startLoop() {}
      stopLoop() {}
      requestRender() {}
      handleResize() {}
      dispose() {
        this._canvas.remove();
      }
    },
  };
});

describe('M1.4.3 — Goal B: Smart Discard Stack Lifecycle', () => {
  let container: HTMLDivElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    sceneManager = new SceneManager(container);
  });

  afterEach(() => {
    sceneManager.dispose();
    container.remove();
  });

  it('detects coordinates inside the Discard Zone correctly', () => {
    const discardPos = sceneManager.getTableZoneManager().getDiscardPosition();
    expect(sceneManager.isInsideDiscardZone(discardPos.x, discardPos.z)).toBe(true);

    // Far outside Discard Zone
    expect(sceneManager.isInsideDiscardZone(0, 0)).toBe(false);
    expect(sceneManager.isInsideDiscardZone(-10, 10)).toBe(false);
  });

  it('dropping a single card into Discard Zone creates a Discard Stack', () => {
    const discardPos = sceneManager.getTableZoneManager().getDiscardPosition();
    const card1 = new CardObject3D({
      id: 'test_discard_card_1',
      position: { x: discardPos.x, y: 0, z: discardPos.z },
    });
    sceneManager.addObject('test_discard_card_1', card1);

    // Simulate drop into Discard Zone
    sceneManager.getDragController().onCardDropped?.(card1, false, []);

    const discardStack = sceneManager.getDiscardStack();
    expect(discardStack).not.toBeNull();
    expect(discardStack!.containsCard('test_discard_card_1')).toBe(true);
    expect(discardStack!.getCount()).toBe(1);
    expect(card1.isInStack()).toBe(true);
  });

  it('dropping a second card into Discard Zone adds it on top of existing Discard Stack', () => {
    const discardPos = sceneManager.getTableZoneManager().getDiscardPosition();
    const card1 = new CardObject3D({
      id: 'discard_card_a',
      position: { x: discardPos.x, y: 0, z: discardPos.z },
    });
    const card2 = new CardObject3D({
      id: 'discard_card_b',
      position: { x: 0, y: 0, z: 0 },
    });
    sceneManager.addObject('discard_card_a', card1);
    sceneManager.addObject('discard_card_b', card2);

    // Drop card1 in discard zone
    sceneManager.getDragController().onCardDropped?.(card1, false, []);
    expect(sceneManager.getDiscardStack()?.getCount()).toBe(1);

    // Now drag card2 to discard zone and drop it
    card2.position.set(discardPos.x, 0, discardPos.z);
    sceneManager.getDragController().onCardDropped?.(card2, false, []);

    const discardStack = sceneManager.getDiscardStack();
    expect(discardStack).not.toBeNull();
    expect(discardStack!.getCount()).toBe(2);
    // card1 at bottom, card2 on top
    expect(discardStack!.getBottomCard()?.cardId).toBe('discard_card_a');
    expect(discardStack!.getTopCard()?.cardId).toBe('discard_card_b');
  });

  it('dropping an existing Stack into Discard Zone merges all cards into Discard Stack', () => {
    const discardPos = sceneManager.getTableZoneManager().getDiscardPosition();

    // Create 3 cards
    const c1 = new CardObject3D({ id: 'c1', position: { x: discardPos.x, y: 0, z: discardPos.z } });
    const c2 = new CardObject3D({ id: 'c2', position: { x: 0, y: 0, z: 0 } });
    const c3 = new CardObject3D({ id: 'c3', position: { x: 0, y: 0, z: 0 } });
    sceneManager.addObject('c1', c1);
    sceneManager.addObject('c2', c2);
    sceneManager.addObject('c3', c3);

    // First card dropped in discard
    sceneManager.getDragController().onCardDropped?.(c1, false, []);
    expect(sceneManager.getDiscardStack()?.getCount()).toBe(1);

    // Form a stack with c2 and c3 on the table
    const sourceStack = sceneManager.getStackManager().createStack([c2, c3]);
    expect(sourceStack.getCount()).toBe(2);

    // Drop source stack into Discard Zone
    sourceStack.setPosition(discardPos.x, discardPos.z);
    c2.position.set(discardPos.x, 0, discardPos.z);
    sceneManager.getDragController().onCardDropped?.(c2, true, [c3]);

    const discardStack = sceneManager.getDiscardStack();
    expect(discardStack).not.toBeNull();
    expect(discardStack!.getCount()).toBe(3);
    expect(discardStack!.getCardIds()).toEqual(['c1', 'c2', 'c3']);
  });

  it('dragging a card out of Discard Stack dissolves stack when only 1 card remains', () => {
    const discardPos = sceneManager.getTableZoneManager().getDiscardPosition();
    const c1 = new CardObject3D({ id: 'd_c1', position: { x: discardPos.x, y: 0, z: discardPos.z } });
    const c2 = new CardObject3D({ id: 'd_c2', position: { x: 6.0, y: 0, z: 0 } });
    sceneManager.addObject('d_c1', c1);
    sceneManager.addObject('d_c2', c2);

    sceneManager.getDragController().onCardDropped?.(c1, false, []);
    c2.position.set(discardPos.x, 0, discardPos.z);
    sceneManager.getDragController().onCardDropped?.(c2, false, []);

    const stack = sceneManager.getDiscardStack();
    expect(stack?.getCount()).toBe(2);

    // Drag c2 out to empty space (6.0, 0, 0)
    c2.position.set(6.0, 0, 0);
    sceneManager.getDragController().onCardDropped?.(c2, false, []);

    // c2 is now standalone
    expect(c2.isInStack()).toBe(false);
    // Since only 1 card (c1) was left in stack, it dissolves
    expect(c1.isInStack()).toBe(false);
    expect(sceneManager.getDiscardStack()).toBeNull();
  });
});
