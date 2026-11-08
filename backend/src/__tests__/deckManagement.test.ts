import { describe, expect, it } from 'vitest';
import { Room } from '../room/Room.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';

function setup() {
  const room = new Room('deck-test', 'Chồng bốc', 'a');
  room.addPlayer('a', 'A', true);
  room.addPlayer('b', 'B', false);
  room.dealRound();
  return room;
}

const deck = (room: Room) => room.getRawState().objects.filter(card => card.location === 'DECK');

describe('Quản lý chồng bốc online', () => {
  it('chèn úp hoặc ngửa theo Đỉnh, Đáy và vị trí riêng, giữ thứ tự nhóm', () => {
    const room = setup();
    const first = room.takeDeckCard('a')!;
    const second = room.drawCard('a');
    const third = room.takeDeckCard('b')!;
    const fourth = room.drawCard('b');
    expect(room.insertDeckCards('a', [first.id])).toBe(true);
    expect(deck(room).at(-1)).toMatchObject({ id: first.id, faceUp: false });
    expect(room.getPublicDeckState()).not.toHaveProperty('topCardType');
    room.setDeckDrawEnd('BOTTOM');
    expect(room.insertDeckCards('a', [second.id])).toBe(true);
    expect(deck(room)[0]).toMatchObject({ id: second.id, faceUp: true });

    const oldTop = deck(room).at(-1);
    expect(room.insertDeckCards('b', [third.id, fourth.id], 1)).toBe(true);
    expect(deck(room).slice(-3).map(card => card.id)).toEqual([fourth.id, third.id, oldTop?.id]);
    expect(room.insertDeckCards('b', [third.id])).toBe(false);
    const count = room.getDeckCount();
    const otherHand = room.getRawState().objects.find(card => card.ownerId === 'b')!;
    const ownHand = room.getRawState().objects.find(card => card.ownerId === 'a')!;
    expect(room.insertDeckCards('a', [ownHand.id, otherHand.id])).toBe(false);
    expect(room.getDeckCount()).toBe(count);
    expect(room.getObject(ownHand.id)?.location).toBe('HAND');
  });

  it('xáo lại thứ tự và giữ mặt từng lá, chỉ công khai mặt trên nếu ngửa', () => {
    const room = setup();
    const visible = room.drawCard('a');
    expect(room.insertDeckCards('a', [visible.id])).toBe(true);
    const published = ViewStateBuilder.buildRoomState(room, 'b');
    expect(published.deck?.topCardType).toBe(visible.cardType);
    expect(published.objects.every(card => card.location !== 'DECK')).toBe(true);
    expect(published.objects.some(card => card.id === visible.id)).toBe(false);

    const before = deck(room).map(({ id, faceUp }) => [id, faceUp] as const);
    expect(room.shuffleDeck()).toBe(true);
    const after = deck(room).map(({ id, faceUp }) => [id, faceUp] as const);
    expect(after.map(([id]) => id)).not.toEqual(before.map(([id]) => id));
    expect(new Map(after)).toEqual(new Map(before));
    const top = deck(room).at(-1);
    expect(room.getPublicDeckState().topCardType).toBe(top?.faceUp ? top.cardType : undefined);
  });

  it('kẹp số lá tác động khi rút, giữ số mới và xử lý chồng 0/1 lá', () => {
    const room = setup();
    expect(room.getPublicDeckState().affectedCount).toBe(3);
    room.setDeckAffectedCount(999);
    expect(room.getPublicDeckState().affectedCount).toBe(room.getDeckCount());
    while (room.getDeckCount() > 1) room.takeDeckCard('a');
    expect(room.getPublicDeckState()).toEqual({ count: 1, affectedCount: 1 });
    expect(room.shuffleDeck()).toBe(false);
    room.takeDeckCard('a');
    expect(room.getPublicDeckState()).toEqual({ count: 0, affectedCount: 0 });
    expect(room.shuffleDeck()).toBe(false);
  });
});
