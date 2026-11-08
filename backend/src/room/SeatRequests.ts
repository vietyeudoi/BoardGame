import { SEAT_CHANGE } from '../../../shared/constants/config.js';
import type { ClientToServerMessage, SeatRequest, ServerToClientMessage } from '../../../shared/types/protocol.js';
import { IdGenerator } from '../utils/IdGenerator.js';
import type { Room } from './Room.js';

type SeatMessage = Extract<ClientToServerMessage, { type: 'seat:choose' | 'seat:reply' | 'seat:cancel' | 'seat:busy' }>;
type Notice = Extract<ServerToClientMessage, { type: 'seat:request' | 'seat:result' }>;
interface Pending {
  request: SeatRequest;
  roomId: string;
  timer: ReturnType<typeof setTimeout>;
}

export class SeatRequests {
  private readonly _pending = new Map<string, Pending>();
  private readonly _last = new Map<string, number>();
  private readonly _busy = new Set<string>();

  constructor(private readonly _send: (id: string, message: Notice) => void) {}

  cancelFor(playerId: string, message: string): void {
    for (const pending of this._pending.values()) {
      if (pending.request.fromId === playerId || pending.request.toId === playerId) this._finish(pending, message);
    }
  }

  disconnect(playerId: string): void {
    this.cancelFor(playerId, 'Yêu cầu đổi ghế đã hủy vì có người rời bàn.');
    this._busy.delete(playerId);
    this._last.delete(playerId);
  }

  private _finish(pending: Pending, message: string): void {
    const { request, timer } = pending;
    clearTimeout(timer);
    this._pending.delete(request.id);
    for (const id of [request.fromId, request.toId]) {
      this._send(id, { type: 'seat:result', payload: { id: request.id, message } });
    }
  }

  private _check(room: Room, ...ids: string[]): void {
    for (const id of ids) {
      if (this._busy.has(id)) throw new Error('Người chơi đang kéo khung chọn.');
      const reason = room.seatBlock(id);
      if (reason) throw new Error(reason);
    }
  }

  handle(room: Room, playerId: string, msg: SeatMessage): string | undefined {
    if (msg.type === 'seat:busy') {
      if (msg.payload.active) {
        this._busy.add(playerId);
        this.cancelFor(playerId, 'Yêu cầu đã hủy vì người chơi đang thao tác.');
      } else this._busy.delete(playerId);
      return;
    }
    if (msg.type === 'seat:choose') return this._choose(room, playerId, msg.payload.index, msg.payload.expectedPlayerId);
    const pending = this._pending.get(msg.payload.id);
    const request = pending?.request;
    if (!pending || !request || pending.roomId !== room.id) throw new Error('Yêu cầu đổi ghế đã kết thúc.');
    if (msg.type === 'seat:cancel') {
      if (request.fromId !== playerId) throw new Error('Chỉ người gửi được hủy yêu cầu.');
      this._finish(pending, 'Yêu cầu đổi ghế đã hủy.');
      return;
    }
    if (request.toId !== playerId) throw new Error('Chỉ người nhận được trả lời.');
    if (Date.now() >= request.expiresAt || !msg.payload.accept) {
      this._finish(pending, Date.now() >= request.expiresAt ? 'Yêu cầu đổi ghế đã hết hạn.' : 'Yêu cầu đổi ghế bị từ chối.');
      return;
    }
    try {
      this._check(room, request.fromId, request.toId);
      if (room.getPlayerIndex(request.fromId) !== request.fromIndex) throw new Error('Người gửi đã chuyển ghế.');
      room.changeSeat(request.fromId, request.toIndex, request.toId);
    } catch (error) {
      this._finish(pending, error instanceof Error ? error.message : 'Không thể đổi ghế.');
      return;
    }
    const message = request.fromName + ' và ' + request.toName + ' đã đổi chỗ.';
    this._finish(pending, message);
    this.cancelFor(request.fromId, 'Người chơi đã đổi ghế.');
    this.cancelFor(request.toId, 'Người chơi đã đổi ghế.');
    return message;
  }

  private _choose(room: Room, playerId: string, index: number, expected: string | null): string | undefined {
    const player = room.getPlayer(playerId);
    if (!player || index < 0 || index >= room.maxPlayers) throw new Error('Ghế không hợp lệ.');
    const target = room.getPlayerByIndex(index);
    if ((target?.id ?? null) !== expected) throw new Error('Ghế đã có người hoặc vừa thay đổi.');
    this._check(room, playerId);
    if (!target) {
      room.changeSeat(playerId, index, null);
      this.cancelFor(playerId, 'Người chơi đã chuyển ghế.');
      return player.name + ' đã chuyển sang ghế ' + (index + 1) + '.';
    }
    if (player.spectator || target.id === playerId) throw new Error('Không thể đổi với ghế này.');
    this._check(room, target.id);
    const now = Date.now();
    if (now - (this._last.get(playerId) ?? -Infinity) < SEAT_CHANGE.cooldownMs) throw new Error('Hãy chờ trước khi gửi yêu cầu mới.');
    if ([...this._pending.values()].some(item => item.request.toId === target.id)) throw new Error(target.name + ' đang bận trả lời yêu cầu khác.');
    for (const item of this._pending.values()) {
      if (item.request.fromId === playerId) this._finish(item, 'Yêu cầu đổi ghế trước đã hủy.');
    }
    const request: SeatRequest = { id: IdGenerator.generate(), fromId: playerId, toId: target.id,
      fromName: player.name, toName: target.name, fromIndex: room.getPlayerIndex(playerId), toIndex: index,
      expiresAt: now + SEAT_CHANGE.requestMs };
    const timer = setTimeout(() => this._finish(pending, 'Yêu cầu đổi ghế đã hết hạn.'), SEAT_CHANGE.requestMs);
    timer.unref();
    const pending: Pending = { request, timer, roomId: room.id };
    this._pending.set(request.id, pending);
    this._last.set(playerId, now);
    for (const id of [playerId, target.id]) this._send(id, { type: 'seat:request', payload: request });
  }
}
