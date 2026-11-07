/**
 * RoomManager.ts — Room lifecycle management
 */
import { Room } from './Room.js';
import { RoomStore } from './RoomStore.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import { SHARED_CONFIG } from '../../../shared/constants/config.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.create('RoomManager');

export interface CreateRoomOptions {
  name: string;
  hostSessionId: string;
  hostName: string;
  password?: string;
  maxPlayers?: number;
}

export class RoomManager {
  private readonly _store = new RoomStore();

  createRoom(options: CreateRoomOptions): Room {
    const roomId = IdGenerator.generateShort();
    const maxPlayers = options.maxPlayers ?? 4;
    if (!Number.isInteger(maxPlayers) || maxPlayers < SHARED_CONFIG.MIN_PLAYERS_PER_ROOM || maxPlayers > SHARED_CONFIG.MAX_PLAYERS_PER_ROOM) {
      throw new Error(`RoomManager: maxPlayers must be an integer from ${SHARED_CONFIG.MIN_PLAYERS_PER_ROOM} to ${SHARED_CONFIG.MAX_PLAYERS_PER_ROOM}`);
    }
    const room = new Room(roomId, options.name, options.hostSessionId, options.password, maxPlayers);
    room.addPlayer(options.hostSessionId, options.hostName, true);
    this._store.set(roomId, room);
    logger.info('Room created', { roomId, name: options.name, maxPlayers });
    return room;
  }

  joinRoom(roomId: string, sessionId: string, playerName: string, password?: string): Room {
    const room = this._store.get(roomId);
    if (!room) {
      throw new Error(`RoomManager: Room "${roomId}" not found`);
    }
    if (room.hasPassword() && !room.checkPassword(password)) {
      throw new Error(`RoomManager: Incorrect password for room "${roomId}"`);
    }
    if (room.getPlayerCount() >= room.getRawState().maxPlayers) {
      throw new Error(`RoomManager: Room "${roomId}" is full (${room.getPlayerCount()}/${room.getRawState().maxPlayers})`);
    }
    room.addPlayer(sessionId, playerName, false);
    logger.info('Player joined room', { roomId, sessionId });
    return room;
  }

  handlePlayerDisconnect(roomId: string, sessionId: string): void {
    const room = this._store.get(roomId);
    if (!room) return;

    room.markPlayerDisconnected(sessionId);

    if (room.getConnectedPlayerCount() === 0) {
      this._store.delete(roomId);
      logger.info('Room destroyed (empty)', { roomId });
    } else if (room.isHost(sessionId)) {
      room.transferHost();
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this._store.get(roomId);
  }
}

