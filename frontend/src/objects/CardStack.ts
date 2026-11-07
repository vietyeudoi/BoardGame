/**
 * CardStack.ts — Tabletop Card Stack Management (M1.3.4 / M1.3.4.3)
 * Represents a physical vertical stack of CardObject3D instances on the tabletop.
 *
 * Invariants:
 * 1. A Card ID cannot appear twice in the same stack.
 * 2. A Card cannot belong to two stacks simultaneously.
 * 3. Cards in a stack retain their ON_TABLE ownership in CardRegistry.
 * 4. Cards in a stack are visually layered with physical Y-offsets to prevent Z-fighting,
 *    and subtle X/Z cascade offsets for aesthetic layered visibility (M1.3.4.3).
 * 5. When a stack has <= 1 card, it can be dissolved back to standalone cards.
 */
import type * as THREE from 'three';
import type { CardObject3D } from './CardObject3D';
import { TABLE_CONFIG } from './TableConfig';
import { CARD_CONFIG } from './CardConfig';
import type { TableShapeParams } from './TableShapeConfig';
import { INTERACTION_CONFIG, clampTablePosition } from '../interaction/InteractionConfig';
import { StackBadge } from './StackBadge';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CardStack');

export interface CardStackOptions {
  id?: string;
  cards?: CardObject3D[];
  position?: { x: number; y: number; z: number };
  scene?: THREE.Scene;
  tableParams?: () => TableShapeParams;
}

export class CardStack {
  public readonly stackId: string;
  private readonly _cards: CardObject3D[] = [];
  private _position: { x: number; y: number; z: number } = { x: 0, y: TABLE_CONFIG.SURFACE_Y, z: 0 };
  private _rotationY = 0;
  private readonly _badge?: StackBadge;
  private _isSelected = false;
  private readonly _tableParamsGetter?: () => TableShapeParams;

  constructor(options?: CardStackOptions) {
    this.stackId = options?.id ?? `stack_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

    if (options?.position) {
      this._position = { ...options.position };
    }

    if (options?.scene) {
      this._badge = new StackBadge(options.scene);
    }

    this._tableParamsGetter = options?.tableParams;

    if (options?.cards && options.cards.length > 0) {
      for (const card of options.cards) {
        this.addCard(card);
      }
    }

    logger.debug(`CardStack created: "${this.stackId}"`);
  }

  getCards(): CardObject3D[] {
    return [...this._cards];
  }

  getCardIds(): string[] {
    return this._cards.map((c) => c.cardId);
  }

  getCount(): number {
    return this._cards.length;
  }

  getTopCard(): CardObject3D | null {
    if (this._cards.length === 0) return null;
    return this._cards[this._cards.length - 1]!;
  }

  getBottomCard(): CardObject3D | null {
    if (this._cards.length === 0) return null;
    return this._cards[0]!;
  }

  containsCard(cardId: string): boolean {
    return this._cards.some((c) => c.cardId === cardId);
  }

  getPosition(): { x: number; y: number; z: number } {
    return { ...this._position };
  }

  getRotationY(): number {
    return this._rotationY;
  }

  setIsSelected(selected: boolean): void {
    this._isSelected = selected;
    this.realignCards();
  }

  isSelected(): boolean {
    return this._isSelected;
  }

  /**
   * Inserts a card at the specified index in the stack (0 = bottom, count = top).
   * index = number of cards below the inserted card.
   * Throws if index is out of bounds [0, count] or if the card already belongs to another stack.
   * M1.3.4.5: Advanced Deck & Stack Insertion.
   */
  insertCardAt(card: CardObject3D, index: number): void {
    if (!card || card.isDisposed()) {
      throw new Error(`CardStack "${this.stackId}": Cannot insert null or disposed card`);
    }

    if (this.containsCard(card.cardId)) {
      throw new Error(`CardStack "${this.stackId}": Card "${card.cardId}" is already in this stack`);
    }

    if (card.isInStack() && card.getStackId() !== this.stackId) {
      throw new Error(
        `CardStack "${this.stackId}": Card "${card.cardId}" already belongs to stack "${card.getStackId()}"`
      );
    }

    if (!Number.isInteger(index) || index < 0 || index > this._cards.length) {
      throw new Error(
        `CardStack "${this.stackId}": Invalid insertion index ${index}. Must be between 0 and ${this._cards.length}`
      );
    }

    // If this is the first card, initialize stack position and rotation from it
    if (this._cards.length === 0 && !this._position.x && !this._position.z) {
      this._position.x = card.position.x;
      this._position.z = card.position.z;
      this._rotationY = card.getRotationY();
    }

    this._cards.splice(index, 0, card);
    card.setStackId(this.stackId);

    // Centralized realign
    this.realignCards();

    logger.debug(
      `Card "${card.cardId}" inserted at index ${index} in stack "${this.stackId}" (depth=${this._cards.length})`
    );
  }

  /**
   * Inserts multiple cards at the specified index in the stack.
   * Preserves relative ordering: index 0 of cards placed at `index`.
   * M1.3.4.5: Advanced Deck & Stack Insertion.
   */
  insertCardsAt(cards: CardObject3D[], index: number): void {
    if (!cards || cards.length === 0) return;

    if (!Number.isInteger(index) || index < 0 || index > this._cards.length) {
      throw new Error(
        `CardStack "${this.stackId}": Invalid insertion index ${index}. Must be between 0 and ${this._cards.length}`
      );
    }

    // Validate all candidate cards first
    const existingIds = new Set(this._cards.map((c) => c.cardId));
    const newIds = new Set<string>();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      if (!card || card.isDisposed()) {
        throw new Error(
          `CardStack "${this.stackId}": Cannot insert null or disposed card at index ${i}`
        );
      }
      if (existingIds.has(card.cardId)) {
        throw new Error(`CardStack "${this.stackId}": Card "${card.cardId}" already in stack`);
      }
      if (newIds.has(card.cardId)) {
        throw new Error(
          `CardStack "${this.stackId}": Duplicate card "${card.cardId}" in insertion list`
        );
      }
      if (card.isInStack() && card.getStackId() !== this.stackId) {
        throw new Error(
          `CardStack "${this.stackId}": Card "${card.cardId}" already belongs to stack "${card.getStackId()}"`
        );
      }
      newIds.add(card.cardId);
    }

    // If first cards in stack, initialize stack position
    if (this._cards.length === 0 && !this._position.x && !this._position.z) {
      this._position.x = cards[0]!.position.x;
      this._position.z = cards[0]!.position.z;
      this._rotationY = cards[0]!.getRotationY();
    }

    this._cards.splice(index, 0, ...cards);
    for (const card of cards) {
      card.setStackId(this.stackId);
    }

    this.realignCards();
    logger.debug(
      `Inserted ${cards.length} cards at index ${index} in stack "${this.stackId}" (depth=${this._cards.length})`
    );
  }

  /**
   * Adds a card to the top of the stack.
   * Throws if the card is already in this stack or belongs to another stack.
   */
  addCard(card: CardObject3D): void {
    this.insertCardAt(card, this._cards.length);
  }

  /**
   * Removes and returns the top card from the stack.
   * Clears the card's stackId reference.
   */
  takeTopCard(): CardObject3D | null {
    if (this._cards.length === 0) return null;
    const card = this._cards.pop()!;
    card.setStackId(null);
    card.setCascadeOffset(0, 0);
    card.position.y = TABLE_CONFIG.SURFACE_Y;

    this.realignCards();

    logger.debug(`Took top card "${card.cardId}" from stack "${this.stackId}"`);
    return card;
  }

  /**
   * Removes a specific card by ID from anywhere in the stack.
   */
  removeCard(cardId: string): CardObject3D | null {
    const idx = this._cards.findIndex((c) => c.cardId === cardId);
    if (idx === -1) return null;

    const [card] = this._cards.splice(idx, 1);
    if (card) {
      card.setStackId(null);
      card.setCascadeOffset(0, 0);
      card.position.y = TABLE_CONFIG.SURFACE_Y;
      // Re-align remaining cards
      this.realignCards();
      logger.debug(`Removed card "${cardId}" from stack "${this.stackId}"`);
      return card;
    }
    return null;
  }

  /**
   * Moves the entire stack to a new (x, z) location on the table.
   * Clamps within table bounds.
   */
  setPosition(x: number, z: number): void {
    const clamped = clampTablePosition(
      x,
      z,
      this._rotationY,
      CARD_CONFIG.DEFAULT_WIDTH,
      CARD_CONFIG.DEFAULT_HEIGHT,
      this._tableParamsGetter?.()
    );
    this._position.x = clamped.x;
    this._position.z = clamped.z;

    this.realignCards();
  }

  /**
   * Rotates all cards in the stack around Y axis.
   */
  setRotationY(angleRadians: number): void {
    this._rotationY = angleRadians % (Math.PI * 2);
    if (this._rotationY < 0) this._rotationY += Math.PI * 2;

    for (const card of this._cards) {
      card.rotation.y = this._rotationY;
    }

    // Re-clamp stack position with new rotation extents and realign
    const clamped = clampTablePosition(
      this._position.x,
      this._position.z,
      this._rotationY,
      CARD_CONFIG.DEFAULT_WIDTH,
      CARD_CONFIG.DEFAULT_HEIGHT,
      this._tableParamsGetter?.()
    );
    this._position.x = clamped.x;
    this._position.z = clamped.z;
    this.realignCards();
  }

  rotateClockwise90(): void {
    this.setRotationY(this._rotationY + INTERACTION_CONFIG.ROTATION_STEP);
  }

  rotateCounterClockwise90(): void {
    this.setRotationY(this._rotationY - INTERACTION_CONFIG.ROTATION_STEP);
  }

  /**
   * Centralized layout calculation function (M1.3.4.3 Requirement A).
   * Calculates consistent physical positions for all cards in the stack,
   * applying uniform Y-elevation and subtle X/Z cascade stair-stepping.
   */
  realignCards(): void {
    const count = this._cards.length;
    const cos = Math.cos(this._rotationY);
    const sin = Math.sin(this._rotationY);

    for (let i = 0; i < count; i++) {
      const card = this._cards[i]!;
      const stepX = i * INTERACTION_CONFIG.STACK_CASCADE_OFFSET_X;
      const stepZ = i * INTERACTION_CONFIG.STACK_CASCADE_OFFSET_Z;

      const rx = stepX * cos - stepZ * sin;
      const rz = stepX * sin + stepZ * cos;

      card.position.x = this._position.x;
      card.position.y = TABLE_CONFIG.SURFACE_Y + i * INTERACTION_CONFIG.STACK_OFFSET_Y;
      card.position.z = this._position.z;
      card.rotation.y = this._rotationY;
      card.setCascadeOffset(rx, rz);
      card.setLayerIndex(i);
    }

    const top = this.getTopCard();
    if (this._badge && top) {
      this._badge.update(count, top.position, this._isSelected);
    } else if (this._badge) {
      this._badge.hide();
    }
  }

  dispose(): void {
    if (this._badge) {
      this._badge.dispose();
    }
    for (const card of this._cards) {
      card.setStackId(null);
      card.setCascadeOffset(0, 0);
      card.position.y = TABLE_CONFIG.SURFACE_Y;
    }
    this._cards.length = 0;
    logger.debug(`CardStack "${this.stackId}" disposed`);
  }

  /**
   * Force-disposes the stack without clearing card stackIds or Y positions.
   * Used exclusively by CardStackManager.mergeStacks() after cards have already
   * been reassigned to another stack. Do NOT call from other contexts.
   * M1.3.4.2
   */
  forceDispose(): void {
    if (this._badge) {
      this._badge.dispose();
    }
    for (const card of this._cards) {
      card.setCascadeOffset(0, 0);
    }
    this._cards.length = 0;
    logger.debug(`CardStack "${this.stackId}" force-disposed (cards already reassigned)`);
  }
}
