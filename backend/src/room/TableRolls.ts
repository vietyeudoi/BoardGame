import { randomInt, randomUUID } from 'node:crypto';
import { getDefaultSeatPlacement } from '../../../shared/constants/config.js';
import { TABLE_ROLL, type DieFace, type TableRoll, type TableRollKind, type TableRollOutcome } from '../../../shared/types/tableRoll.js';

export function rollTableItem(kind: TableRollKind): TableRollOutcome {
  return kind === 'dice'
    ? { kind, result: randomInt(1, 7) as DieFace }
    : { kind, result: randomInt(2) === 0 ? 'heads' : 'tails' };
}

type Roller = Pick<TableRoll, 'playerId' | 'playerName' | 'seat'>;
type Point = Pick<TableRoll, 'x' | 'z'>;
const ROLL_LIFETIME = TABLE_ROLL.animationMs + TABLE_ROLL.holdMs + TABLE_ROLL.fadeMs;
const CLEARANCE = 2.25;

export class TableRolls {
  private readonly _visible = new Map<string, TableRoll>();

  start(kind: TableRollKind, player: Roller, obstacles: readonly Point[], now: number): TableRoll {
    for (const [id, roll] of this._visible) {
      if (now - roll.startedAt >= ROLL_LIFETIME) this._visible.delete(id);
    }
    const previous = this._visible.get(player.playerId);
    if (previous && now - previous.startedAt < TABLE_ROLL.cooldownMs) {
      throw new Error('Chờ một chút trước khi tung tiếp.');
    }

    let replaced = previous;
    if (!replaced && this._visible.size >= TABLE_ROLL.maxVisible) {
      // Nhường chỗ cho lượt mới bằng cách thu sớm một kết quả đã dừng.
      replaced = [...this._visible.values()].find(roll => now - roll.startedAt >= TABLE_ROLL.cooldownMs);
      if (!replaced) throw new Error('Bàn đang có nhiều lượt tung. Hãy thử lại sau.');
    }

    const seat = getDefaultSeatPlacement(player.seat);
    const { rotationY: yaw } = seat;
    const occupied = [...obstacles, ...[...this._visible.values()].filter(roll => roll !== replaced)];
    // Chừa vùng giữa cho chồng bốc, thử các ô phía trong và hai bên ghế.
    let position: Point | undefined;
    for (const radius of [5.2, 6.1, 4.3, 7.1, 7.8]) {
      for (const offset of [0, -0.85, 0.85]) {
        const x = radius * Math.sin(yaw) + offset * Math.cos(yaw);
        const z = radius * Math.cos(yaw) - offset * Math.sin(yaw);
        if (occupied.every(point => Math.hypot(point.x - x, point.z - z) >= CLEARANCE)) {
          position = { x, z };
          break;
        }
      }
      if (position) break;
    }
    if (!position) throw new Error('Không còn chỗ trống trước ghế để tung.');

    const roll: TableRoll = {
      ...rollTableItem(kind), ...player, ...position, id: randomUUID(), startedAt: now,
      ...(replaced && { replacesId: replaced.id }),
    };
    if (replaced) this._visible.delete(replaced.playerId);
    this._visible.set(player.playerId, roll);
    return roll;
  }

  inProgress(now: number): TableRoll[] {
    return [...this._visible.values()].filter(roll => now - roll.startedAt < TABLE_ROLL.animationMs);
  }
}
