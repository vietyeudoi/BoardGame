import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { ClientToServerMessage, ServerToClientMessage } from '../../../shared/types/protocol.js';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';

import { describe, expect, it } from 'vitest';
import { getDiscardZoneCenter, PILE_LAYER_HEIGHT } from '../../../shared/constants/tablePiles.js';
import { RoomManager } from '../room/RoomManager.js';
import { ViewStateBuilder } from '../room/ViewStateBuilder.js';

describe('Chồng bài trên bàn', () => {
  it('căn chồng bỏ sau nhiều lần đặt và chỉ lấy đúng lá được chọn', () => {
    const room = new RoomManager().createRoom({ name: 'Chồng bỏ', hostSessionId: 'a', hostName: 'A' });
    room.addPlayer('b', 'B', false);
    room.dealRound('mat-bai');
    room.addPlayer('viewer', 'Viewer', false);
    const center = getDiscardZoneCenter(room.maxPlayers);
    const cards = room.getRawState().objects.filter(card => card.location === 'HAND' && card.ownerId === 'a').slice(0, 3);
    room.playCardToTable('a', cards[0]!.id, { x: center.x + 0.2, y: 0, z: 0.1 }, true, true);
    room.updateObjectAfterDrag(cards[1]!.id, 'a', { ...center, y: 0 }, false, null, undefined, 1.3, true);
    room.playCardToTable('a', cards[2]!.id, { x: center.x - 0.3, y: 0, z: 0.1 }, true, true);
    const discard = () => room.getRawState().objects.filter(card => card.location === 'DISCARD')
      .sort((a, b) => a.position.y - b.position.y);
    expect(discard().map(card => [card.position, card.rotation])).toEqual(
      cards.map((_, index) => [{ ...center, y: index * PILE_LAYER_HEIGHT }, 0]),
    );
    const hidden = ViewStateBuilder.buildRoomState(room, 'b').objects.find(card => card.id === cards[1]!.id);
    expect(hidden).toMatchObject({ location: 'DISCARD', faceUp: false });
    expect(hidden).not.toHaveProperty('cardType');
    expect(hidden).not.toHaveProperty('faceImage');

    const drop = { x: -2, y: 0, z: -2 };
    expect(room.takeDiscardCard('viewer', cards[1]!.id, drop)).toBe(false);
    expect(room.flipDiscardPile('viewer', cards[2]!.id)).toBe(false);
    expect(room.flipDiscardPile('a', cards[1]!.id)).toBe(false);
    room.getObject(cards[0]!.id)!.lockedBy = 'b';
    expect(room.flipDiscardPile('a', cards[2]!.id)).toBe(false);
    expect(discard().map(card => card.faceUp)).toEqual([true, false, true]);
    room.getObject(cards[0]!.id)!.lockedBy = null;
    expect(room.takeDiscardCard('b', cards[1]!.id, { ...center, y: 0 })).toBe(false);
    expect(room.takeDiscardCard('b', cards[1]!.id, drop)).toBe(true);
    expect(room.takeDiscardCard('a', cards[1]!.id, drop)).toBe(false);
    expect(discard().map(card => [card.id, card.position.y])).toEqual([
      [cards[0]!.id, 0], [cards[2]!.id, PILE_LAYER_HEIGHT],
    ]);
    for (const viewer of ['a', 'b']) {
      expect(ViewStateBuilder.buildRoomState(room, viewer).objects.find(card => card.id === cards[1]!.id))
        .toMatchObject({ location: 'TABLE', position: drop, faceUp: false });
    }
  });

  it('đặt menu cạnh chồng ở chỗ trống và giữ thứ tự khi lấy cả chồng', () => {
    const room = new RoomManager().createRoom({ name: 'Chỗ trống', hostSessionId: 'a', hostName: 'A' });
    room.dealRound();
    room.addPlayer('viewer', 'Viewer', false);
    const cards = room.getRawState().objects.filter(card => card.location === 'HAND').slice(0, 4);
    const center = getDiscardZoneCenter(room.maxPlayers);
    room.playCardToTable('a', cards[0]!.id, { x: center.x, y: 0, z: -4.5 });
    for (const card of cards.slice(1)) room.playCardToTable('a', card.id, { ...center, y: 0 }, true, true);
    const destination = room.findDiscardDrop(point => Math.abs(point.x) < 10 && Math.abs(point.z) < 10)!;
    expect(destination).not.toEqual({ x: center.x, y: 0, z: -4.5 });
    expect(room.takeDiscardCards('viewer', cards[3]!.id, destination, 'all')).toEqual([]);
    const taken = room.takeDiscardCards('a', cards[3]!.id, destination, 'all');
    expect(taken.map(card => card.id)).toEqual(cards.slice(1).map(card => card.id));
    expect(taken.map(card => [card.position.y, card.rotation])).toEqual([
      [0, 0], [PILE_LAYER_HEIGHT, 0], [2 * PILE_LAYER_HEIGHT, 0],
    ]);
    expect(room.getRawState().objects.filter(card => card.location === 'DISCARD')).toEqual([]);
  });

  it('hai máy lấy theo cùng lá đỉnh, chỉ một yêu cầu được phát tới cả phòng', async () => {
    const manager = new RoomManager();
    const http = new HttpServer(0);
    const listener = http.getServer();
    const server = new WebSocketServer(listener, manager);
    server.start();
    http.start();
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('Thiếu cổng WebSocket');
    const url = 'ws://127.0.0.1:' + address.port + '/ws';
    const clients: WebSocket[] = [];
    async function connect() {
      const ws = new WebSocket(url);
      clients.push(ws);
      const messages: ServerToClientMessage[] = [];
      ws.on('message', data => messages.push(JSON.parse(data.toString()) as ServerToClientMessage));
      await once(ws, 'open');
      return { messages, send: (msg: ClientToServerMessage) => ws.send(JSON.stringify(msg)) };
    }
    try {
      const a = await connect();
      const b = await connect();
      a.send({ type: 'room:create', payload: { roomName: 'Lấy chồng', playerName: 'Alice' } });
      await expect.poll(() => a.messages.some(msg => msg.type === 'room:joined')).toBe(true);
      const joined = a.messages.find(msg => msg.type === 'room:joined')!.payload;
      b.send({ type: 'room:join', payload: { roomId: joined.roomId, playerName: 'Bob' } });
      await expect.poll(() => b.messages.some(msg => msg.type === 'room:joined')).toBe(true);
      const room = manager.getRoom(joined.roomId)!;
      room.dealRound();
      const center = getDiscardZoneCenter(room.maxPlayers);
      const cards = room.getRawState().objects.filter(card => card.location === 'HAND' && card.ownerId === joined.playerId).slice(0, 3);
      for (const card of cards) room.playCardToTable(joined.playerId, card.id, { ...center, y: 0 }, true, true);
      const top = cards.at(-1)!;
      b.send({ type: 'object:flip', payload: { objectId: top.id, discard: true } });
      await expect.poll(() => a.messages.some(msg => msg.type === 'object:flipped')).toBe(true);
      expect(a.messages.find(msg => msg.type === 'object:flipped')!.payload)
        .toEqual({ objectId: top.id, faceUp: false, ownerId: null, location: 'DISCARD' });
      const currentPile = (client: typeof a) => client.messages.filter(msg => msg.type === 'room:state').at(-1)?.payload.objects
        .filter(card => card.location === 'DISCARD').sort((left, right) => left.position.y - right.position.y) ?? [];
      for (const faces of [[false, false, true], [true, true, false]]) {
        b.send({ type: 'discard:flip-all', payload: { cardId: top.id } });
        for (const client of [a, b]) {
          await expect.poll(() => currentPile(client).map(card => card.faceUp)).toEqual(faces);
          expect(currentPile(client).map(card => card.id)).toEqual(cards.map(card => card.id));
          for (const card of currentPile(client).filter(card => !card.faceUp)) {
            expect(card).not.toHaveProperty('cardType');
            expect(card).not.toHaveProperty('faceImage');
          }
        }
      }
      b.send({ type: 'object:flip', payload: { objectId: top.id, discard: true } });
      await expect.poll(() => a.messages.filter(msg => msg.type === 'object:flipped').length).toBe(2);
      expect(a.messages.filter(msg => msg.type === 'object:flipped')[1]!.payload)
        .toMatchObject({ objectId: top.id, faceUp: true, location: 'DISCARD', cardType: top.cardType, faceImage: top.faceImage });
      const position = { x: -4, y: 0, z: 2 };
      a.send({ type: 'discard:take', payload: { cardId: top.id, position, mode: 'top' } });
      b.send({ type: 'discard:take', payload: { cardId: top.id, position, mode: 'all' } });
      await expect.poll(() => [a, b].flatMap(c => c.messages.filter(msg => msg.type === 'error')).length).toBe(1);
      const events = (client: typeof a) => client.messages.filter(msg => msg.type === 'discard:taken');
      await expect.poll(() => events(a).length).toBe(1);
      await expect.poll(() => events(b).length).toBe(1);
      expect(events(a)).toEqual(events(b));
      const errorsBefore = a.messages.filter(msg => msg.type === 'error').length;
      a.send({ type: 'object:flip', payload: { objectId: top.id, discard: true } });
      await expect.poll(() => a.messages.filter(msg => msg.type === 'error').length).toBe(errorsBefore + 1);
      expect(a.messages.filter(msg => msg.type === 'error').at(-1)!.payload).toMatchObject({ code: 'FLIP_REJECTED' });
      expect(room.getObject(top.id)?.faceUp).toBe(true);
      const notice = events(a)[0]!.payload;
      if (notice.mode === 'all') {
        expect(notice).toEqual({ mode: 'all', playerName: 'Bob', cardIds: cards.map(card => card.id) });
        expect(room.getRawState().objects.filter(card => card.location === 'DISCARD')).toHaveLength(0);
      } else {
        expect(notice).toEqual({ mode: 'top', playerName: 'Alice', cardIds: [top.id] });
        expect(room.getRawState().objects.filter(card => card.location === 'DISCARD')).toHaveLength(2);
      }
    } finally {
      for (const client of clients) client.terminate();
      server.shutdown();
      http.stop();
    }
  });


  it('giữ góc của lá neo và độ cao theo lớp khi tạo và xáo chồng tự do', () => {
    const room = new RoomManager().createRoom({ name: 'Chồng tự do', hostSessionId: 'a', hostName: 'A' });
    room.dealRound();
    const cards = room.getRawState().objects.filter(card => card.location === 'HAND').slice(0, 3);
    for (const [index, card] of cards.entries()) {
      room.playCardToTable('a', card.id, { x: -2 - index, y: 0, z: 1 });
      room.moveObject(card.id, { x: -2 - index, y: 0, z: 1 }, 0.6 + index);
    }
    room.formTablePile(cards.map(card => card.id));
    expect(room.shuffleTablePile(cards[0]!.id)).toBe(true);
    expect(cards.map(card => room.getObject(card.id)!).sort((a, b) => a.position.y - b.position.y)
      .map(card => [card.position, card.rotation])).toEqual(
      cards.map((_, index) => [{ x: -2, y: index * PILE_LAYER_HEIGHT, z: 1 }, 0.6]),
    );
  });
});
