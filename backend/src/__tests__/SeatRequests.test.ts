import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEAT_CHANGE } from '../../../shared/constants/config.js';
import type { SeatRequest, ServerToClientMessage } from '../../../shared/types/protocol.js';
import { RoomManager } from '../room/RoomManager.js';
import { SeatRequests } from '../room/SeatRequests.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';

function setup() {
  vi.useFakeTimers();
  const room = new RoomManager().createRoom({ name: 'Ghế', hostSessionId: 'a', hostName: 'A' });
  room.addPlayer('b', 'B', false);
  room.addPlayer('c', 'C', false);
  const notices: { id: string; event: ServerToClientMessage }[] = [];
  const seats = new SeatRequests((id, event) => notices.push({ id, event }));
  const choose = (player: string, index: number, expectedPlayerId: string | null) =>
    seats.handle(room, player, { type: 'seat:choose', payload: { index, expectedPlayerId } });
  const request = (): SeatRequest => {
    const event = notices.map(notice => notice.event).reverse().find(item => item.type === 'seat:request');
    if (event?.type !== 'seat:request') throw new Error('Thiếu yêu cầu đổi ghế');
    return event.payload;
  };
  return { room, seats, notices, choose, request };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('Chuyển và đổi ghế', () => {
  it('giành ghế trống tuần tự, giữ bài theo người và bài bàn theo tọa độ', () => {
    const { room, choose } = setup();
    room.dealRound();
    expect(() => choose('a', 5, null)).toThrow('Đang chia bài');
    vi.advanceTimersByTime(SEAT_CHANGE.dealLockMs);
    const table = room.takeDeckCard('a')!;
    const original = { ...table.position };
    const ownHand = room.getRawState().objects.filter(card => card.ownerId === 'a');
    expect(choose('a', 5, null)).toContain('ghế 6');
    expect(() => choose('b', 5, null)).toThrow('Ghế đã có người');
    expect(room.getPlayerByIndex(0)).toBeUndefined();
    expect(room.getPlayerIndex('a')).toBe(5);
    expect(room.isHost('a')).toBe(true);
    expect(table.position).toEqual(original);
    expect(room.getRawState().objects.filter(card => card.ownerId === 'a')).toEqual(ownHand);
    expect(ViewStateBuilder.buildRoomState(room, 'b').objects.some(card => card.ownerId === 'a')).toBe(false);
    room.addPlayer('d', 'D', false);
    expect(() => choose('d', 5, 'a')).toThrow('Không thể đổi');
    expect(choose('d', 0, null)).toContain('ghế 1');
    expect(room.getPlayer('d')?.spectator).toBe(false);
  });

  it('chỉ người nhận được đồng ý và hoán đổi ghế cùng lúc', () => {
    const { room, seats, choose, request, notices } = setup();
    choose('a', 1, 'b');
    const { id } = request();
    expect(notices.map(item => item.id)).toEqual(['a', 'b']);
    expect(() => choose('c', 1, 'b')).toThrow('đang bận');
    const reply = { type: 'seat:reply', payload: { id, accept: true } } as const;
    expect(() => seats.handle(room, 'c', reply)).toThrow('Chỉ người nhận');
    expect(seats.handle(room, 'b', reply)).toBe('A và B đã đổi chỗ.');
    expect([room.getPlayerIndex('a'), room.getPlayerIndex('b')]).toEqual([1, 0]);
    expect(() => seats.handle(room, 'b', reply)).toThrow('đã kết thúc');
  });

  it('hết hạn, từ chối, hủy và rời phòng đều giữ nguyên ghế', () => {
    const { room, seats, choose, request, notices } = setup();
    for (const action of ['expire', 'reject', 'cancel', 'leave'] as const) {
      choose('a', 1, 'b');
      const { id } = request();
      if (action === 'expire') vi.advanceTimersByTime(SEAT_CHANGE.requestMs);
      if (action === 'reject') seats.handle(room, 'b', { type: 'seat:reply', payload: { id, accept: false } });
      if (action === 'cancel') seats.handle(room, 'a', { type: 'seat:cancel', payload: { id } });
      if (action === 'leave') seats.disconnect('b');
      expect(notices.filter(item => item.event.type === 'seat:result' && item.event.payload.id === id)).toHaveLength(2);
      expect([room.getPlayerIndex('a'), room.getPlayerIndex('b')]).toEqual([0, 1]);
      vi.advanceTimersByTime(SEAT_CHANGE.cooldownMs);
    }
  });

  it('chặn khung chọn, phiên See và khóa kéo', () => {
    const { room, seats, choose } = setup();
    room.dealRound();
    vi.advanceTimersByTime(SEAT_CHANGE.dealLockMs);
    seats.handle(room, 'b', { type: 'seat:busy', payload: { active: true } });
    expect(() => choose('a', 1, 'b')).toThrow('khung chọn');
    seats.handle(room, 'b', { type: 'seat:busy', payload: { active: false } });
    expect(room.openDeckView('b', 'see')).toBe(true);
    expect(() => choose('a', 1, 'b')).toThrow('đóng phiên');
    room.closeDeckView();
    const card = room.takeDeckCard('b')!;
    room.dragLock(card.id, 'b');
    expect(() => choose('a', 1, 'b')).toThrow('đang kéo bài');
  });
});
