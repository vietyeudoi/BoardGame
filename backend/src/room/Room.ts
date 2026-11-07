/**
 * Room.ts — Room state and player management (authoritative)
 */
import type { RoomState, SandboxObject, PlayerInfo } from '../../../shared/types/room.js';
import type { Vector3Like } from '../../../shared/types/protocol.js';
import { CardType } from '../../../shared/types/gameObjects.js';
import { SHARED_CONFIG } from '../../../shared/constants/config.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('Room');

const INITIAL_CARD_TYPES: CardType[] = [
  CardType.Defuse,
  CardType.Attack,
  CardType.Skip,
  CardType.Favor,
  CardType.Shuffle,
  CardType.SeeTheFuture,
  CardType.Nope,
  CardType.TacoCat,
  CardType.HairyPotatoCat,
  CardType.RainbowRalphingCat,
  CardType.BeardCat,
  CardType.Cattermelon,
  CardType.Defuse,
  CardType.Attack,
  CardType.Skip,
  CardType.Nope,
  CardType.TacoCat,
  CardType.Cattermelon,
  CardType.ExplodingKitten,
  CardType.SeeTheFuture,
];

interface PlayerRecord extends PlayerInfo {
  sessionId: string;
}

export class Room {
  private readonly _players = new Map<string, PlayerRecord>();
  private readonly _objects = new Map<string, SandboxObject>();
  private readonly _dynamicLocks = new Map<string, string>();
  private _hostSessionId: string;

  constructor(
    public readonly id: string,
    private readonly _name: string,
    hostSessionId: string,
    private readonly _password?: string,
    private readonly _maxPlayers: number = SHARED_CONFIG.MAX_PLAYERS_PER_ROOM
  ) {
    this._hostSessionId = hostSessionId;
    this._initSandboxObjects();
  }

  private _initSandboxObjects(): void {
    this._objects.set('demo_deck_1', {
      id: 'demo_deck_1',
      type: 'deck',
      position: { x: -2.5, y: 0.8, z: 0 },
      rotation: 0,
      faceUp: false,
      lockedBy: null,
      location: 'TABLE',
    });
    INITIAL_CARD_TYPES.forEach((cardType, idx) => {
      const cardId = `card_${this.id}_${idx + 1}`;
      this._objects.set(cardId, {
        id: cardId,
        type: 'card',
        cardType,
        position: { x: -2.5, y: 0.8 + idx * 0.005, z: 0 },
        rotation: 0,
        faceUp: false,
        lockedBy: null,
        ownerId: null,
        location: 'DECK',
      });
    });
  }

  addPlayer(sessionId: string, name: string, isHost: boolean): void {
    const playerIndex = this._players.size;
    this._players.set(sessionId, {
      id: sessionId,
      sessionId,
      name,
      isHost,
      isConnected: true,
      playerIndex,
    });
    logger.debug('Player added to room', { roomId: this.id, sessionId, playerIndex });
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

  markPlayerDisconnected(sessionId: string): void {
    const player = this._players.get(sessionId);
    if (player) {
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
      })),
      objects: Array.from(this._objects.values()),
      maxPlayers: this._maxPlayers,
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

  drawCard(sessionId: string): SandboxObject {
    if (!this._players.has(sessionId)) {
      throw new Error(`Room: Session ${sessionId} is not in room ${this.id}`);
    }

    // Find cards in deck
    const deckCards = Array.from(this._objects.values()).filter(
      o => o.type === 'card' && o.location === 'DECK'
    );

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

    logger.info('Card drawn into hand', {
      roomId: this.id,
      sessionId,
      cardId: topCard.id,
      cardType: topCard.cardType,
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

    card.location = 'TABLE';
    card.ownerId = null;
    card.position = position;
    if (faceUp !== undefined) {
      card.faceUp = faceUp;
    }
    card.handIndex = undefined;

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
    if (obj.location === 'DECK' || obj.location === 'DISCARD') {
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
    if (obj.location === 'HAND') {
      obj.location = 'TABLE';
      obj.ownerId = null;
      obj.handIndex = undefined;
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


