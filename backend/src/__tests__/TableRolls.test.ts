import { describe, expect, it } from 'vitest';
import { TABLE_ROLL, type TableRollOutcome } from '../../../shared/types/tableRoll.js';
import { RoomManager } from '../room/RoomManager.js';
import { rollTableItem, TableRolls } from '../room/TableRolls.js';
import { MessageValidator } from '../validation/MessageValidator.js';

describe('Tung vật thể trên bàn', () => {
  it('sinh 6000 lượt xúc xắc và 2000 lượt đồng xu gần đều', () => {
    for (const [kind, samples, results] of [
      ['dice', 6000, [1, 2, 3, 4, 5, 6]],
      ['coin', 2000, ['heads', 'tails']],
    ] as const) {
      const counts = new Map<TableRollOutcome['result'], number>();
      for (let i = 0; i < samples; i++) {
        const { result } = rollTableItem(kind);
        counts.set(result, (counts.get(result) ?? 0) + 1);
      }
      expect([...counts.keys()]).toHaveLength(results.length);
      for (const result of results) {
        // Biên 15% để kiểm tra sai lệch lớn mà vẫn ổn định với RNG thật.
        expect(counts.get(result)).toBeGreaterThan(850);
        expect(counts.get(result)).toBeLessThan(1150);
      }
    }
  });

  it('xác thực loại vật thể từ WebSocket', () => {
    expect(MessageValidator.validate({ type: 'table:roll', payload: { kind: 'coin' } }).success).toBe(true);
    for (const payload of [null, {}, { kind: 'card' }, { kind: 1 }]) {
      expect(MessageValidator.validate({ type: 'table:roll', payload }).success).toBe(false);
    }
  });

  it('chỉ cho người ngồi tung, giới hạn cả hai loại và giữ nguyên dữ liệu bài', () => {
    const room = new RoomManager().createRoom({ name: 'Tung', hostSessionId: 'a', hostName: 'An' });
    room.addPlayer('b', 'Bình', false);
    room.dealRound();
    room.addPlayer('c', 'Chi', false);
    const before = structuredClone(room.getRawState().objects);
    expect(room.openDeckView('a', 'see')).toBe(true);
    expect(() => room.rollTableItem('a', 'dice', 1000)).toThrow('See/Alter');
    expect(() => room.rollTableItem('c', 'dice', 1000)).toThrow('ngồi');
    expect(() => room.rollTableItem('missing', 'coin', 1000)).toThrow('ngồi');
    const first = room.rollTableItem('b', 'coin', 1000);
    room.closeDeckView();
    const concurrent = room.rollTableItem('a', 'dice', 1000);
    expect(concurrent.id).not.toBe(first.id);
    expect(Math.hypot(first.x - concurrent.x, first.z - concurrent.z)).toBeGreaterThan(2);
    expect(room.tableRolls.inProgress(1001)).toEqual([first, concurrent]);
    expect(room.tableRolls.inProgress(1000 + TABLE_ROLL.animationMs)).toEqual([]);
    expect(() => room.rollTableItem('b', 'dice', 1000 + TABLE_ROLL.cooldownMs - 1)).toThrow('Chờ');
    const next = room.rollTableItem('b', 'dice', 1000 + TABLE_ROLL.cooldownMs);
    expect(next.replacesId).toBe(first.id);
    expect(room.getRawState().objects).toEqual(before);
  });

  it('né bài đã đặt và giữ vùng riêng cho 10 lượt đồng thời', () => {
    const rolls = new TableRolls();
    const placed = Array.from({ length: 10 }, (_, seat) => rolls.start('dice', {
      playerId: String(seat), playerName: 'Ghế ' + seat, seat,
    }, [{ x: 0, z: 5.2 }], 1000));
    expect(placed[0]!.z).not.toBe(5.2);
    for (const [i, current] of placed.entries()) {
      for (const other of placed.slice(0, i)) {
        expect(Math.hypot(current.x - other.x, current.z - other.z)).toBeGreaterThan(2);
      }
    }
    const extra = { playerId: 'extra', playerName: 'Extra', seat: 0 };
    expect(() => rolls.start('coin', extra, [], 1000)).toThrow('nhiều lượt');
    expect(rolls.start('coin', extra, [], 1000 + TABLE_ROLL.cooldownMs).replacesId).toBe(placed[0]!.id);
  });
});
