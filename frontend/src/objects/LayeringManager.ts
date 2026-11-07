/**
 * LayeringManager.ts — Tabletop Card Layering & Display Order (M1.3.4)
 * Manages the relative vertical display order and renderOrder of cards on the table.
 *
 * Design:
 * - Assigns deterministic layer indices to cards on the table.
 * - Applies microscopic Y offsets (0.001 per layer) to resolve depth buffer Z-fighting.
 * - Synchronizes Three.js `renderOrder` for transparent materials / alpha testing.
 * - Does not alter Card IDs, stack memberships, or CardRegistry ownership.
 */
import type { CardObject3D } from './CardObject3D';
import { Logger } from '../utils/Logger';

const logger = Logger.create('LayeringManager');

export class LayeringManager {
  private _layers: CardObject3D[] = [];

  /**
   * Registers or synchronizes the list of active tabletop cards.
   */
  syncCards(cards: CardObject3D[]): void {
    // Keep existing ordering for cards already known, append newly added ones
    const activeSet = new Set(cards.map((c) => c.cardId));
    this._layers = this._layers.filter((c) => activeSet.has(c.cardId) && !c.isDisposed());

    const existingSet = new Set(this._layers.map((c) => c.cardId));
    for (const card of cards) {
      if (!existingSet.has(card.cardId) && !card.isDisposed()) {
        this._layers.push(card);
      }
    }

    this._applyLayers();
  }

  /**
   * Moves a card to the highest visual layer (rendered on top of all other cards).
   */
  bringToFront(card: CardObject3D): void {
    const idx = this._layers.findIndex((c) => c.cardId === card.cardId);
    if (idx === -1 || idx === this._layers.length - 1) return;

    this._layers.splice(idx, 1);
    this._layers.push(card);
    this._applyLayers();
    logger.debug(`Brought card "${card.cardId}" to front (layer ${this._layers.length - 1})`);
  }

  /**
   * Moves a card to the lowest visual layer (rendered directly above felt surface).
   */
  sendToBack(card: CardObject3D): void {
    const idx = this._layers.findIndex((c) => c.cardId === card.cardId);
    if (idx === -1 || idx === 0) return;

    this._layers.splice(idx, 1);
    this._layers.unshift(card);
    this._applyLayers();
    logger.debug(`Sent card "${card.cardId}" to back (layer 0)`);
  }

  /**
   * Moves a card one step up in the display order.
   */
  moveUp(card: CardObject3D): void {
    const idx = this._layers.findIndex((c) => c.cardId === card.cardId);
    if (idx === -1 || idx >= this._layers.length - 1) return;

    const temp = this._layers[idx]!;
    this._layers[idx] = this._layers[idx + 1]!;
    this._layers[idx + 1] = temp;
    this._applyLayers();
  }

  /**
   * Moves a card one step down in the display order.
   */
  moveDown(card: CardObject3D): void {
    const idx = this._layers.findIndex((c) => c.cardId === card.cardId);
    if (idx <= 0) return;

    const temp = this._layers[idx]!;
    this._layers[idx] = this._layers[idx - 1]!;
    this._layers[idx - 1] = temp;
    this._applyLayers();
  }

  getLayerOf(cardId: string): number {
    return this._layers.findIndex((c) => c.cardId === cardId);
  }

  getTotalLayers(): number {
    return this._layers.length;
  }

  private _applyLayers(): void {
    for (let i = 0; i < this._layers.length; i++) {
      const card = this._layers[i]!;
      card.setLayerIndex(i);
    }
  }

  dispose(): void {
    this._layers.length = 0;
  }
}
