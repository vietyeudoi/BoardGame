import { describe, expect, it } from 'vitest';

import { CardType } from '../../../shared/types/gameObjects.js';
import { cardsAtTablePile } from '../../../shared/types/room.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';
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
      { token: 0, cardType: publicCard.cardType, faceImage: publicCard.faceImage }, { token: 1 }, { token: 2 },
    ]);
    expect(room.deckView!.setOrder([1, 0, 2])).toBe(false);
    room.closeDeckView();

    expect(room.openDeckView('a', 'alter')).toBe(true);
    const view = room.deckView!;
    for (const invalid of [[0, 1], [0, 0, 1], [0, 1, 3], [0, 1, 1.5]]) {
      expect(view.setOrder(invalid)).toBe(false);
    }
    expect(view.setOrder([2, 0, 1])).toBe(true);
    expect(view.viewFor('b').cards).toEqual([{ token: 2 }, { token: 0, cardType: publicCard.cardType, faceImage: publicCard.faceImage }, { token: 1 }]);
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

describe('Xáo tay và chồng công khai', () => {

  it('xáo tay giữ tất cả lá bom và mặt bài, kể cả khi chồng bốc khóa', () => {
    const room = dealtRoom();
    const initial = room.getRawState().objects;
    const hand = initial.filter(card => card.ownerId === 'a').map(card => room.getObject(card.id)!);
    hand[0]!.cardType = CardType.ExplodingKitten;
    hand[1]!.cardType = CardType.ImplodingKitten;
    hand[1]!.faceUp = false;
    const originalFaces = new Map(hand.map(card => [card.id, card.faceUp]));
    const aliases = room.getHandSlots('a');
    expect(room.openDeckView('b', 'see')).toBe(true);
    expect(room.shuffleHand('a')).toBe(true);
    const after = room.getRawState().objects;
    expect(after).toHaveLength(initial.length);
    expect(after.some(card => card.location === 'TABLE')).toBe(false);
    expect(hand.every(card => card.location === 'HAND' && card.ownerId === 'a' && originalFaces.get(card.id) === card.faceUp)).toBe(true);
    expect(hand.map(card => card.handIndex).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(room.getHandSlots('a').every(id => !aliases.includes(id))).toBe(true);
  });

  it('gom bom theo thứ tự, giữ mặt và thứ tự các lá còn lại, tránh chồng trước ghế', () => {
    const room = dealtRoom();
    const existing = room.takeDeckCard('a')!;
    const deck = room.getRawState().objects.filter(card => card.location === 'DECK').map(card => room.getObject(card.id)!);
    deck.forEach(card => { card.cardType = CardType.Skip; });
    const [first, second, imploding, last] = deck.slice(-4);
    first!.cardType = CardType.ExplodingKitten;
    second!.cardType = CardType.StreakingExplodingKitten;
    imploding!.cardType = CardType.ImplodingKitten;
    imploding!.faceUp = true;
    last!.cardType = CardType.ZombieExplodingKitten;
    const expected = deck.filter(card => ![first, second, last].includes(card)).map(card => [card.id, card.faceUp]);
    expect(room.openDeckView('b', 'alter')).toBe(true);
    expect(() => room.gatherDeckBombs('a')).toThrow('đóng phiên');
    expect(() => room.gatherDeckBombs('b')).toThrow('đóng phiên');
    room.closeDeckView();
    const anchor = room.gatherDeckBombs('a')!;
    expect(room.gatherDeckBombs('b')).toBeUndefined();
    const state = room.getRawState();
    const pile = cardsAtTablePile(state.objects, anchor.id);
    expect(pile.map(card => card.id)).toEqual([first!.id, second!.id, last!.id]);
    expect(pile[0]?.position).not.toEqual(existing.position);
    expect(pile.every(card => !card.faceUp && card.location === 'TABLE')).toBe(true);
    expect(state.objects.filter(card => card.location === 'DECK').map(card => [card.id, card.faceUp])).toEqual(expected);
    const peer = ViewStateBuilder.buildRoomState(room, 'b');
    expect(peer.deck).toMatchObject({ count: expected.length, topCardType: CardType.ImplodingKitten });
    expect(peer.objects.filter(card => pile.some(item => item.id === card.id)).every(card => !card.cardType)).toBe(true);
    expect(peer.objects.some(card => card.id === imploding!.id)).toBe(false);
    while (room.takeDeckCard('b')) { /* Rút hết để kiểm tra chồng rỗng. */ }
    expect(room.gatherDeckBombs('b')).toBeUndefined();
  });

  it('chỉ xáo đúng chồng, từ chối khi có khóa và giữ đủ lá qua nhiều lần xáo', () => {
    const room = dealtRoom();
    const cards = [room.takeDeckCard('a')!, room.takeDeckCard('a')!, room.takeDeckCard('b')!];
    room.formTablePile(cards.map(card => card.id));
    const other = room.takeDeckCard('b')!;
    cards[1]!.faceUp = true;
    const faces = cards.map(card => card.faceUp);
    const positions = cards.map(card => ({ ...card.position }));
    room.dragLock(cards[0]!.id, 'a');
    expect(() => room.shuffleTablePile(cards[1]!.id)).toThrow('đang có lá');
    room.dragUnlock(cards[0]!.id, 'a');
    for (const card of cards) expect(room.shuffleTablePile(card.id)).toBe(true);
    expect(cards.map(card => card.faceUp)).toEqual(faces);
    expect(cards.map(card => card.position)).toEqual(expect.arrayContaining(positions));
    expect(room.shuffleTablePile(other.id)).toBe(false);
  });
});
