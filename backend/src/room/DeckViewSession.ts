import type { DeckViewMode, DeckViewState } from '../../../shared/types/protocol.js';
import type { SandboxObject } from '../../../shared/types/room.js';
import { IdGenerator } from '../utils/IdGenerator.js';

export class DeckViewSession {
  readonly id = IdGenerator.generate();
  private _order: number[];

  constructor(
    readonly mode: DeckViewMode,
    readonly viewerId: string,
    readonly viewerName: string,
    readonly seat: number,
    private readonly _cards: SandboxObject[],
  ) {
    this._order = _cards.map((_, index) => index);
  }

  setOrder(order: number[]): boolean {
    if (this.mode !== 'alter' || order.length !== this._cards.length ||
      new Set(order).size !== order.length ||
      order.some(token => !Number.isSafeInteger(token) || token < 0 || token >= this._cards.length)) return false;
    this._order = [...order];
    return true;
  }

  orderedCards(): SandboxObject[] {
    return this._order.map(token => this._cards[token]!);
  }

  viewFor(sessionId: string): DeckViewState {
    return {
      id: this.id, mode: this.mode, viewerId: this.viewerId, viewerName: this.viewerName, seat: this.seat,
      cards: this._order.map(token => {
        const card = this._cards[token]!;
        return { token, ...(sessionId === this.viewerId || card.faceUp ? { cardType: card.cardType } : {}) };
      }),
    };
  }
}
