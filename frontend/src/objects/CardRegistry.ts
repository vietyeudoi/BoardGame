/**
 * CardRegistry.ts — Centralized Card ID Ownership & Location Manager
 * Authoritative single source of truth for Card ID lifecycle in the 3D sandbox.
 * Adheres strictly to PROJECT_RULES.md and M1.3.3 Data Integrity requirements:
 *
 * 1. A Card ID cannot appear in two Decks.
 * 2. A Card ID cannot simultaneously exist in a Deck and on the Table.
 * 3. A Card ID cannot have two different CardObject3D instances.
 * 4. A CardObject3D cannot be created if its ID is still owned by a Deck.
 * 5. On successful draw, ownership transitions exactly once.
 * 6. On failed draw / rollback, IDs are preserved (never lost or leaked).
 * 7. Registry errors halt the transaction atomically.
 * 8. Card IDs are never regenerated or mutated during transfer.
 */
import type { CardObject3D } from './CardObject3D';
import type { DeckObject3D } from './DeckObject3D';
import { Logger } from '../utils/Logger';

const logger = Logger.create('CardRegistry');

export type CardLocation = 'IN_DECK' | 'ON_TABLE' | 'IN_HAND' | 'DISPOSED';

export interface CardRecord {
  readonly id: string;
  location: CardLocation;
  containerId: string; // deckId when IN_DECK, 'table' when ON_TABLE, handZoneId when IN_HAND
  cardObject?: CardObject3D;
}

export interface IntegrityCheckResult {
  valid: boolean;
  totalUnique: number;
  totalLocations: number;
  errors: string[];
}

export class CardRegistry {
  private readonly _records = new Map<string, CardRecord>();

  /**
   * Registers a collection of card IDs belonging to a specific Deck.
   * Rejects if any ID already exists in the registry or if duplicates exist within the list.
   */
  registerDeck(deckId: string, cardIds: readonly string[]): void {
    if (!deckId || typeof deckId !== 'string') {
      throw new Error('CardRegistry: deckId must be a non-empty string');
    }

    const seenInBatch = new Set<string>();
    for (const id of cardIds) {
      if (!id || typeof id !== 'string') {
        throw new Error(`CardRegistry: Invalid card ID in deck "${deckId}"`);
      }
      if (seenInBatch.has(id)) {
        throw new Error(`CardRegistry: Duplicate card ID "${id}" in batch for deck "${deckId}"`);
      }
      if (this._records.has(id)) {
        const existing = this._records.get(id)!;
        throw new Error(
          `CardRegistry: Card ID "${id}" already registered at location "${existing.location}" (container: "${existing.containerId}")`
        );
      }
      seenInBatch.add(id);
    }

    // Atomic commit
    for (const id of cardIds) {
      this._records.set(id, {
        id,
        location: 'IN_DECK',
        containerId: deckId,
      });
    }

    logger.debug(`Registered ${cardIds.length} cards for deck "${deckId}"`);
  }

  /**
   * Registers a standalone CardObject3D on the table (e.g. initial demo card).
   */
  registerTableCard(card: CardObject3D): void {
    const id = card.cardId;
    if (this._records.has(id)) {
      const existing = this._records.get(id)!;
      throw new Error(
        `CardRegistry: Card ID "${id}" already registered at location "${existing.location}" (container: "${existing.containerId}")`
      );
    }

    this._records.set(id, {
      id,
      location: 'ON_TABLE',
      containerId: 'table',
      cardObject: card,
    });

    logger.debug(`Registered table card "${id}"`);
  }

  /**
   * Checks whether a card ID can be legally transferred from a Deck to the Table.
   */
  canTransferDeckToTable(deckId: string, cardId: string): boolean {
    const record = this._records.get(cardId);
    if (!record) return false;
    return record.location === 'IN_DECK' && record.containerId === deckId;
  }

  /**
   * Atomically transfers card ownership from a Deck to a CardObject3D on the Table.
   * Throws if validation fails, preventing state divergence.
   */
  transferDeckToTable(deckId: string, cardId: string, card: CardObject3D): void {
    const record = this._records.get(cardId);
    if (!record) {
      throw new Error(`CardRegistry: Card ID "${cardId}" not found in registry`);
    }

    if (record.location !== 'IN_DECK') {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" is at location "${record.location}", expected "IN_DECK"`
      );
    }

    if (record.containerId !== deckId) {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" belongs to deck "${record.containerId}", not "${deckId}"`
      );
    }

    if (card.cardId !== cardId) {
      throw new Error(
        `CardRegistry: CardObject3D ID "${card.cardId}" does not match transfer ID "${cardId}"`
      );
    }

    // Atomic mutation
    record.location = 'ON_TABLE';
    record.containerId = 'table';
    record.cardObject = card;

    logger.debug(`Transferred card "${cardId}" from deck "${deckId}" to table`);
  }

  /**
   * Rolls back a transfer in case subsequent transaction steps fail (e.g. 3D scene insertion).
   * Restores ownership to the originating deck.
   */
  rollbackTableToDeck(deckId: string, cardId: string): void {
    const record = this._records.get(cardId);
    if (!record) return;

    record.location = 'IN_DECK';
    record.containerId = deckId;
    record.cardObject = undefined;

    logger.warn(`Rolled back card "${cardId}" to deck "${deckId}"`);
  }

  /**
   * Checks whether a card can be transferred to a player Hand Zone.
   */
  canTransferToHand(cardId: string): boolean {
    const record = this._records.get(cardId);
    if (!record) return false;
    return record.location === 'ON_TABLE' || record.location === 'IN_HAND';
  }

  /**
   * Transfers card ownership to a Hand Zone.
   */
  transferTableToHand(cardId: string, handZoneId: string): void {
    const record = this._records.get(cardId);
    if (!record) {
      throw new Error(`CardRegistry: Card ID "${cardId}" not found in registry`);
    }

    if (record.location !== 'ON_TABLE' && record.location !== 'IN_HAND') {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" is at location "${record.location}", expected "ON_TABLE" or "IN_HAND"`
      );
    }

    record.location = 'IN_HAND';
    record.containerId = handZoneId;
    logger.debug(`Transferred card "${cardId}" to hand "${handZoneId}"`);
  }

  /**
   * Transfers a card from a Hand Zone back to general table surface.
   */
  transferHandToTable(cardId: string): void {
    const record = this._records.get(cardId);
    if (!record) {
      throw new Error(`CardRegistry: Card ID "${cardId}" not found in registry`);
    }

    if (record.location !== 'IN_HAND') {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" is at location "${record.location}", expected "IN_HAND"`
      );
    }

    record.location = 'ON_TABLE';
    record.containerId = 'table';
    logger.debug(`Transferred card "${cardId}" from hand to table`);
  }

  /**
   * Transfers a card from one Hand Zone to another Hand Zone.
   */
  transferHandToHand(cardId: string, targetHandZoneId: string): void {
    const record = this._records.get(cardId);
    if (!record) {
      throw new Error(`CardRegistry: Card ID "${cardId}" not found in registry`);
    }

    if (record.location !== 'IN_HAND') {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" is at location "${record.location}", expected "IN_HAND"`
      );
    }

    record.containerId = targetHandZoneId;
    logger.debug(`Transferred card "${cardId}" to hand "${targetHandZoneId}"`);
  }

  /**
   * Transfers a card from a Hand Zone directly into a Deck.
   */
  transferHandToDeck(deckId: string, cardId: string): void {
    const record = this._records.get(cardId);
    if (!record) {
      throw new Error(`CardRegistry: Card ID "${cardId}" not found in registry`);
    }

    if (record.location !== 'IN_HAND') {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" is at location "${record.location}", expected "IN_HAND"`
      );
    }

    record.location = 'IN_DECK';
    record.containerId = deckId;
    record.cardObject = undefined;
    logger.debug(`Transferred card "${cardId}" from hand into deck "${deckId}"`);
  }

  /**
   * Checks whether a card on the table or in hand can be transferred back into a Deck.
   */
  canTransferTableToDeck(deckId: string, cardId: string): boolean {
    if (!deckId) return false;
    const record = this._records.get(cardId);
    if (!record) return false;
    return record.location === 'ON_TABLE' || record.location === 'IN_HAND';
  }

  /**
   * Transfers a card from the table or hand back into a Deck.
   */
  transferTableToDeck(deckId: string, cardId: string): void {
    const record = this._records.get(cardId);
    if (!record) {
      throw new Error(`CardRegistry: Card ID "${cardId}" not found in registry`);
    }

    if (record.location !== 'ON_TABLE' && record.location !== 'IN_HAND') {
      throw new Error(
        `CardRegistry: Card ID "${cardId}" is at location "${record.location}", expected "ON_TABLE" or "IN_HAND"`
      );
    }

    record.location = 'IN_DECK';
    record.containerId = deckId;
    record.cardObject = undefined;

    logger.debug(`Transferred card "${cardId}" from table/hand back into deck "${deckId}"`);
  }

  /**
   * Rolls back a Table -> Deck transfer if subsequent steps in the transaction fail.
   * Restores location to ON_TABLE with the card object attached.
   * M1.3.4.5: Advanced Deck & Stack Insertion.
   */
  rollbackDeckToTable(deckId: string, cardId: string, card: CardObject3D): void {
    const record = this._records.get(cardId);
    if (!record) return;

    record.location = 'ON_TABLE';
    record.containerId = 'table';
    record.cardObject = card;

    logger.warn(`Rolled back card "${cardId}" from deck "${deckId}" back to table`);
  }

  /**
   * Checks whether a card has been marked as DISPOSED.
   */
  isDisposed(cardId: string): boolean {
    return this._records.get(cardId)?.location === 'DISPOSED';
  }

  /**
   * Marks a table or hand card as disposed when removed from scene.
   */
  unregisterTableCard(cardId: string): void {
    const record = this._records.get(cardId);
    if (!record) return;

    if (record.location === 'ON_TABLE' || record.location === 'IN_HAND') {
      record.location = 'DISPOSED';
      record.containerId = 'none';
      record.cardObject = undefined;
      logger.debug(`Unregistered table card "${cardId}" (marked DISPOSED)`);
    }
  }

  // ─── Query Accessors ────────────────────────────────────────────────────────

  getRecord(cardId: string): Readonly<CardRecord> | undefined {
    const rec = this._records.get(cardId);
    return rec ? { ...rec } : undefined;
  }

  getLocation(cardId: string): CardLocation | undefined {
    return this._records.get(cardId)?.location;
  }

  getCardObject(cardId: string): CardObject3D | undefined {
    return this._records.get(cardId)?.cardObject;
  }

  hasCard(cardId: string): boolean {
    return this._records.has(cardId);
  }

  getTotalCount(): number {
    return this._records.size;
  }

  getAllCardIds(): string[] {
    return Array.from(this._records.keys());
  }

  getCardsInDeck(deckId: string): string[] {
    const result: string[] = [];
    for (const [id, rec] of this._records.entries()) {
      if (rec.location === 'IN_DECK' && rec.containerId === deckId) {
        result.push(id);
      }
    }
    return result;
  }

  getCardsOnTable(): CardObject3D[] {
    const result: CardObject3D[] = [];
    for (const rec of this._records.values()) {
      if (rec.location === 'ON_TABLE' && rec.cardObject) {
        result.push(rec.cardObject);
      }
    }
    return result;
  }

  getCardsInHand(handZoneId?: string): CardObject3D[] {
    const result: CardObject3D[] = [];
    for (const rec of this._records.values()) {
      if (rec.location === 'IN_HAND' && rec.cardObject) {
        if (!handZoneId || rec.containerId === handZoneId) {
          result.push(rec.cardObject);
        }
      }
    }
    return result;
  }

  // ─── Data Integrity Verification ──────────────────────────────────────────

  /**
   * Authoritative integrity audit.
   * Verifies that total unique Card IDs equals total cards across all physical locations
   * (Decks + Table Cards), and that every object in the scene matches registry records.
   */
  validateIntegrity(decks: DeckObject3D[], tableCards: CardObject3D[]): IntegrityCheckResult {
    const errors: string[] = [];
    const seenPhysicalIds = new Set<string>();

    let totalPhysicalCards = 0;

    // 1. Audit Decks
    for (const deck of decks) {
      const deckIds = deck.getCardIds();
      totalPhysicalCards += deckIds.length;

      for (const id of deckIds) {
        if (seenPhysicalIds.has(id)) {
          errors.push(`Duplicate physical card ID "${id}" detected in deck "${deck.getId()}"`);
        }
        seenPhysicalIds.add(id);

        const rec = this._records.get(id);
        if (!rec) {
          errors.push(`Card "${id}" in deck "${deck.getId()}" not registered in CardRegistry`);
        } else if (rec.location !== 'IN_DECK' || rec.containerId !== deck.getId()) {
          errors.push(
            `Card "${id}" in deck "${deck.getId()}" has inconsistent registry state: location="${rec.location}", container="${rec.containerId}"`
          );
        }
      }
    }

    // 2. Audit Table Cards
    for (const card of tableCards) {
      if (card.isDisposed()) continue;
      const id = card.cardId;
      totalPhysicalCards += 1;

      if (seenPhysicalIds.has(id)) {
        errors.push(`Card ID "${id}" on table conflicts with another object or deck`);
      }
      seenPhysicalIds.add(id);

      const rec = this._records.get(id);
      if (!rec) {
        errors.push(`Card "${id}" on table not registered in CardRegistry`);
      } else if (rec.location !== 'ON_TABLE' && rec.location !== 'IN_HAND') {
        errors.push(
          `Card "${id}" on table has inconsistent registry location "${rec.location}"`
        );
      } else if (rec.cardObject !== card) {
        errors.push(`Card "${id}" on table instance does not match registry cardObject reference`);
      }
    }

    // 3. Audit Active Registry Records against Physical State
    let activeRegistryCount = 0;
    for (const [id, rec] of this._records.entries()) {
      if (rec.location !== 'DISPOSED') {
        activeRegistryCount += 1;
        if (!seenPhysicalIds.has(id)) {
          errors.push(
            `Registry record "${id}" (${rec.location}) has no corresponding physical object`
          );
        }
      }
    }

    const uniqueCount = seenPhysicalIds.size;
    const isCountConsistent = uniqueCount === totalPhysicalCards && uniqueCount === activeRegistryCount;

    if (!isCountConsistent) {
      errors.push(
        `Count mismatch: uniquePhysical=${uniqueCount}, totalPhysical=${totalPhysicalCards}, activeRegistry=${activeRegistryCount}`
      );
    }

    return {
      valid: errors.length === 0,
      totalUnique: uniqueCount,
      totalLocations: totalPhysicalCards,
      errors,
    };
  }

  clear(): void {
    this._records.clear();
    logger.info('CardRegistry cleared');
  }
}

