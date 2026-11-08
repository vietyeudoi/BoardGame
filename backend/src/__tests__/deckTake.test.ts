import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { getDefaultSeatPlacement } from '../../../shared/constants/config.js';
import type { ClientToServerMessage, ServerToClientMessage } from '../../../shared/types/protocol.js';
import { LegacyRoomFixture } from './LegacyRoomFixture.js';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';

type MessageWithPayload = Exclude<ServerToClientMessage, { type: 'pong' }>;
type PayloadByType = { [Message in MessageWithPayload as Message['type']]: Message['payload'] };

describe('Lấy bài từ chồng trong phòng', () => {
  let http: HttpServer;
  let server: WebSocketServer;
  let url: string;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    http = new HttpServer(0);
    const listener = http.getServer();
    server = new WebSocketServer(listener, new LegacyRoomFixture());
    server.start();
    http.start();
    await once(listener, 'listening');
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('Thiếu cổng WebSocket');
    url = 'ws://127.0.0.1:' + address.port + '/ws';
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.terminate();
    server.shutdown();
    http.stop();
  });

  async function connect() {
    const ws = new WebSocket(url);
    clients.push(ws);
    const messages: ServerToClientMessage[] = [];
    ws.on('message', data => messages.push(JSON.parse(data.toString()) as ServerToClientMessage));
    await once(ws, 'open');
    async function receive<T extends keyof PayloadByType>(type: T): Promise<PayloadByType[T]> {
      await expect.poll(() => messages.some(msg => msg.type === type)).toBe(true);
      const index = messages.findIndex(msg => msg.type === type);
      const message = messages.splice(index, 1)[0];
      if (!message || !('payload' in message)) throw new Error('Thiếu nội dung gói tin');
      return message.payload as PayloadByType[T];
    }
    return {
      ws, receive,
      send: (message: ClientToServerMessage) => ws.send(JSON.stringify(message)),
    };
  }

  it('đồng bộ Đỉnh/Đáy, giữ Tùy chọn riêng và lấy đồng thời không trùng lá', async () => {
    const a = await connect();
    const b = await connect();
    a.send({ type: 'room:create', payload: { roomName: 'Chồng chung' } });
    const alice = await a.receive('room:joined');
    const initial = await a.receive('room:state');
    expect(initial.deckDrawEnd).toBe('TOP');
    const deck = initial.objects.filter(card => card.location === 'DECK');

    b.send({ type: 'room:join', payload: { roomId: alice.roomId, playerName: 'Bob' } });
    const bob = await b.receive('room:joined');
    await b.receive('room:state');

    b.send({ type: 'deck:set-draw-end', payload: { end: 'BOTTOM' } });
    expect((await a.receive('room:state')).deckDrawEnd).toBe('BOTTOM');
    expect((await b.receive('room:state')).deckDrawEnd).toBe('BOTTOM');

    a.send({ type: 'deck:take', payload: { cardsAbove: 1 } });
    b.send({ type: 'deck:take' });
    const received = [await a.receive('deck:card-taken'), await a.receive('deck:card-taken')].map(event => event.card);
    const mirrored = [await b.receive('deck:card-taken'), await b.receive('deck:card-taken')].map(event => event.card);
    expect(received).toEqual(mirrored);
    const aliceCard = received.find(card => card.id === deck.at(-2)!.id)!;
    const bobCard = received.find(card => card.id === deck[0]!.id)!;
    expect(aliceCard.id).toBe(deck.at(-2)!.id);
    expect(bobCard.id).toBe(deck[0]!.id);
    expect(new Set(received.map(card => card.id)).size).toBe(2);
    for (const [card, seat] of [[aliceCard, alice.playerIndex], [bobCard, bob.playerIndex]] as const) {
      const { x, z, rotationY } = getDefaultSeatPlacement(seat);
      expect(card).toMatchObject({ faceUp: false, location: 'TABLE', position: { x, z }, rotation: rotationY });
      expect(card.cardType).toBeUndefined();
    }

    b.send({ type: 'object:flip', payload: { objectId: aliceCard.id } });
    for (const client of [a, b]) {
      expect(await client.receive('object:flipped')).toMatchObject({
        objectId: aliceCard.id, faceUp: true, cardType: expect.any(String),
      });
      await client.receive('room:state');
    }
    a.send({ type: 'object:flip', payload: { objectId: aliceCard.id } });
    for (const client of [a, b]) {
      expect(await client.receive('object:flipped')).toMatchObject({ objectId: aliceCard.id, faceUp: false });
      await client.receive('room:state');
    }

    const late = await connect();
    late.send({ type: 'room:join', payload: { roomId: alice.roomId, playerName: 'Late' } });
    await late.receive('room:joined');
    const snapshot = await late.receive('room:state');
    expect(snapshot.deckDrawEnd).toBe('BOTTOM');
    expect(snapshot.objects.filter(card => card.location === 'DECK')).toHaveLength(deck.length - 2);
    expect(snapshot.objects.find(card => card.id === aliceCard.id)?.cardType).toBeUndefined();

    a.send({ type: 'deck:set-draw-end', payload: { end: 'TOP' } });
    expect((await a.receive('room:state')).deckDrawEnd).toBe('TOP');
    a.send({ type: 'deck:take' });
    expect((await a.receive('deck:card-taken')).card.id).toBe(deck.at(-1)!.id);
    a.send({ type: 'deck:take', payload: { cardsAbove: deck.length } });
    expect((await a.receive('error')).code).toBe('DECK_POSITION_INVALID');


    a.send({ type: 'deck:take' });
    b.send({ type: 'deck:take' });
    const concurrentIds = [(await a.receive('deck:card-taken')).card.id, (await a.receive('deck:card-taken')).card.id];
    expect(concurrentIds).toEqual([deck.at(-3)!.id, deck.at(-4)!.id]);

    for (let i = 0; i < deck.length - 5; i++) a.send({ type: 'deck:take' });
    // Mọi lần lấy đều nhận kết quả. Gói sau khi chồng hết báo lỗi.
    for (let i = 0; i < deck.length - 5; i++) await a.receive('deck:card-taken');
    a.send({ type: 'deck:take' });
    expect((await a.receive('error')).code).toBe('DECK_EMPTY');
  });

  it('khôi phục ghế cũ, số bài và chế độ chung khi socket kết nối lại', async () => {
    const first = await connect();
    first.send({ type: 'room:create', payload: { roomName: 'Kết nối lại' } });
    const joined = await first.receive('room:joined');
    const token = joined.resumeToken!;
    const initial = await first.receive('room:state');
    first.send({ type: 'deck:set-draw-end', payload: { end: 'BOTTOM' } });
    await first.receive('room:state');
    first.send({ type: 'deck:take' });
    const taken = await first.receive('deck:card-taken');
    first.ws.close();
    await once(first.ws, 'close');

    const next = await connect();
    next.send({ type: 'room:resume', payload: { roomId: joined.roomId, playerId: joined.playerId, token: 'sai' } });
    expect((await next.receive('error')).code).toBe('ROOM_RESUME_FAILED');
    next.send({ type: 'room:resume', payload: { roomId: joined.roomId, playerId: joined.playerId, token } });
    const resumed = await next.receive('room:joined');
    expect(resumed).toMatchObject({ playerId: joined.playerId, playerIndex: joined.playerIndex });
    expect(resumed.resumeToken).not.toBe(token);
    const snapshot = await next.receive('room:state');
    expect(snapshot.deckDrawEnd).toBe('BOTTOM');
    expect(snapshot.objects.filter(card => card.location === 'DECK')).toHaveLength(
      initial.objects.filter(card => card.location === 'DECK').length - 1
    );

    expect(snapshot.objects.find(card => card.id === taken.card.id)).toEqual(taken.card);

    // Socket cũ còn mở khi mạng gián đoạn. Mã mới thay được nó, mã đã dùng thì không.
    const replacement = await connect();
    const replaced = once(next.ws, 'close');
    replacement.send({ type: 'room:resume', payload: {
      roomId: joined.roomId, playerId: joined.playerId, token: resumed.resumeToken!,
    } });
    expect((await replacement.receive('room:joined')).playerId).toBe(joined.playerId);
    await replaced;
    const stale = await connect();
    stale.send({ type: 'room:resume', payload: { roomId: joined.roomId, playerId: joined.playerId, token } });
    expect((await stale.receive('error')).code).toBe('ROOM_RESUME_FAILED');
  });
});
