import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { BASE_CARD_DEFINITIONS, CARD_DEFINITIONS, CARD_PACKS, getBasePack } from '../../../shared/constants/cardTypes.js';
import { CardType } from '../../../shared/types/gameObjects.js';
import type { ClientToServerMessage, ServerToClientMessage } from '../../../shared/types/protocol.js';
import { RoomManager } from '../room/RoomManager.js';
import { buildRoundDeck, previewRound } from '../room/RoundDeck.js';
import { HttpServer } from '../server/HttpServer.js';
import { WebSocketServer } from '../server/WebSocketServer.js';

type WithPayload = Exclude<ServerToClientMessage, { type: 'pong' }>;
type Payload = { [M in WithPayload as M['type']]: M['payload'] };

describe('Bộ bài gốc và chia bài', () => {
  it('có đúng 56 lá, 13 loại và 5 loại mèo thường', () => {
    expect(BASE_CARD_DEFINITIONS.reduce((sum, card) => sum + card.count, 0)).toBe(56);
    expect(new Set(BASE_CARD_DEFINITIONS.map(card => card.type)).size).toBe(13);
    expect(BASE_CARD_DEFINITIONS.filter(card => card.isNormalCat)).toHaveLength(5);
  });

  it.each([2, 5, 10])('chia đúng thành phần cho %i người', seated => {
    const setup = { explodingKittens: 3, defuses: Math.max(6, seated) };
    const players = Array.from({ length: seated }, (_, index) => String(index));
    const manager = new RoomManager();
    const room = manager.createRoom({ name: 'Chia bài', hostSessionId: players[0]!, hostName: 'P0', doubleDeck: seated === 10 });
    players.slice(1).forEach((id, index) => room.addPlayer(id, 'P' + (index + 1), false));
    room.configureRound(setup);
    room.dealRound();
    expect(() => room.dealRound()).toThrow('đã chia');
    const objects = room.getRawState().objects;
    const deck = objects.filter(card => card.location === 'DECK');
    const expectedOther = seated === 10 ? 92 : 46;
    expect(deck).toHaveLength(expectedOther + setup.explodingKittens + setup.defuses - 6 * seated);
    expect(deck.filter(card => card.cardType === CardType.ExplodingKitten)).toHaveLength(setup.explodingKittens);
    expect(deck.filter(card => card.cardType === CardType.Defuse)).toHaveLength(setup.defuses - seated);
    expect(new Set(objects.map(card => card.id)).size).toBe(objects.length);
    for (const player of players) {
      const hand = objects.filter(card => card.ownerId === player && card.location === 'HAND');
      expect(hand).toHaveLength(6);
      expect(hand.filter(card => card.cardType === CardType.Defuse)).toHaveLength(1);
      expect(hand.some(card => card.cardType === CardType.ExplodingKitten)).toBe(false);
    }
    room.resetRound();
    expect(room.phase).toBe('SETUP');
    expect(room.getRawState().objects).toEqual([]);
  });

  it('có đúng số lượng mặc định và mã loại riêng cho từng bộ', () => {
    expect(CARD_PACKS.map(pack => pack.cards.reduce((sum, card) => sum + card.count, 0))).toEqual([56, 61, 20, 15, 20, 28, 15, 14, 26, 10]);
    const definitions = CARD_PACKS.flatMap(pack => pack.cards);
    expect(CARD_DEFINITIONS.size).toBe(definitions.length);
    for (const pack of CARD_PACKS) expect(pack.cards.every(card => card.pack === pack.id)).toBe(true);
    expect(previewRound({ explodingKittens: 4, defuses: 6, enabledPacks: ['imploding', 'streaking', 'barking'] },
      2, 'SETUP')).toMatchObject({ totalCards: 111, bombCount: 6, remainingBombs: 6, remainingDefuses: 4, streakingWarning: true });
  });

  it.each([2, 5, 10])('chia bài mở rộng cho %i người và giữ tất cả bom trong chồng', seated => {
    const players = Array.from({ length: seated }, (_, index) => String(index));
    const setup = { explodingKittens: 4, defuses: Math.max(6, seated) };
    for (const enabledPacks of [['imploding'], ['imploding', 'streaking', 'barking']] as const) {
      const configured = { ...setup, enabledPacks: [...enabledPacks], cardCounts: { [CardType.Reverse]: 0, [CardType.Mark]: 7 } };
      const cards = buildRoundDeck(configured, players);
      const preview = previewRound(configured, seated, 'SETUP');
      const deck = cards.filter(card => card.location === 'DECK');
      expect(deck).toHaveLength(preview.remainingCards);
      expect(deck.filter(card => CARD_DEFINITIONS.get(card.cardType as CardType)?.isBomb)).toHaveLength(preview.remainingBombs!);
      expect(deck.filter(card => card.cardType === CardType.Defuse)).toHaveLength(preview.remainingDefuses);
      expect(deck.every(card => !card.faceUp)).toBe(true);
      expect(cards.some(card => card.cardType === CardType.Reverse)).toBe(false);
      expect(cards.filter(card => card.cardType === CardType.Mark)).toHaveLength(enabledPacks.length === 3 ? 7 : 0);
      expect(new Set(cards.map(card => card.id)).size).toBe(cards.length);
      for (const id of players) {
        const hand = cards.filter(card => card.ownerId === id);
        expect(hand).toHaveLength(6);
        expect(hand.filter(card => card.cardType === CardType.Defuse)).toHaveLength(1);
        expect(hand.some(card => CARD_DEFINITIONS.get(card.cardType as CardType)?.isBomb)).toBe(false);
      }
    }
  });


  it('bộ Zombie có 61 lá và 116 lá khi kết hợp ba bộ mở rộng', () => {
    const setup = { basePackId: 'zombie' as const, explodingKittens: 4, defuses: 6 };
    expect(previewRound(setup, 2, 'SETUP')).toMatchObject({
      enabledPacks: ['zombie'], totalCards: 61, bombCount: 4, rescueCount: 5, remainingRescues: 3,
    });
    expect(previewRound({ ...setup, enabledPacks: ['base', 'imploding', 'streaking', 'barking'] }, 6, 'SETUP')).toMatchObject({
      enabledPacks: ['zombie', 'imploding', 'streaking', 'barking'], totalCards: 116,
      bombCount: 6, streakingWarning: false, validationError: expect.stringContaining('thiếu 1 lá Mèo Thây Ma (Zombie Kitten)'),
    });
    expect(() => buildRoundDeck(setup, Array.from({ length: 10 }, (_, i) => String(i))))
      .toThrow('Zombie Kittens thiếu 5 lá Mèo Thây Ma (Zombie Kitten)');
  });

  it.each([2, 5, 10])('chia đúng lá cứu Zombie cho %i người', seated => {
    const players = Array.from({ length: seated }, (_, i) => String(i));
    const base = getBasePack('zombie');
    for (const enabledPacks of [[], ['imploding'], ['imploding', 'streaking', 'barking']] as const) {
      const setup = { basePackId: base.id, explodingKittens: 4, defuses: 6,
        enabledPacks: [...enabledPacks], cardCounts: { [base.rescue.type]: Math.max(seated, 5) } };
      const plan = previewRound(setup, seated, 'SETUP');
      const cards = buildRoundDeck(setup, players);
      const definitions = (objects: typeof cards) => objects.map(card => CARD_DEFINITIONS.get(card.cardType as CardType)!);
      expect(definitions(cards).every(card => card.pack !== 'base')).toBe(true);
      const deck = definitions(cards.filter(card => card.location === 'DECK'));
      expect(deck).toHaveLength(plan.remainingCards);
      expect(deck.filter(card => card.isBomb)).toHaveLength(plan.remainingBombs!);
      expect(deck.filter(card => card.isRescue)).toHaveLength(plan.remainingRescues!);
      for (const id of players) {
        const hand = definitions(cards.filter(card => card.ownerId === id));
        expect(hand[0]?.type).toBe(base.rescue.type);
        expect(hand.filter(card => card.isRescue)).toHaveLength(1);
        expect(hand.filter(card => !card.isBomb && !card.isRescue)).toHaveLength(5);
      }
    }
  });

  it('chặn khi không có người, thiếu Gỡ Bom hoặc thiếu lá khác', () => {
    expect(() => buildRoundDeck({ explodingKittens: 4, defuses: 6 }, [])).toThrow('ít nhất một người');
    expect(() => buildRoundDeck({ explodingKittens: 4, defuses: 1 }, ['A', 'B'])).toThrow('Gỡ Bom');

    const setup = { explodingKittens: 4, defuses: 10 };
    expect(previewRound(setup, 10, 'SETUP')).toMatchObject({
      ordinaryMultiplier: 1, validationError: expect.stringContaining('Không đủ lá'),
    });
    expect(previewRound(setup, 2, 'SETUP', true)).toMatchObject({
      ordinaryMultiplier: 2, totalCards: 106, remainingCards: 94,
    });
  });

  it('đồng bộ thiết lập và chỉ gửi số lượng chồng/tay đối thủ qua WebSocket', async () => {
    const http = new HttpServer(0);
    const listener = http.getServer();
    const server = new WebSocketServer(listener, new RoomManager());
    const sockets: WebSocket[] = [];
    server.start();
    http.start();
    try {
      await once(listener, 'listening');
      const address = listener.address();
      if (!address || typeof address === 'string') throw new Error('Thiếu cổng WebSocket');
      async function connect(port: number) {
        const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
        sockets.push(ws);
        const queue: ServerToClientMessage[] = [];
        ws.on('message', data => queue.push(JSON.parse(data.toString()) as ServerToClientMessage));
        await once(ws, 'open');
        return {
          queue,
          disconnect: () => ws.close(),
          send: (message: ClientToServerMessage) => ws.send(JSON.stringify(message)),
          async read<T extends keyof Payload>(type: T): Promise<Payload[T]> {
            await expect.poll(() => queue.some(message => message.type === type)).toBe(true);
            const event = queue.splice(queue.findIndex(message => message.type === type), 1)[0];
            if (!event || !('payload' in event)) throw new Error('Thiếu nội dung gói tin');
            return event.payload as Payload[T];
          },
        };
      }

      const host = await connect(address.port);
      const peer = await connect(address.port);
      host.send({ type: 'room:create', payload: { roomName: 'Thiết lập' } });
      const a = await host.read('room:joined');
      expect(await host.read('room:state')).toMatchObject({
        round: { phase: 'SETUP', totalCards: 56, seatedCount: 1 },
        objects: [], deckCount: 0,
      });
      host.send({ type: 'card:draw' });
      expect((await host.read('error')).code).toBe('ROUND_ACTION_FORBIDDEN');
      peer.send({ type: 'room:join', payload: { roomId: a.roomId, playerName: 'B' } });
      const other = await peer.read('room:joined');
      await peer.read('room:state');
      expect((await host.read('round:configured')).seatedCount).toBe(2);

      for (const payload of [
        { basePackId: 'imploding' }, { enabledPacks: ['ghost'] }, { enabledPacks: ['imploding', 'imploding'] },
        { cardCounts: { [CardType.Mark]: 21 } }, { cardCounts: { [CardType.Skip]: 1 } },
        { cardCounts: { [CardType.Mark]: 1.5 } },
      ]) {
        host.send({ type: 'round:configure', payload: { explodingKittens: 4, defuses: 6, ...payload } } as ClientToServerMessage);
        expect((await host.read('error')).code).toBe('INVALID_FORMAT');
      }

      const zombieSetup = { basePackId: 'zombie' as const, explodingKittens: 4, defuses: 6,
        cardCounts: { [CardType.ZombieKitten]: 8 } };
      peer.send({ type: 'round:configure', payload: zombieSetup });
      expect((await peer.read('error')).code).toBe('ROUND_HOST_REQUIRED');
      host.send({ type: 'round:configure', payload: zombieSetup });
      for (const client of [host, peer]) expect(await client.read('round:configured')).toMatchObject({
        basePackId: 'zombie', totalCards: 64, rescueCount: 8,
      });
      host.send({ type: 'round:configure', payload: { basePackId: 'base', explodingKittens: 4, defuses: 6,
        enabledPacks: ['imploding', 'streaking'], cardCounts: { [CardType.Mark]: 0 } } });
      for (const client of [host, peer]) expect(await client.read('round:configured')).toMatchObject({
        totalCards: 88, enabledPacks: ['base', 'imploding', 'streaking'],
        cardCounts: { [CardType.Mark]: 0 }, streakingWarning: true,
      });
      host.send({ type: 'round:configure', payload: { explodingKittens: 4, defuses: 6, enabledPacks: [] } });
      for (const client of [host, peer]) expect(await client.read('round:configured')).toMatchObject({
        totalCards: 56, enabledPacks: ['base'], cardCounts: { [CardType.Mark]: 0 },
      });
      peer.send({ type: 'round:configure', payload: { explodingKittens: 3, defuses: 2, enabledPacks: ['barking'] } });
      expect((await peer.read('error')).code).toBe('ROUND_HOST_REQUIRED');
      host.send({ type: 'round:configure', payload: { explodingKittens: 3, defuses: 1 } });
      expect((await host.read('round:configured')).defuses).toBe(1);
      expect((await peer.read('round:configured')).defuses).toBe(1);
      host.send({ type: 'round:deal' });
      expect((await host.read('error')).message).toContain('Gỡ Bom');
      host.send({ type: 'round:configure', payload: { explodingKittens: 3, defuses: 41 } });
      expect((await host.read('error')).code).toBe('INVALID_FORMAT');
      host.send({ type: 'round:configure', payload: { explodingKittens: 3, defuses: 2 } });
      await host.read('round:configured');
      expect((await peer.read('round:configured')).remainingCards).toBe(39);
      host.send({ type: 'round:deal' });
      const forHost = await host.read('room:state');
      const forPeer = await peer.read('room:state');
      for (const [snapshot, id] of [[forHost, a.playerId], [forPeer, other.playerId]] as const) {
        expect(snapshot).toMatchObject({ round: { phase: 'PLAYING' }, deckCount: 39,
          handCounts: { [a.playerId]: 6, [other.playerId]: 6 } });
        expect(snapshot.objects).toHaveLength(6);
        expect(snapshot.objects.every(card => card.location === 'HAND' && card.ownerId === id && card.cardType)).toBe(true);
      }


      host.send({ type: 'round:configure', payload: zombieSetup });
      expect((await host.read('error')).code).toBe('ROUND_INVALID');
      const privateId = forHost.objects[0]!.id;
      host.send({ type: 'object:drag-preview', payload: { dragId: 1, phase: 'start',
        cards: [{ objectId: privateId, x: 1, y: 1, z: 1 }] } });
      const privatePreview = await peer.read('object:drag-preview');
      expect(privatePreview.cards[0]).toMatchObject({ faceUp: false, masked: true });
      expect(JSON.stringify(privatePreview)).not.toContain(privateId);
      host.send({ type: 'object:drag-preview-stop', payload: { dragId: 1 } });

      await peer.read('object:drag-preview-stop');

      const foreignCard = forHost.objects[5]!;
      const foreignAlias = forPeer.handSlots?.[a.playerId]?.[foreignCard.handIndex!]!;
      expect(foreignAlias).toMatch(/^anonymous-hand:/);
      expect(JSON.stringify(forPeer)).not.toContain(foreignCard.id);

      peer.send({ type: 'card:transfer', payload: { cardId: foreignAlias, targetPlayerId: a.playerId, handIndex: 0 } });
      for (const client of [host, peer]) {
        const reordered = await client.read('room:state');
        expect(reordered.handSlots?.[a.playerId]?.[0]).toBe(foreignAlias);
      }
      peer.send({ type: 'object:flip', payload: { objectId: foreignAlias } });
      expect(await host.read('object:flipped')).toMatchObject({ objectId: foreignCard.id, faceUp: false });
      await host.read('room:state');
      await peer.read('room:state');
      expect(peer.queue.some(message => message.type === 'object:flipped')).toBe(false);

      const foreignFrame = { objectId: foreignAlias, x: 1, y: 1, z: 1 };
      peer.send({ type: 'object:drag-preview', payload: { dragId: 11, phase: 'start', cards: [foreignFrame] } });
      expect((await host.read('object:drag-preview')).cards[0]).toMatchObject({ objectId: foreignAlias, masked: true, faceUp: false });
      host.send({ type: 'object:drag-preview', payload: { dragId: 12, phase: 'start', cards: [{ ...foreignFrame, objectId: foreignCard.id }] } });
      expect((await host.read('error')).code).toBe('OBJECT_LOCKED');
      peer.send({ type: 'object:drag-end', payload: { ...foreignFrame, dragId: 11, y: 0, faceUp: true } });
      peer.send({ type: 'object:drag-preview-stop', payload: { dragId: 11 } });
      for (const client of [host, peer]) {
        const visible = (await client.read('room:state')).objects.find(card => card.id === foreignCard.id);
        expect(visible).toMatchObject({ location: 'TABLE', faceUp: false });
        expect(visible?.cardType).toBeUndefined();
        expect((await client.read('object:drag-end')).objectId).toBe(foreignCard.id);
      }
      await host.read('object:drag-preview-stop');
      host.send({ type: 'card:transfer', payload: { cardId: foreignCard.id, targetPlayerId: a.playerId } });
      await host.read('hand:card-transferred');
      await host.read('room:state');
      const restored = await peer.read('room:state');
      expect(restored.handSlots?.[a.playerId]).toHaveLength(6);
      expect(restored.handSlots?.[a.playerId]).not.toContain(foreignAlias);

      host.send({ type: 'card:draw' });
      const drawn = (await host.read('hand:card-drawn')).card;
      expect(drawn.cardType).toBeTruthy();
      expect(await peer.read('deck:count')).toMatchObject({ count: 38, ownerId: a.playerId, handCount: 7 });
      expect(JSON.stringify(peer.queue)).not.toContain(drawn.id);
      peer.send({ type: 'object:flip', payload: { objectId: drawn.id } });
      expect((await peer.read('error')).code).toBe('FLIP_REJECTED');

      host.send({ type: 'deck:take' });
      const tableCard = (await peer.read('deck:card-taken')).card;
      expect(tableCard).toMatchObject({ location: 'TABLE', faceUp: false });
      expect(tableCard.cardType).toBeUndefined();
      await host.read('deck:card-taken');
      peer.send({ type: 'object:flip', payload: { objectId: tableCard.id } });
      for (const client of [host, peer]) {
        expect(await client.read('object:flipped')).toMatchObject({
          objectId: tableCard.id, faceUp: true, cardType: expect.any(String),
        });
        await client.read('room:state');
      }


      peer.send({ type: 'object:flip', payload: { objectId: tableCard.id } });
      for (const client of [host, peer]) {
        expect((await client.read('object:flipped')).faceUp).toBe(false);
        await client.read('room:state');
      }
      const dragFrame = { objectId: tableCard.id, x: 1, y: 1, z: 1 };
      host.send({ type: 'object:drag-preview', payload: { dragId: 2, phase: 'start', cards: [dragFrame] } });
      await peer.read('object:drag-preview');
      host.send({ type: 'card:transfer', payload: { cardId: tableCard.id, targetPlayerIndex: other.playerIndex, dragId: 2 } });
      host.send({ type: 'object:drag-preview-stop', payload: { dragId: 2 } });
      const received = await peer.read('hand:card-transferred');
      expect(received.card).toMatchObject({
        id: tableCard.id, location: 'HAND', ownerId: other.playerId, faceUp: false, cardType: expect.any(String),
      });
      expect((await peer.read('room:state')).objects).toContainEqual(received.card);
      const peerHand = await host.read('room:state');
      expect(peerHand.handCounts?.[other.playerId]).toBe(7);
      expect(peerHand.objects.some(card => card.id === tableCard.id)).toBe(false);
      expect(host.queue.some(message => message.type === 'hand:card-transferred')).toBe(false);
      await peer.read('object:drag-preview-stop');

      peer.send({ type: 'object:flip', payload: { objectId: tableCard.id } });
      await peer.read('object:flipped');
      await peer.read('room:state');
      await host.read('room:state');
      peer.send({ type: 'object:drag-preview', payload: { dragId: 1, phase: 'start', cards: [dragFrame] } });
      await host.read('object:drag-preview');
      peer.send({ type: 'object:drag-end', payload: { ...dragFrame, dragId: 1, y: 0, targetPlayerIndex: null } });
      peer.send({ type: 'object:drag-preview-stop', payload: { dragId: 1 } });
      for (const client of [host, peer]) {
        const cards = (await client.read('room:state')).objects.filter(card => card.id === tableCard.id);
        expect(cards).toEqual([expect.objectContaining({
          location: 'TABLE', ownerId: null, faceUp: true, cardType: received.card.cardType,
        })]);
        expect((await client.read('object:drag-end')).objectId).toBe(tableCard.id);
      }


      host.send({ type: 'deck:set-affected-count', payload: { count: 3 } });
      expect((await peer.read('deck:count')).deck?.affectedCount).toBe(3);

      const guest = await connect(address.port);
      guest.send({ type: 'room:join', payload: { roomId: a.roomId, playerName: 'Khán giả' } });
      const watcher = await guest.read('room:joined');
      expect(watcher.playerIndex).toBe(-1);
      expect(await guest.read('room:state')).toMatchObject({ round: { cardCounts: { [CardType.Mark]: 0 } }, objects: [{ id: tableCard.id, faceUp: true }], deckCount: 37, deck: { affectedCount: 3 } });

      const clients = [host, peer, guest];
      host.send({ type: 'deck:view-open', payload: { mode: 'see' } });
      const see = (await host.read('deck:view-state'))!;
      expect(see).toMatchObject({ mode: 'see', viewerId: a.playerId, seat: 0 });
      expect(see.cards).toEqual([0, 1, 2].map(token => ({ token, cardType: expect.any(String) })));
      for (const client of [peer, guest]) {
        const publicView = (await client.read('deck:view-state'))!;
        expect(publicView.cards).toEqual([{ token: 0 }, { token: 1 }, { token: 2 }]);
      }
      const blocked: ClientToServerMessage[] = [
        { type: 'card:draw' }, { type: 'deck:take' }, { type: 'deck:shuffle' },
        { type: 'deck:set-affected-count', payload: { count: 1 } },
        { type: 'deck:view-open', payload: { mode: 'see' } },
        { type: 'deck:view-open', payload: { mode: 'alter' } },
      ];
      for (const message of blocked) {
        peer.send(message);
        expect(await peer.read('error')).toMatchObject({ code: 'DECK_LOCKED', message: expect.stringContaining('đang xem bài') });
      }
      peer.send({ type: 'deck:insert', payload: { cardIds: [tableCard.id] } });
      expect(await peer.read('error')).toMatchObject({ code: 'DRAG_END_FAILED', message: expect.stringContaining('đang xem bài') });
      peer.send({ type: 'deck:view-close', payload: { id: see.id } });
      expect((await peer.read('error')).code).toBe('DECK_VIEW_INVALID');
      host.send({ type: 'deck:view-close', payload: { id: see.id } });
      for (const client of clients) expect(await client.read('deck:view-state')).toBeNull();

      host.send({ type: 'deck:view-open', payload: { mode: 'alter' } });
      const alter = (await host.read('deck:view-state'))!;
      for (const client of [peer, guest]) await client.read('deck:view-state');
      expect(alter.cards).toEqual(see.cards);
      const order = [2, 0, 1];
      host.send({ type: 'deck:view-order', payload: { id: alter.id, order } });
      for (const client of clients) expect((await client.read('deck:view-state'))!.cards.map(card => card.token)).toEqual(order);
      host.send({ type: 'deck:view-close', payload: { id: alter.id, order: [0, 0, 1] } });
      expect((await host.read('error')).code).toBe('DECK_VIEW_INVALID');
      host.send({ type: 'deck:view-close', payload: { id: alter.id, order } });
      for (const client of clients) {
        expect((await client.read('deck:view-state'))!.cards.map(card => card.token)).toEqual(order);
        expect(await client.read('deck:view-state')).toBeNull();
      }

      guest.send({ type: 'object:flip', payload: { objectId: tableCard.id } });
      expect(await guest.read('object:flipped')).toMatchObject({ objectId: tableCard.id, faceUp: false });
      await guest.read('room:state');
      guest.send({ type: 'deck:take' });
      expect((await guest.read('error')).code).toBe('ROUND_ACTION_FORBIDDEN');


      guest.send({ type: 'round:reset' });
      expect((await guest.read('error')).code).toBe('ROUND_HOST_REQUIRED');
      host.send({ type: 'deck:insert', payload: { cardIds: [tableCard.id] } });
      peer.send({ type: 'deck:insert', payload: { cardIds: [tableCard.id] } });
      expect(await guest.read('deck:inserted')).toEqual({ count: 1 });
      const conflictingClients = () => [host, peer].filter(client => client.queue.some(message =>
        message.type === 'error' && message.payload.code === 'DRAG_END_FAILED'));
      await expect.poll(() => conflictingClients().length).toBe(1);
      expect((await conflictingClients()[0]!.read('error')).code).toBe('DRAG_END_FAILED');
      const inserted = await guest.read('room:state');
      expect(inserted.deck).toEqual({ count: 38, affectedCount: 3 });
      expect(inserted.objects.some(card => card.id === tableCard.id)).toBe(false);
      peer.send({ type: 'deck:shuffle' });
      const shuffled = await guest.read('deck:shuffled');
      expect(shuffled).toEqual({ deck: { count: 38, affectedCount: 3 }, playerName: 'B' });

      peer.send({ type: 'deck:view-open', payload: { mode: 'alter' } });
      const abandoned = (await peer.read('deck:view-state'))!;
      for (const client of [host, guest]) await client.read('deck:view-state');
      peer.send({ type: 'deck:view-order', payload: { id: abandoned.id, order: [2, 1, 0] } });
      for (const client of [host, guest]) await client.read('deck:view-state');
      peer.disconnect();
      for (const client of [host, guest]) expect(await client.read('deck:view-state')).toBeNull();
      await guest.read('room:state');

      for (let remaining = 38; remaining > 0; remaining--) host.send({ type: 'deck:take' });
      for (let remaining = 37; remaining >= 0; remaining--) {
        const taken = await host.read('deck:card-taken');
        expect(taken.deckCount).toBe(remaining);
        expect(taken.deck?.affectedCount).toBe(Math.min(remaining, 3));
      }
      host.send({ type: 'deck:take' });
      expect((await host.read('error')).code).toBe('DECK_EMPTY');

      host.send({ type: 'round:reset' });
      const reset = await guest.read('room:state');
      expect(reset).toMatchObject({ round: { phase: 'SETUP', seatedCount: 2, cardCounts: { [CardType.Mark]: 0 } }, objects: [], handCounts: {}, deckCount: 0 });
      expect(reset.players.find(player => player.id === watcher.playerId)?.playerIndex).toBe(2);
      host.send({ type: 'round:configure', payload: { explodingKittens: 3, defuses: 2,
        enabledPacks: ['imploding', 'streaking', 'barking'] } });
      expect(await guest.read('round:configured')).toMatchObject({ totalCards: 103, bombCount: 5 });
      host.send({ type: 'round:deal' });
      const expanded = await guest.read('room:state');
      expect(expanded).toMatchObject({ deckCount: 91, deck: { count: 91, affectedCount: 3 } });
      expect(expanded.objects).toHaveLength(6);
      expect(expanded.objects.every(card => card.location === 'HAND' && card.ownerId === watcher.playerId && card.cardType)).toBe(true);
      host.send({ type: 'round:reset' });

      expect((await guest.read('room:state')).round).toMatchObject({
        phase: 'SETUP', enabledPacks: ['base', 'imploding', 'streaking', 'barking'],
        cardCounts: { [CardType.Mark]: 0, [CardType.ZombieKitten]: 8 },
      });
      host.send({ type: 'round:configure', payload: { ...zombieSetup, cardCounts: undefined } });
      expect(await guest.read('round:configured')).toMatchObject({ basePackId: 'zombie', rescueCount: 8 });
      const late = await connect(address.port);
      late.send({ type: 'room:join', payload: { roomId: a.roomId, playerName: 'Vào muộn' } });
      await late.read('room:joined');
      expect((await late.read('room:state')).round).toMatchObject({ basePackId: 'zombie', rescueCount: 8 });
      host.send({ type: 'round:deal' });
      const zombieRound = await guest.read('room:state');
      expect(zombieRound.round).toMatchObject({ basePackId: 'zombie', phase: 'PLAYING' });
      expect(zombieRound.objects).toHaveLength(6);

      expect(zombieRound.objects.filter(card => card.cardType === CardType.ZombieKitten)).toHaveLength(1);
      host.send({ type: 'deck:gather-bombs' });
      guest.send({ type: 'deck:gather-bombs' });
      const formed = await guest.read('stack:formed');
      expect(formed.gatheredBy).toBeTruthy();
      expect(Object.keys(formed).sort()).toEqual(['anchorId', 'gatheredBy']);
      const gathered = await guest.read('room:state');
      expect(gathered.deckCount).toBe(zombieRound.deckCount! - 5);
      const bombs = gathered.objects.filter(card => card.location === 'TABLE');
      expect(bombs).toHaveLength(5);
      expect(new Set(bombs.map(card => card.id)).size).toBe(5);
      expect(bombs.every(card => !card.faceUp && !card.cardType)).toBe(true);
      await expect.poll(() => [host, guest].filter(client =>
        client.queue.some(event => event.type === 'deck:gather-empty')).length).toBe(1);
      host.send({ type: 'round:reset' });
      expect((await guest.read('room:state')).round).toMatchObject({ basePackId: 'zombie', phase: 'SETUP', rescueCount: 8 });
    } finally {
      for (const socket of sockets) socket.terminate();
      server.shutdown();
      http.stop();
    }
  }, 10000);
});
