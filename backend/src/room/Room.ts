/**
 * Room.ts — Room state and player management (authoritative)
 */
import { ANONYMOUS_HAND_PREFIX, DEFAULT_DECK_AFFECTED_COUNT, DEFAULT_DECK_DRAW_END, type PublicDeckState, type DeckDrawEnd, type RoomState, type SandboxObject, type PlayerInfo, type DeckSetup, type RoundSetup } from '../../../shared/types/room.js';
import type { DeckViewMode, Vector3Like } from '../../../shared/types/protocol.js';
import { getDefaultSeatPlacement, SHARED_CONFIG } from '../../../shared/constants/config.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import { Logger } from '../utils/Logger.js';

import { buildRoundDeck, DEFAULT_DECK_SETUP, mergeDeckSetup, previewRound, shuffle } from './RoundDeck.js';

import { DeckViewSession } from './DeckViewSession.js';

const logger = Logger.create('Room');
const SEAT_CARD_LAYER_HEIGHT = 0.05;

interface PlayerRecord extends PlayerInfo {
  sessionId: string;
  resumeToken: string;
  hasLeft?: boolean;
}

export class Room {
  private readonly _drawHoverPlayers = new Set<string>();
  private readonly _players = new Map<string, PlayerRecord>();
  private readonly _objects = new Map<string, SandboxObject>();
  private readonly _handAliases = new WeakMap<SandboxObject, { ownerId: string; id: string }>();
  private readonly _dynamicLocks = new Map<string, string>();
  private _hostSessionId: string;
  private _phase?: RoundSetup['phase'];
  private _deckSetup = DEFAULT_DECK_SETUP;
  private _deckView?: DeckViewSession;
  private _deckAffectedCount = DEFAULT_DECK_AFFECTED_COUNT;
  private _deckDrawEnd: DeckDrawEnd = DEFAULT_DECK_DRAW_END;

  constructor(
    public readonly id: string,
    private readonly _name: string,
    hostSessionId: string,
    private readonly _password?: string,
    private readonly _maxPlayers: number = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM,
    initialObjects?: readonly SandboxObject[],
    private readonly _doubleDeck = false,
  ) {
    this._hostSessionId = hostSessionId;
    this._phase = initialObjects ? undefined : 'SETUP';
    for (const object of initialObjects ?? []) this._objects.set(object.id, { ...object });
  }

  get phase(): RoundSetup['phase'] | undefined { return this._phase; }

  get round(): RoundSetup | undefined {
    return this._phase ? previewRound(this._deckSetup, this._seatedPlayers().length, this._phase, this._doubleDeck) : undefined;
  }

  private _seatedPlayers(): PlayerRecord[] {
    return [...this._players.values()].filter(player => player.isConnected && !player.spectator);
  }

  configureRound(setup: DeckSetup): void {
    if (this._phase !== 'SETUP') throw new Error('Chỉ chỉnh bộ bài ở màn thiết lập.');
    this._deckSetup = mergeDeckSetup(this._deckSetup, setup);
  }

  dealRound(): void {
    if (this._phase !== 'SETUP') throw new Error('Ván này đã chia bài.');
    const cards = buildRoundDeck(this._deckSetup, this._seatedPlayers().map(player => player.id), this._doubleDeck);
    for (const card of cards) this._objects.set(card.id, card);
    this._phase = 'PLAYING';
    this.setDeckAffectedCount(this._deckAffectedCount);
  }

  resetRound(): void {
    if (this._phase !== 'PLAYING') throw new Error('Ván chưa bắt đầu.');
    this.closeDeckView();
    this._objects.clear();
    this._dynamicLocks.clear();
    this._drawHoverPlayers.clear();
    this._deckDrawEnd = DEFAULT_DECK_DRAW_END;
    this._deckAffectedCount = DEFAULT_DECK_AFFECTED_COUNT;
    this._phase = 'SETUP';
    for (const [id, player] of this._players) {
      if (player.hasLeft) this._players.delete(id);
    }
    for (const player of this._players.values()) {
      if (!player.spectator || !player.isConnected) continue;
      const index = this._findFreeSeat();
      if (index < 0) break;
      player.spectator = false;
      player.playerIndex = index;
    }
  }

  private _findFreeSeat(): number {
    for (let index = 0; index < this._maxPlayers; index++) {
      if (!this.getPlayerByIndex(index)) return index;
    }
    return -1;
  }

  getSeatCount(): number { return [...this._players.values()].filter(player => !player.spectator).length; }

  getDeckCount(): number { return this._getDeckCards().length; }

  getHandCount(ownerId: string): number {
    return [...this._objects.values()].filter(obj => obj.location === 'HAND' && obj.ownerId === ownerId).length;
  }

  getHandAlias(card: SandboxObject): string | undefined {
    if (card.location !== 'HAND' || !card.ownerId) return;
    const existing = this._handAliases.get(card);
    if (existing?.ownerId === card.ownerId) return existing.id;
    // Mã ổn định theo lá và tay bài, độc lập với ID thật và thứ tự trên tay.
    const id = ANONYMOUS_HAND_PREFIX + IdGenerator.generate();
    this._handAliases.set(card, { ownerId: card.ownerId, id });
    return id;
  }

  getHandSlots(ownerId: string): string[] {
    return [...this._objects.values()]
      .filter(card => card.location === 'HAND' && card.ownerId === ownerId)
      .sort((a, b) => (a.handIndex ?? 0) - (b.handIndex ?? 0))
      .flatMap(card => this.getHandAlias(card) ?? []);
  }

  getInteractableObject(id: string, sessionId: string): SandboxObject | undefined {
    const direct = this.getObject(id);
    if (this.canAccessObject(direct, sessionId)) return direct;
    if (!id.startsWith(ANONYMOUS_HAND_PREFIX)) return;
    return [...this._objects.values()].find(card => card.location === 'HAND'
      && this.getHandAlias(card) === id && (!card.privateViewerId || card.privateViewerId === sessionId));
  }

  canAccessObject(object: SandboxObject | undefined, sessionId: string): boolean {
    return !this._phase || (object !== undefined && object.location !== 'DECK'
      && (object.location !== 'HAND' || object.ownerId === sessionId));
  }

  addPlayer(sessionId: string, name: string, isHost: boolean): void {
    const spectator = this._phase === 'PLAYING';
    const playerIndex = spectator ? -1 : this._findFreeSeat();
    this._players.set(sessionId, {
      id: sessionId,
      sessionId,
      resumeToken: IdGenerator.generate(),
      name,
      isHost,
      isConnected: true,
      playerIndex,
      ...(spectator ? { spectator } : {}),
    });
    logger.debug('Player added to room', { roomId: this.id, sessionId, playerIndex });
  }


  resumePlayer(sessionId: string, token: string): boolean {
    const player = this._players.get(sessionId);
    if (!player || player.isConnected || player.hasLeft || player.resumeToken !== token) return false;
    player.isConnected = true;
    player.resumeToken = IdGenerator.generate();
    return true;
  }

  getPlayerIndex(sessionId: string): number {
    const player = this._players.get(sessionId);
    if (player && player.playerIndex !== undefined) {
      return player.playerIndex;
    }
    const idx = Array.from(this._players.keys()).indexOf(sessionId);
    return idx >= 0 ? idx : 0;
  }

  getPlayer(sessionId: string): PlayerRecord | undefined {
    return this._players.get(sessionId);
  }

  getPlayerByIndex(playerIndex: number): PlayerRecord | undefined {
    return Array.from(this._players.values()).find(p => p.playerIndex === playerIndex);
  }

  setDrawHover(sessionId: string, hovering: boolean): boolean {
    const player = this._players.get(sessionId);
    if (!player?.isConnected || player.spectator || this._phase === 'SETUP') return false;
    if (!hovering) return this._drawHoverPlayers.delete(sessionId);
    if (this._drawHoverPlayers.has(sessionId)) return false;
    this._drawHoverPlayers.add(sessionId);
    return true;
  }

  getDrawHoverPlayers(): PlayerInfo[] {
    return Array.from(this._players.values()).filter(player => this._drawHoverPlayers.has(player.id));
  }

  markPlayerDisconnected(sessionId: string, intentional = false): void {
    this._drawHoverPlayers.delete(sessionId);

    const player = this._players.get(sessionId);
    if (player) {
      if (intentional && this._phase === 'SETUP') {
        this._players.delete(sessionId);
        return;
      }
      if (intentional && this._phase) player.hasLeft = true;
      player.isConnected = false;
      logger.debug('Player marked disconnected', { roomId: this.id, sessionId });
    }
  }

  transferHost(): void {
    const newHost = Array.from(this._players.values()).find(
      p => p.sessionId !== this._hostSessionId && p.isConnected
    );
    if (newHost) {
      const oldHost = this._players.get(this._hostSessionId);
      if (oldHost) oldHost.isHost = false;
      newHost.isHost = true;
      this._hostSessionId = newHost.sessionId;
      logger.info('Host transferred', { roomId: this.id, newHost: newHost.sessionId });
    }
  }

  isHost(sessionId: string): boolean {
    return this._hostSessionId === sessionId;
  }

  hasPassword(): boolean {
    return !!this._password;
  }

  checkPassword(password?: string): boolean {
    return this._password === password;
  }

  getPlayerCount(): number {
    return this._players.size;
  }

  getConnectedPlayerCount(): number {
    return Array.from(this._players.values()).filter(p => p.isConnected).length;
  }

  getRawState(): RoomState {
    return {
      id: this.id,
      name: this._name,
      players: Array.from(this._players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isConnected: p.isConnected,
        playerIndex: p.playerIndex,
        spectator: p.spectator,
      })),
      objects: Array.from(this._objects.values()),
      maxPlayers: this._maxPlayers,
      deckDrawEnd: this._deckDrawEnd,
      round: this.round,
    };
  }

  getPublicState(): RoomState {
    return this.getRawState();
  }

  getConnectedSessionIds(): string[] {
    return Array.from(this._players.values())
      .filter(p => p.isConnected)
      .map(p => p.sessionId);
  }

  hasCardsInDeck(): boolean {
    for (const object of this._objects.values()) {
      if (object.type === "card" && object.location === "DECK") return true;
    }
    return false;
  }


  setDeckDrawEnd(end: DeckDrawEnd): void {
    this._deckDrawEnd = end;
  }

  private _getDeckCards(): SandboxObject[] {
    return [...this._objects.values()].filter(obj => obj.type === 'card' && obj.location === 'DECK');
  }



  get deckView(): DeckViewSession | undefined { return this._deckView; }

  openDeckView(sessionId: string, mode: DeckViewMode): boolean {
    const player = this._players.get(sessionId);
    const count = this.getPublicDeckState().affectedCount;
    if (this._phase !== 'PLAYING' || !player?.isConnected || player.spectator || this._deckView || !count) return false;
    const topCards = this._getDeckCards().slice(-count).reverse();
    this._deckView = new DeckViewSession(mode, sessionId, player.name, this.getPlayerIndex(sessionId), topCards);
    return true;
  }

  commitDeckView(): void {
    const session = this._deckView;
    if (!session) return;
    const ordered = session.orderedCards();
    const deck = this._getDeckCards();
    deck.splice(deck.length - ordered.length, ordered.length, ...ordered.reverse());
    this._replaceDeckOrder(deck);
  }

  closeDeckView(): void { this._deckView = undefined; }

  getPublicDeckState(): PublicDeckState {
    const cards = this._getDeckCards();
    const top = cards.at(-1);
    return {
      count: cards.length,
      affectedCount: Math.min(cards.length, this._deckAffectedCount),
      ...(top?.faceUp && top.cardType ? { topCardType: top.cardType } : {}),
    };
  }

  setDeckAffectedCount(count: number): void {
    const deckCount = this.getDeckCount();
    if (deckCount) this._deckAffectedCount = Math.max(1, Math.min(count, deckCount));
  }

  private _replaceDeckOrder(cards: SandboxObject[]): void {
    // Cuối Map là đỉnh chồng. Chỉ sắp lại thứ tự của các lá thuộc chồng.
    for (const card of cards) this._objects.delete(card.id);
    for (const card of cards) this._objects.set(card.id, card);
  }

  shuffleDeck(): boolean {
    const cards = this._getDeckCards();
    if (cards.length < 2) return false;
    this._replaceDeckOrder(shuffle(cards));
    return true;
  }

  insertDeckCards(sessionId: string, cardIds: string[], cardsAbove?: number): boolean {
    const cards = cardIds.map(id => this.getInteractableObject(id, sessionId));
    if (!cardIds.length || new Set(cards).size !== cards.length || !cards.every((card): card is SandboxObject =>
      card?.type === 'card' && (card.location === 'HAND' || card.location === 'TABLE') &&
      (!card.privateViewerId || card.privateViewerId === sessionId) &&
      (!card.lockedBy || card.lockedBy === sessionId))) return false;

    const deck = this._getDeckCards();
    const index = cardsAbove === undefined && this._deckDrawEnd === 'BOTTOM'
      ? 0 : deck.length - Math.min(cardsAbove ?? 0, deck.length);
    const hands = new Set<string>();
    for (const card of cards) {
      if (card.location === 'HAND' && card.ownerId) {
        hands.add(card.ownerId);
        if (this._phase && card.ownerId !== sessionId) card.faceUp = false;
      }
      this._handAliases.delete(card);
      card.location = 'DECK';
      card.ownerId = null;
      card.handIndex = undefined;
      card.lockedBy = null;
      card.privateViewerId = undefined;
      this._dynamicLocks.delete(card.id);
    }
    // Nhóm được gửi từ trên xuống, còn Map duyệt từ đáy lên.
    deck.splice(index, 0, ...cards.reverse());
    this._replaceDeckOrder(deck);
    for (const ownerId of hands) this._reindexHands(ownerId);
    return true;
  }

  takeDeckCard(sessionId: string, cardsAbove?: number): SandboxObject | undefined {
    const cards = this._getDeckCards();
    const index = cardsAbove === undefined && this._deckDrawEnd === 'BOTTOM'
      ? 0
      : cards.length - 1 - (cardsAbove ?? 0);
    const card = cards[index];
    if (!card) return;

    const { x, z, rotationY } = getDefaultSeatPlacement(this.getPlayerIndex(sessionId));
    let y = 0;
    for (const other of this._objects.values()) {
      if (other.type === 'card' && other.location === 'TABLE' && other.position.x === x && other.position.z === z) {
        y = Math.max(y, other.position.y + SEAT_CARD_LAYER_HEIGHT);
      }
    }

    // Chọn và chuyển lá trong cùng lượt xử lý, trước khi gửi cho các máy.
    card.location = 'TABLE';
    card.position = { x, y, z };
    card.rotation = rotationY;
    card.faceUp = false;
    card.takenFromDeck = true;
    this.setDeckAffectedCount(this._deckAffectedCount);
    return card;
  }

  drawCard(sessionId: string): SandboxObject {
    if (!this._players.has(sessionId)) {
      throw new Error(`Room: Session ${sessionId} is not in room ${this.id}`);
    }

    const deckCards = this._getDeckCards();

    if (deckCards.length === 0) {
      throw new Error(`Room: Deck is empty in room ${this.id}`);
    }

    // Top card is the last one in the stack
    const topCard = deckCards[deckCards.length - 1]!;

    // Count current cards in player's hand
    const playerHandCount = Array.from(this._objects.values()).filter(
      o => o.location === 'HAND' && o.ownerId === sessionId
    ).length;

    topCard.location = 'HAND';
    topCard.ownerId = sessionId;
    topCard.faceUp = true;
    topCard.handIndex = playerHandCount;
    this.setDeckAffectedCount(this._deckAffectedCount);

    logger.info('Card drawn into hand', {
      roomId: this.id,
      sessionId,
      cardId: topCard.id,
      handIndex: topCard.handIndex,
    });

    return topCard;
  }

  playCardToTable(sessionId: string, cardId: string, position: Vector3Like, faceUp?: boolean): SandboxObject {
    const card = this._objects.get(cardId);
    if (!card) {
      throw new Error(`Room: Card ${cardId} not found in room ${this.id}`);
    }
    if (card.location !== 'HAND') {
      throw new Error(`Room: Card ${cardId} is not in a hand`);
    }

    if (card.lockedBy && card.lockedBy !== sessionId) {
      throw new Error(`Room: Card ${cardId} is locked by another session`);
    }
    const previousOwner = card.ownerId;
    this._handAliases.delete(card);
    card.location = 'TABLE';
    card.ownerId = null;
    card.position = position;
    if (faceUp !== undefined) {
      card.faceUp = faceUp;
    }
    card.handIndex = undefined;

    if (previousOwner) this._reindexHands(previousOwner);
    logger.info('Card played to table', { roomId: this.id, sessionId, cardId, position, faceUp: card.faceUp });
    return card;
  }

  getObject(objectId: string): SandboxObject | undefined {
    return this._objects.get(objectId);
  }

  dragLock(objectId: string, sessionId: string): boolean {
    const obj = this._objects.get(objectId);
    if (obj) {
      if (obj.lockedBy !== null && obj.lockedBy !== sessionId) {
        return false;
      }
      obj.lockedBy = sessionId;
      return true;
    }
    const current = this._dynamicLocks.get(objectId);
    if (current && current !== sessionId) return false;
    this._dynamicLocks.set(objectId, sessionId);
    return true;
  }

  dragUnlock(objectId: string, sessionId: string): boolean {
    const obj = this._objects.get(objectId);
    if (obj) {
      if (obj.lockedBy === sessionId) {
        obj.lockedBy = null;
        return true;
      }
      return false;
    }
    if (this._dynamicLocks.get(objectId) === sessionId) {
      this._dynamicLocks.delete(objectId);
      return true;
    }
    return false;
  }

  isLockedBy(objectId: string, sessionId: string): boolean {
    const obj = this._objects.get(objectId);
    if (obj) return obj.lockedBy === sessionId;
    return this._dynamicLocks.get(objectId) === sessionId;
  }

  clearSessionLocks(sessionId: string): string[] {
    const unlockedIds: string[] = [];
    for (const obj of this._objects.values()) {
      if (obj.lockedBy === sessionId) {
        obj.lockedBy = null;
        unlockedIds.push(obj.id);
      }
    }
    for (const [id, lockSession] of this._dynamicLocks.entries()) {
      if (lockSession === sessionId) {
        this._dynamicLocks.delete(id);
        unlockedIds.push(id);
      }
    }
    return unlockedIds;
  }

  /**
   * Moves/copies ownership of a card into another player's HAND (M1.7.4.2).
   * Any room member may perform the move; ownership bookkeeping is the only
   * authorization-relevant fact and it follows the new policy.
   * `handIndex` allows the caller to express an explicit insertion order
   * (used for same-hand reorder / direct HAND → HAND transfers).
   */
  transferCard(
    fromSessionId: string,
    cardId: string,
    targetSessionId: string,
    position?: Vector3Like,
    handIndex?: number
  ): SandboxObject {
    const card = this._objects.get(cardId);
    if (!card) throw new Error(`Room: Card "${cardId}" not found in room ${this.id}`);
    if (card.location === 'DECK') {
      throw new Error(`Room: Card "${cardId}" cannot be transferred from ${card.location}`);
    }
    const targetPlayer = this._players.get(targetSessionId);
    if (!targetPlayer) throw new Error(`Room: Target player "${targetSessionId}" not found in room ${this.id}`);
    if (targetPlayer.spectator) throw new Error('Khán giả không có tay bài.');
    if (!targetPlayer.isConnected) throw new Error(`Room: Target player "${targetSessionId}" is disconnected`);
    if (card.lockedBy !== null && card.lockedBy !== fromSessionId) {
      throw new Error(`Room: Object "${cardId}" is locked by another session`);
    }

    const prevOwnerId = card.ownerId;
    const prevLocation = card.location;
    const prevPos = { ...card.position };
    const prevHandIndex = card.handIndex;
    const prevFaceUp = card.faceUp;

    try {
      if (card.lockedBy === fromSessionId) {
        this.dragUnlock(cardId, fromSessionId);
      }

      // Same-hand reorder: owner stays the same, only the hand order changes.
      if (card.location === 'HAND' && card.ownerId === targetSessionId) {
        card.position = position ?? card.position;
        if (handIndex !== undefined) {
          const ownerCards = Array.from(this._objects.values())
            .filter(o => o.location === 'HAND' && o.ownerId === targetSessionId && o.id !== cardId)
            .sort((a, b) => (a.handIndex ?? 0) - (b.handIndex ?? 0));
          const idx = handIndex >= 0 && handIndex <= ownerCards.length ? handIndex : ownerCards.length;
          ownerCards.splice(idx, 0, card);
          ownerCards.forEach((c, i) => (c.handIndex = i));
          this._reindexHands(targetSessionId);
        }
        logger.info('Card reordered within hand', { roomId: this.id, cardId, ownerSessionId: targetSessionId, handIndex });
        return card;
      }

      const sourceOwner = card.ownerId;

      // Move ownership + location into the target HAND.
      card.ownerId = targetSessionId;
      card.location = 'HAND';
      const ownerCards = Array.from(this._objects.values())
        .filter(o => o.location === 'HAND' && o.ownerId === targetSessionId && o.id !== cardId)
        .sort((a, b) => (a.handIndex ?? 0) - (b.handIndex ?? 0));
      const idx = handIndex !== undefined ? Math.max(0, Math.min(ownerCards.length, handIndex)) : ownerCards.length;
      ownerCards.splice(idx, 0, card);
      ownerCards.forEach((c, i) => (c.handIndex = i));

      if (position) card.position = position;
      // Keep the real face state; transfers never authoritatively change it.
      logger.info('Card transferred', { roomId: this.id, fromSessionId, toSessionId: targetSessionId, cardId });
      if (sourceOwner) this._reindexHands(sourceOwner);
      this._reindexHands(targetSessionId);
      return card;
    } catch (err) {
      card.ownerId = prevOwnerId;
      card.location = prevLocation;
      card.position = prevPos;
      card.handIndex = prevHandIndex;
      card.faceUp = prevFaceUp;
      throw err;
    }
  }

  /** Re-assigns sequential handIndex values for a player's HAND (M1.7.4.2). */
  private _reindexHands(ownerSessionId: string): void {
    const cards = Array.from(this._objects.values())
      .filter(o => o.location === 'HAND' && o.ownerId === ownerSessionId)
      .sort((a, b) => (a.handIndex ?? 0) - (b.handIndex ?? 0));
    cards.forEach((c, i) => (c.handIndex = i));
  }

  updateObjectAfterDrag(
    objectId: string, sessionId: string, position: Vector3Like,
    faceUp?: boolean, targetPlayerIndex?: number | null, handIndex?: number,
    rotation?: number
  ): SandboxObject | null {
    this._dynamicLocks.delete(objectId);
    const obj = this._objects.get(objectId);
    if (!obj) return null;

    // Defense in depth: a locked object may only be dropped/updated by the lock holder
    if (obj.lockedBy !== null && obj.lockedBy !== sessionId) {
      throw new Error(`Room: Object "${objectId}" is locked by another session`);
    }
    if (obj.lockedBy === sessionId) obj.lockedBy = null;
    if (obj.location === 'DECK') {
      throw new Error(`Room: Object "${objectId}" cannot be dragged from ${obj.location}`);
    }

    const hasTarget = targetPlayerIndex !== undefined && targetPlayerIndex !== null;
    if (hasTarget) {
      const targetPlayer = this.getPlayerByIndex(targetPlayerIndex!);
      if (!targetPlayer || !targetPlayer.isConnected) {
        throw new Error(`Room: Target player index ${targetPlayerIndex} not found or disconnected`);
      }
      // Direct (possibly same-hand reorder) destination into the target HAND.
      // Hand transforms stay private — rotation is intentionally not stored (M1.7.5).
      const updated = this.transferCard(sessionId, objectId, targetPlayer.sessionId, position, handIndex);
      return updated;
    }

    // Dropped on TABLE (no target player) — hand cards leave ownership.
    obj.position = position;
    if (faceUp !== undefined) obj.faceUp = faceUp;
    // M1.7.5 Part 2/3: store the table yaw (seat default at HAND→TABLE, or the
    // current manual yaw) so every client renders the same orientation.
    if (rotation !== undefined) obj.rotation = rotation;
    if (obj.location === 'HAND' || obj.location === 'DISCARD') {
      const previousOwner = obj.ownerId;
      this._handAliases.delete(obj);
      obj.location = 'TABLE';
      obj.ownerId = null;
      obj.handIndex = undefined;
      if (previousOwner) this._reindexHands(previousOwner);
    }
    return obj;
  }

  moveObject(objectId: string, position: Vector3Like, rotation: number): SandboxObject {
    const obj = this._objects.get(objectId);
    if (!obj) {
      throw new Error(`Room: Object ${objectId} not found in room ${this.id}`);
    }
    obj.position = position;
    obj.rotation = rotation;
    return obj;
  }

  flipObject(objectId: string): SandboxObject {
    const obj = this._objects.get(objectId);
    if (!obj) {
      throw new Error(`Room: Object ${objectId} not found in room ${this.id}`);
    }
    obj.faceUp = !obj.faceUp;
    return obj;
  }
}


