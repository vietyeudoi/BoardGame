/**
 * CardStackManager.ts — Tabletop Card Stack Lifecycle Manager (M1.3.4 / M1.3.4.2 / M1.3.4.3)
 * Coordinates all CardStack collections on the tabletop.
 *
 * Guarantees:
 * - A card can belong to at most ONE stack.
 * - Prevents circular or conflicting stack ownership.
 * - Stacks can be created, merged, split, or dissolved cleanly.
 *
 * Stack ordering invariant:
 *   cards[0] = bottom card, cards[cards.length - 1] = top card
 */
import type * as THREE from 'three';
import type { CardObject3D } from './CardObject3D';
import type { TableShapeParams } from './TableShapeConfig';
import { CardStack } from './CardStack';
import { INTERACTION_CONFIG } from '../interaction/InteractionConfig';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CardStackManager');

export class CardStackManager {
  private readonly _stacks = new Map<string, CardStack>();
  private _scene?: THREE.Scene;
  private _tableParamsGetter?: () => TableShapeParams;

  /**
   * Sets the Three.js scene reference so stacks can attach visual badges (M1.3.4.3).
   */
  setScene(scene: THREE.Scene): void {
    this._scene = scene;
  }

  /**
   * Sets the table parameter getter so stacks can clamp to dynamic table geometry (M1.4.3).
   */
  setTableParamsGetter(getter: () => TableShapeParams): void {
    this._tableParamsGetter = getter;
  }

  /**
   * Creates a new stack containing the provided cards in order (index 0 = bottom).
   * Cards must be standalone (not already in another stack).
   */
  createStack(cards: CardObject3D[], id?: string): CardStack {
    if (!cards || cards.length === 0) {
      throw new Error('CardStackManager: Cannot create an empty stack');
    }

    // Verify none of the cards already belong to another stack
    for (const card of cards) {
      if (card.isInStack()) {
        throw new Error(
          `CardStackManager: Card "${card.cardId}" is already part of stack "${card.getStackId()}"`
        );
      }
    }

    const stack = new CardStack({
      id,
      cards,
      position: {
        x: cards[0]!.position.x,
        y: cards[0]!.position.y,
        z: cards[0]!.position.z,
      },
      scene: this._scene,
      tableParams: this._tableParamsGetter,
    });

    this._stacks.set(stack.stackId, stack);
    logger.info(`Created stack "${stack.stackId}" with ${cards.length} cards`);
    return stack;
  }

  /**
   * Retrieves a stack by its ID.
   */
  getStack(stackId: string): CardStack | undefined {
    return this._stacks.get(stackId);
  }

  /**
   * Finds the stack containing a specific card ID.
   */
  getStackForCard(cardId: string): CardStack | undefined {
    for (const stack of this._stacks.values()) {
      if (stack.containsCard(cardId)) {
        return stack;
      }
    }
    return undefined;
  }

  /**
   * Inserts a single card at a specific index into an existing stack (M1.3.4.5).
   * index = number of cards below the inserted card.
   * If index is omitted, defaults to top (targetStack.getCount()).
   * If the card is already in another stack, it is removed from that stack first.
   */
  insertCardIntoStack(card: CardObject3D, targetStack: CardStack, index?: number): void {
    if (!card || card.isDisposed()) {
      throw new Error('CardStackManager.insertCardIntoStack: Cannot insert null or disposed card');
    }

    // Remove from existing stack first if necessary
    if (card.isInStack()) {
      const prevStackId = card.getStackId()!;
      if (prevStackId === targetStack.stackId) return; // already in target stack

      const prevStack = this._stacks.get(prevStackId);
      if (prevStack) {
        prevStack.removeCard(card.cardId);
        if (prevStack.getCount() <= 1) {
          this.dissolveStack(prevStackId);
        }
      } else {
        card.setStackId(null);
      }
    }

    const targetCount = targetStack.getCount();
    const insertIdx = index !== undefined ? Math.max(0, Math.min(index, targetCount)) : targetCount;
    targetStack.insertCardAt(card, insertIdx);
    logger.debug(
      `insertCardIntoStack: inserted card "${card.cardId}" at index ${insertIdx} into stack "${targetStack.stackId}"`
    );
  }

  /**
   * Adds a single card to the top of an existing stack.
   * If the card is already in another stack, it is removed from that stack first.
   * M1.3.4.2: Handles card-in-stack → add to target stack correctly.
   */
  addCardToStack(card: CardObject3D, targetStack: CardStack): void {
    this.insertCardIntoStack(card, targetStack, targetStack.getCount());
  }

  /**
   * Inserts all cards from sourceStack into targetStack at the specified index (M1.3.4.5).
   * index = number of cards below the inserted stack.
   * Result ordering: [...targetStack.cards.slice(0, index), ...sourceStack.cards, ...targetStack.cards.slice(index)]
   * sourceStack is dissolved after insertion.
   */
  insertStackIntoStack(sourceStack: CardStack, targetStack: CardStack, index?: number): CardStack {
    if (sourceStack.stackId === targetStack.stackId) {
      throw new Error('CardStackManager.insertStackIntoStack: Cannot insert a stack into itself');
    }

    const targetCount = targetStack.getCount();
    const insertIdx = index !== undefined ? Math.max(0, Math.min(index, targetCount)) : targetCount;

    const sourceCards = sourceStack.getCards();
    for (const card of sourceCards) {
      card.setStackId(null);
    }

    sourceStack.forceDispose();
    this._stacks.delete(sourceStack.stackId);

    targetStack.insertCardsAt(sourceCards, insertIdx);
    logger.info(
      `insertStackIntoStack: inserted "${sourceStack.stackId}" (${sourceCards.length} cards) into "${targetStack.stackId}" at index ${insertIdx} (total: ${targetStack.getCount()})`
    );

    return targetStack;
  }

  /**
   * Merges sourceStack ON TOP of targetStack.
   * Result ordering: [...targetStack.cards, ...sourceStack.cards]
   * sourceStack is dissolved after merge.
   * M1.3.4.2: Method for Stack+Stack merging.
   */
  mergeStacks(sourceStack: CardStack, targetStack: CardStack): CardStack {
    return this.insertStackIntoStack(sourceStack, targetStack, targetStack.getCount());
  }

  /**
   * Merges sourceStack onto a standalone targetCard (M1.3.4.3 / M1.3.4.5).
   * If targetCard is in a stack, delegates to insertStackIntoStack.
   * If targetCard is standalone:
   *   index = 0: sourceStack at bottom, targetCard on top: [...sourceCards, targetCard]
   *   index >= 1: targetCard at bottom, sourceStack on top: [targetCard, ...sourceCards]
   */
  mergeStackOntoCard(sourceStack: CardStack, targetCard: CardObject3D, index?: number): CardStack {
    if (targetCard.isInStack()) {
      const targetStack = this.getStack(targetCard.getStackId()!);
      if (targetStack) {
        return this.insertStackIntoStack(sourceStack, targetStack, index);
      }
    }

    const sourceCards = sourceStack.getCards();
    for (const card of sourceCards) {
      card.setStackId(null);
    }
    sourceStack.forceDispose();
    this._stacks.delete(sourceStack.stackId);

    const insertIdx = index !== undefined ? Math.max(0, Math.min(index, 1)) : 1;
    const finalCards = insertIdx === 0 ? [...sourceCards, targetCard] : [targetCard, ...sourceCards];

    const newStack = this.createStack(finalCards);
    logger.info(
      `mergeStackOntoCard: merged "${sourceStack.stackId}" onto card "${targetCard.cardId}" (index: ${insertIdx}) into "${newStack.stackId}"`
    );
    return newStack;
  }

  /**
   * Stacks one card on top of another, or joins/merges existing stacks.
   * M1.3.4.2 / M1.3.4.3: Fully handles all four stacking cases:
   *   - standalone → standalone: new stack [target(bottom), incoming(top)]
   *   - standalone → in-stack:   add incoming on top of target's stack
   *   - in-stack → standalone:   incomingStack placed on top of target card
   *   - in-stack → in-stack:     merge incoming's stack on top of target's stack
   */
  stackCards(target: CardObject3D, incoming: CardObject3D): CardStack {
    if (target.cardId === incoming.cardId) {
      throw new Error('CardStackManager: Cannot stack a card on itself');
    }

    const targetStack = this.getStackForCard(target.cardId);
    const incomingStack = incoming.isInStack() ? this.getStack(incoming.getStackId()!) : undefined;

    // Case 4: Both in stacks → merge incoming's stack on top of target's stack
    if (targetStack && incomingStack) {
      if (targetStack.stackId === incomingStack.stackId) {
        return targetStack; // Same stack already — no-op
      }
      return this.mergeStacks(incomingStack, targetStack);
    }

    // Case 2: target is in a stack, incoming is standalone → add incoming on top of target's stack
    if (targetStack && !incomingStack) {
      targetStack.addCard(incoming);
      return targetStack;
    }

    // Case 3: incoming is in a stack, target is standalone → remove incoming from old stack first
    if (!targetStack && incomingStack) {
      incomingStack.removeCard(incoming.cardId);
      if (incomingStack.getCount() <= 1) {
        this.dissolveStack(incomingStack.stackId);
      }
      // Both now standalone — fall through to create new stack
    }

    // Case 1: Both standalone → form new stack: target = bottom, incoming = top
    return this.createStack([target, incoming]);
  }

  /**
   * Removes a card from whichever stack it belongs to.
   * Returns the removed card (now standalone), or null if card wasn't in any stack.
   * If the stack drops to ≤1 card, it is dissolved.
   * M1.3.4.2: Explicit card removal API.
   */
  removeCardFromStack(card: CardObject3D): CardObject3D | null {
    if (!card.isInStack()) return null;

    const stackId = card.getStackId()!;
    const stack = this._stacks.get(stackId);
    if (!stack) {
      // Stack not found — orphan card, clear manually
      card.setStackId(null);
      return card;
    }

    stack.removeCard(card.cardId);
    if (stack.getCount() <= 1) {
      this.dissolveStack(stackId);
    }

    logger.debug(`removeCardFromStack: removed card "${card.cardId}" from stack "${stackId}"`);
    return card;
  }

  /**
   * Takes the top card from a stack.
   * If the stack drops to 1 card, it is dissolved.
   */
  takeTopCard(stackId: string): CardObject3D | null {
    const stack = this._stacks.get(stackId);
    if (!stack) return null;

    const topCard = stack.takeTopCard();
    if (stack.getCount() <= 1) {
      this.dissolveStack(stackId);
    }
    return topCard;
  }

  /**
   * Dissolves a stack: clears all card stackId references and deletes the stack.
   */
  dissolveStack(stackId: string): void {
    const stack = this._stacks.get(stackId);
    if (!stack) return;

    stack.dispose();
    this._stacks.delete(stackId);
    logger.info(`Dissolved stack "${stackId}"`);
  }

  /**
   * Finds an existing stack or another card within proximity of `card`
   * on the tabletop surface.
   * M1.3.4.3: Checks both stack base and member cards, generous drop zone.
   */
  findNearbyTarget(
    card: CardObject3D,
    allCards: CardObject3D[],
    radius: number = INTERACTION_CONFIG.DROP_ZONE_RADIUS
  ): CardObject3D | CardStack | null {
    const cardX = card.position.x;
    const cardZ = card.position.z;
    const cardStackId = card.isInStack() ? card.getStackId() : null;

    // 1. Check existing stacks (generous DROP_ZONE_RADIUS)
    for (const stack of this._stacks.values()) {
      if (stack.containsCard(card.cardId)) continue;

      // Check distance to base position
      const pos = stack.getPosition();
      const distSq = (cardX - pos.x) ** 2 + (cardZ - pos.z) ** 2;
      if (distSq <= radius * radius) {
        return stack;
      }

      // Also check distance to any card in this stack (e.g. top card)
      for (const stackCard of stack.getCards()) {
        const cDistSq = (cardX - stackCard.position.x) ** 2 + (cardZ - stackCard.position.z) ** 2;
        if (cDistSq <= radius * radius) {
          return stack;
        }
      }
    }

    // 2. Check standalone cards (tight STACK_DETECT_RADIUS to avoid accidental stacking)
    const cardRadius = Math.min(radius, INTERACTION_CONFIG.STACK_DETECT_RADIUS);
    for (const other of allCards) {
      if (other.cardId === card.cardId || other.isDisposed()) continue;
      // Skip cards that are in the same stack as the dragged card
      if (cardStackId && other.isInStack() && other.getStackId() === cardStackId) continue;

      const distSq = (cardX - other.position.x) ** 2 + (cardZ - other.position.z) ** 2;
      if (other.isInStack()) {
        if (distSq <= radius * radius) {
          const otherStack = this.getStack(other.getStackId()!);
          if (otherStack) return otherStack;
        }
      } else {
        if (distSq <= cardRadius * cardRadius) {
          return other;
        }
      }
    }

    return null;
  }

  /**
   * Returns all active stacks.
   */
  getAllStacks(): CardStack[] {
    return Array.from(this._stacks.values());
  }

  /**
   * Returns the total number of active stacks.
   */
  getStackCount(): number {
    return this._stacks.size;
  }

  dispose(): void {
    for (const stack of this._stacks.values()) {
      stack.dispose();
    }
    this._stacks.clear();
    logger.info('CardStackManager disposed');
  }
}
