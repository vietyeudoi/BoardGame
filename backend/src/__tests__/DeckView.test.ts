import { describe, expect, it } from 'vitest';
import { RoomManager } from '../room/RoomManager.js';

function dealtRoom() {
  const room = new RoomManager().createRoom({ name: 'Xem bài', hostSessionId: 'a', hostName: 'A' });
  room.addPlayer('b', 'B', false);
  room.dealRound();
  room.setDeckAffectedCount(3);
  return room;
}

describe('Phiên xem chồng', () => {
  it('giữ mặt ngửa công khai, hủy bản nháp và chỉ hoán vị phần đầu khi xác nhận', () => {
    const room = dealtRoom();
    const publicCard = room.takeDeckCard('a')!;
    publicCard.faceUp = true;
    expect(room.insertDeckCards('a', [publicCard.id])).toBe(true);
    const original = room.getRawState().objects.filter(card => card.location === 'DECK').reverse();

    expect(room.openDeckView('a', 'see')).toBe(true);
    expect(room.deckView!.viewFor('b').cards).toEqual([
      { token: 0, cardType: publicCard.cardType }, { token: 1 }, { token: 2 },
    ]);
    expect(room.deckView!.setOrder([1, 0, 2])).toBe(false);
    room.closeDeckView();

    expect(room.openDeckView('a', 'alter')).toBe(true);
    const view = room.deckView!;
    for (const invalid of [[0, 1], [0, 0, 1], [0, 1, 3], [0, 1, 1.5]]) {
      expect(view.setOrder(invalid)).toBe(false);
    }
    expect(view.setOrder([2, 0, 1])).toBe(true);
    expect(view.viewFor('b').cards).toEqual([{ token: 2 }, { token: 0, cardType: publicCard.cardType }, { token: 1 }]);
    room.closeDeckView();
    expect(room.getRawState().objects.filter(card => card.location === 'DECK').reverse()).toEqual(original);

    expect(room.openDeckView('a', 'alter')).toBe(true);
    expect(room.deckView!.setOrder([2, 0, 1])).toBe(true);
    room.commitDeckView();
    room.closeDeckView();
    const expected = [original[2]!, original[0]!, original[1]!, ...original.slice(3)];
    const deck = room.getRawState().objects.filter(card => card.location === 'DECK').reverse();
    expect(deck.map(card => [card.id, card.faceUp])).toEqual(expected.map(card => [card.id, card.faceUp]));
    expect([room.drawCard('a').id, room.drawCard('a').id, room.drawCard('a').id]).toEqual(expected.slice(0, 3).map(card => card.id));
  });

  it.each([0, 1, 2])('giới hạn phiên theo %i lá còn lại', count => {
    const room = dealtRoom();
    while (room.getDeckCount() > count) room.drawCard('a');
    expect(room.openDeckView('a', 'see')).toBe(count > 0);
    expect(room.deckView?.orderedCards().length ?? 0).toBe(count);
  });
});
