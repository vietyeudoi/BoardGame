/**
 * clientStore.test.ts — Unit tests for Frontend ClientStore
 */
import { describe, it, expect } from 'vitest';
import { ClientStore } from '../store/ClientStore';
import type { RoomState } from '@shared/types/room';

describe('ClientStore', () => {
  it('stores and updates room state correctly', () => {
    const store = new ClientStore();
    let notificationCount = 0;
    const unsubscribe = store.subscribe(() => {
      notificationCount++;
    });

    expect(store.getRoomId()).toBeNull();
    expect(store.getPlayerId()).toBeNull();
    expect(store.getRoomState()).toBeNull();

    store.setRoomId('ROOM123');
    store.setPlayerId('PLAYER1');

    expect(store.getRoomId()).toBe('ROOM123');
    expect(store.getPlayerId()).toBe('PLAYER1');
    expect(notificationCount).toBe(2);

    const mockState: RoomState = {
      id: 'ROOM123',
      name: 'Test Room',
      players: [{ id: 'PLAYER1', name: 'Alice', isHost: true, isConnected: true }],
      objects: [],
      maxPlayers: 6,
    };

    store.updateRoomState(mockState);
    expect(store.getRoomState()).toEqual(mockState);
    expect(notificationCount).toBe(3);

    // Test adding player
    store.addPlayer({ id: 'PLAYER2', name: 'Bob', isHost: false, isConnected: true });
    expect(store.getRoomState()?.players.length).toBe(2);
    expect(notificationCount).toBe(4);

    // Test removing player
    store.removePlayer('PLAYER2');
    expect(store.getRoomState()?.players.length).toBe(1);
    expect(notificationCount).toBe(5);

    unsubscribe();
  });
});

