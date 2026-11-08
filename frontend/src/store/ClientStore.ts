/**
 * ClientStore.ts — Client-side state mirror (read-only from backend)
 * This is NOT the authoritative state — backend is.
 */
import type { RoomState, PlayerInfo, ObjectPosition, SandboxObject, RoundSetup, PublicDeckState } from '@shared/types/room';
import type { ConnectionStatus } from '../network/NetworkClient';
import { Logger } from '../utils/Logger';

const logger = Logger.create('ClientStore');

export class ClientStore {
  private _roomId: string | null = null;
  private _playerId: string | null = null;
  private _playerIndex = 0;
  private _playerName = 'Player';
  private _roomState: RoomState | null = null;
  private _connectionStatus: ConnectionStatus = 'disconnected';
  private _connectionError: string | null = null;
  private readonly _listeners = new Set<() => void>();

  setRoomId(roomId: string | null): void {
    this._roomId = roomId;
    this._notify();
  }

  setPlayerId(playerId: string | null): void {
    this._playerId = playerId;
    this._notify();
  }

  setPlayerIndex(idx: number): void {
    this._playerIndex = idx;
    this._notify();
  }

  setPlayerName(name: string): void {
    this._playerName = name;
    this._notify();
  }

  setConnectionStatus(status: ConnectionStatus, errorMsg?: string | null): void {
    this._connectionStatus = status;
    this._connectionError = errorMsg ?? null;
    this._notify();
  }

  updateRoomState(state: RoomState): void {
    this._roomState = state;
    this._playerIndex = state.players.find(player => player.id === this._playerId)?.playerIndex ?? this._playerIndex;
    logger.debug('Room state updated');
    this._notify();
  }

  addPlayer(player: PlayerInfo): void {
    if (!this._roomState) return;
    this._roomState = {
      ...this._roomState,
      players: [...this._roomState.players, player],
    };
    this._notify();
  }

  markPlayerDisconnected(playerId: string): void {
    if (!this._roomState) return;
    this._roomState = {
      ...this._roomState,
      players: this._roomState.players.map((player) => player.id === playerId
        ? { ...player, isConnected: false }
        : player),
    };
    this._notify();
  }

  removePlayer(playerId: string): void {
    if (!this._roomState) return;
    this._roomState = {
      ...this._roomState,
      players: this._roomState.players.filter((p) => p.id !== playerId),
    };
    this._notify();
  }

  updateObjectPosition(update: ObjectPosition): void {
    if (!this._roomState) return;
    const objects = this._roomState.objects.map((o) =>
      o.id === update.id ? { ...o, position: update.position, rotation: update.rotation } : o
    );
    this._roomState = { ...this._roomState, objects };
    this._notify();
  }


  updateRound(round: RoundSetup): void {
    if (!this._roomState) return;
    this._roomState = { ...this._roomState, round };
    this._notify();
  }

  updateDeckCount(count: number, ownerId?: string, handCount?: number, deck?: PublicDeckState, slots?: string[]): void {
    if (!this._roomState) return;
    const handCounts = ownerId && handCount !== undefined
      ? { ...this._roomState.handCounts, [ownerId]: handCount }
      : this._roomState.handCounts;
    const handSlots = ownerId && slots ? { ...this._roomState.handSlots, [ownerId]: slots } : this._roomState.handSlots;
    this._roomState = { ...this._roomState, deckCount: count, handCounts, handSlots, deck: deck ?? this._roomState.deck };
    this._notify();
  }

  addOrUpdateObject(obj: SandboxObject, deckCount?: number, deck?: PublicDeckState): void {
    if (!this._roomState) return;
    const existingIdx = this._roomState.objects.findIndex((o) => o.id === obj.id);
    const newObjects = [...this._roomState.objects];
    if (existingIdx >= 0) {
      newObjects[existingIdx] = obj;
    } else {
      newObjects.push(obj);
    }
    this._roomState = { ...this._roomState, objects: newObjects, deckCount: deckCount ?? this._roomState.deckCount, deck: deck ?? this._roomState.deck };
    this._notify();
  }

  clearRoom(): void {
    this._roomId = null;
    this._roomState = null;
    this._notify();
  }

  getRoomId(): string | null {
    return this._roomId;
  }
  getPlayerId(): string | null {
    return this._playerId;
  }
  getPlayerIndex(): number {
    return this._playerIndex;
  }
  getPlayerName(): string {
    return this._playerName;
  }
  getRoomState(): RoomState | null {
    return this._roomState;
  }
  getConnectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }
  getConnectionError(): string | null {
    return this._connectionError;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    this._listeners.forEach((l) => l());
  }
}
