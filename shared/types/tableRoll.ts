// Cấu hình dùng chung để thời lượng hiển thị và giới hạn trên server khớp nhau.
export const TABLE_ROLL = {
  animationMs: 1250,
  cooldownMs: 1500,
  holdMs: 3000,
  fadeMs: 400,
  maxVisible: 10,
  blockDuringOwnDeckView: true,
} as const;

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export type CoinFace = 'heads' | 'tails';
export type TableRollOutcome = { kind: 'dice'; result: DieFace } | { kind: 'coin'; result: CoinFace };
export type TableRollKind = TableRollOutcome['kind'];

export type TableRoll = TableRollOutcome & {
  id: string;
  playerId: string;
  playerName: string;
  seat: number;
  x: number;
  z: number;
  startedAt: number;
  replacesId?: string;
};

export interface TableRollEvent {
  roll: TableRoll;
  sentAt: number;
}

export function tableRollLabel(roll: TableRollOutcome): string {
  if (roll.kind === 'dice') return String(roll.result);
  return roll.result === 'heads' ? 'Ngửa' : 'Sấp';
}
