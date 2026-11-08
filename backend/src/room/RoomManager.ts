/**
 * RoomManager.ts — Room lifecycle management
 */
import { Room } from './Room.js';
import { RoomStore } from './RoomStore.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import { SHARED_CONFIG } from '../../../shared/constants/config.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('RoomManager');
const EMPTY_ROOM_GRACE_MS = 30_000;

export interface CreateRoomOptions {
  name: string;
  hostSessionId: string;
  hostName: string;
  password?: string;
  doubleDeck?: boolean;
}

export class RoomManager {
  private readonly _store = new RoomStore();
  private readonly _emptyRoomTimers = new Map<string, ReturnType<typeof setTimeout>>();

  createRoom(options: CreateRoomOptions): Room {
    const roomId = IdGenerator.generateShort();
    const room = this.createRoomRecord(roomId, options.name, options.hostSessionId, options.password, options.doubleDeck);
    room.addPlayer(options.hostSessionId, options.hostName, true);
    this._store.set(roomId, room);
    logger.info('Room created', { roomId, name: options.name, maxPlayers: SHARED_CONFIG.MAX_PLAYERS_PER_ROOM });
    return room;
  }

  protected createRoomRecord(id: string, name: string, host: string, password?: string, doubleDeck = false): Room {
    return new Room(id, name, host, password, SHARED_CONFIG.MAX_PLAYERS_PER_ROOM, undefined, doubleDeck);
  }

  joinRoom(roomId: string, sessionId: string, playerName: string, password?: string): Room {
    const room = this._store.get(roomId);
    if (!room) {
      throw new Error(`RoomManager: Room "${roomId}" not found`);
    }
    if (room.hasPassword() && !room.checkPassword(password)) {
      throw new Error(`RoomManager: Incorrect password for room "${roomId}"`);
    }
    const capacity = room.getRawState().maxPlayers;
    const members = room.getPlayerCount();
    const spectatorCapacity = capacity;
    if (members >= capacity + spectatorCapacity || (room.phase !== 'PLAYING' && room.getSeatCount() >= capacity)) {
      throw new Error(`RoomManager: Room "${roomId}" is full (${room.getPlayerCount()}/${room.getRawState().maxPlayers})`);
    }
    room.addPlayer(sessionId, playerName, false);
    this._clearEmptyRoomTimer(roomId);
    logger.info('Player joined room', { roomId, sessionId });
    return room;
  }

  resumeRoom(roomId: string, playerId: string, token: string): Room | undefined {
    const room = this._store.get(roomId);
    if (!room?.resumePlayer(playerId, token)) return;
    this._clearEmptyRoomTimer(roomId);
    return room;
  }

  private _clearEmptyRoomTimer(roomId: string): void {
    clearTimeout(this._emptyRoomTimers.get(roomId));
    this._emptyRoomTimers.delete(roomId);
  }

  handlePlayerDisconnect(roomId: string, sessionId: string, intentional = false): void {
    const room = this._store.get(roomId);
    if (!room) return;

    room.markPlayerDisconnected(sessionId, intentional);

    if (room.getConnectedPlayerCount() === 0) {

      this._clearEmptyRoomTimer(roomId);
      const destroy = () => {
        this._emptyRoomTimers.delete(roomId);
        this._store.delete(roomId);
        logger.info('Room destroyed (empty)', { roomId });
      };
      // Giữ bàn ngắn hạn để người cuối cùng có thể kết nối lại.
      if (intentional) destroy();
      else this._emptyRoomTimers.set(roomId, setTimeout(destroy, EMPTY_ROOM_GRACE_MS).unref());
    } else if (room.isHost(sessionId)) {
      room.transferHost();
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this._store.get(roomId);
  }
}

