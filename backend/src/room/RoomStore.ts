/**
 * RoomStore.ts — In-memory room storage
 */
import type { Room } from './Room.js';

export class RoomStore {
  private readonly _rooms = new Map<string, Room>();

  set(roomId: string, room: Room): void {
    this._rooms.set(roomId, room);
  }

  get(roomId: string): Room | undefined {
    return this._rooms.get(roomId);
  }

  delete(roomId: string): void {
    this._rooms.delete(roomId);
  }

  size(): number {
    return this._rooms.size;
  }
}

