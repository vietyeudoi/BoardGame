/**
 * MessageValidator.ts — Validates ALL incoming client messages
 * Per PROJECT_RULES.md Section D: Never trust client data.
 */
import { BASE_CARD_PACKS, CARD_PACKS, CARD_PACK_BY_ID, getEditableCardLimit, MAX_EXPANSION_CARD_COUNT, MAX_SETUP_CARD_COUNT } from '../../../shared/constants/cardTypes.js';
import type { CardType, CardPackId } from '../../../shared/types/gameObjects.js';
import type { ClientToServerMessage } from '../../../shared/types/protocol.js';

// Giới hạn theo bộ bài thiết lập lớn nhất có thể tạo.

const MAX_DECK_VIEW_ORDER = Math.max(...BASE_CARD_PACKS.map(pack => pack.cards.reduce((sum, card) =>
  sum + (getEditableCardLimit(card.type) ?? card.count * 2), 0)))
  + CARD_PACKS.reduce((sum, pack) => sum + (pack.kind === 'expansion' ? pack.cards.length * MAX_EXPANSION_CARD_COUNT : 0), 0);

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Validates that a value is a finite number within [min, max]. */
function isFiniteInRange(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** Validates that a value is a non-negative safe integer. */
function isNonNegativeInteger(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Validates that a string is non-empty after trimming. */
function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export const MessageValidator = {
  validate(raw: unknown): ValidationResult<ClientToServerMessage> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { success: false, error: 'Message must be a non-null object' };
    }

    const msg = raw as Record<string, unknown>;

    if (typeof msg['type'] !== 'string') {
      return { success: false, error: 'Message must have a string "type" field' };
    }

    const type = msg['type'];

    switch (type) {
      case 'room:create': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || typeof p['roomName'] !== 'string' || p['roomName'].trim().length === 0) {
          return { success: false, error: 'room:create requires non-empty "roomName"' };
        }
        if (p['password'] !== undefined && typeof p['password'] !== 'string') {
          return { success: false, error: 'room:create "password" must be a string if provided' };
        }

        if (p['playerName'] !== undefined && !isNonEmptyString(p['playerName'])) {
          return { success: false, error: 'room:create invalid playerName' };
        }
        if (p['doubleDeck'] !== undefined && typeof p['doubleDeck'] !== 'boolean') {
          return { success: false, error: 'room:create "doubleDeck" must be a boolean if provided' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      case 'room:join': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (
          !p ||
          typeof p['roomId'] !== 'string' || p['roomId'].trim().length === 0 ||
          typeof p['playerName'] !== 'string' || p['playerName'].trim().length === 0
        ) {
          return { success: false, error: 'room:join requires non-empty "roomId" and "playerName"' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }


      case 'room:resume': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!isNonEmptyString(p?.['roomId']) || !isNonEmptyString(p?.['playerId']) || !isNonEmptyString(p?.['token'])) {
          return { success: false, error: 'room:resume: missing credentials' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }


      case 'round:configure': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        const isCount = (value: unknown) => isNonNegativeInteger(value) && Number(value) <= MAX_SETUP_CARD_COUNT;
        if (!isCount(p?.['explodingKittens']) || !isCount(p?.['defuses'])) {
          return { success: false, error: 'Số lượng Mèo Nổ hoặc Gỡ Bom không hợp lệ.' };
        }

        const basePackId = p?.['basePackId'];
        if (basePackId !== undefined && !BASE_CARD_PACKS.some(pack => pack.id === basePackId)) {
          return { success: false, error: 'Bộ gốc được chọn không hợp lệ.' };
        }
        const packs = p?.['enabledPacks'];
        if (packs !== undefined && (!Array.isArray(packs) || new Set(packs).size !== packs.length
          || !packs.every(id => typeof id === 'string' && CARD_PACK_BY_ID.has(id as CardPackId)))) {
          return { success: false, error: 'Danh sách bộ bài không hợp lệ.' };
        }
        const counts = p?.['cardCounts'];
        if (counts !== undefined && (!counts || typeof counts !== 'object' || Array.isArray(counts)
          || !Object.entries(counts).every(([id, value]) => {
            const limit = getEditableCardLimit(id as CardType);
            return limit !== undefined && isNonNegativeInteger(value) && Number(value) <= limit;
          }))) {
          return { success: false, error: 'Số lượng lá hoặc loại lá có thể chỉnh không hợp lệ.' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }


      case 'seat:choose':
      case 'seat:reply':
      case 'seat:cancel':
      case 'seat:busy': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        const valid = type === 'seat:choose' ? isNonNegativeInteger(p?.['index']) &&
          (p?.['expectedPlayerId'] === null || isNonEmptyString(p?.['expectedPlayerId']))
          : type === 'seat:busy' ? typeof p?.['active'] === 'boolean'
          : isNonEmptyString(p?.['id']) && (type === 'seat:cancel' || typeof p?.['accept'] === 'boolean');
        if (!valid) return { success: false, error: 'Thao tác ghế không hợp lệ.' };
        return { success: true, data: raw as ClientToServerMessage };
      }

      case 'round:deal':
      case 'round:reset':
      case 'room:leave':
      case 'ping':
      case 'card:draw':
        return { success: true, data: raw as ClientToServerMessage };


      case 'deck:set-draw-end': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (p?.['end'] !== 'TOP' && p?.['end'] !== 'BOTTOM') {
          return { success: false, error: 'deck:set-draw-end: invalid end' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }



      case 'table:roll': {
        const p = msg['payload'] as Record<string, unknown> | null | undefined;
        if (p?.['kind'] !== 'dice' && p?.['kind'] !== 'coin') return { success: false, error: 'table:roll: invalid kind' };
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'deck:view-open': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (p?.['mode'] !== 'see' && p?.['mode'] !== 'alter') return { success: false, error: 'deck:view-open: invalid mode' };
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'deck:view-order':
      case 'deck:view-close': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        const order = p?.['order'];
        const requiresOrder = type === 'deck:view-order' || order !== undefined;
        if (!isNonEmptyString(p?.['id']) || (requiresOrder && (!Array.isArray(order) || order.length > MAX_DECK_VIEW_ORDER
          || !order.every(token => Number.isSafeInteger(token) && token >= 0)))) {
          return { success: false, error: 'deck:view: invalid session or order' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'stack:form': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        const ids = p?.['cardIds'];
        if (!Array.isArray(ids) || ids.length < 2 || ids.length > MAX_DECK_VIEW_ORDER || !ids.every(isNonEmptyString)) {
          return { success: false, error: 'Danh sách lá để xếp chồng không hợp lệ.' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'stack:shuffle': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!isNonEmptyString(p?.['anchorId'])) return { success: false, error: 'Chồng bài không hợp lệ.' };
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'hand:shuffle':
      case 'deck:gather-bombs':
      case 'deck:shuffle':
        return { success: true, data: raw as ClientToServerMessage };
      case 'deck:set-affected-count': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!Number.isSafeInteger(p?.['count'])) return { success: false, error: 'deck:set-affected-count: invalid count' };
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'deck:insert': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        const ids = p?.['cardIds'];
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 30 || !ids.every(isNonEmptyString)
          || (p?.['dragId'] !== undefined && !isNonNegativeInteger(p['dragId']))
          || (p?.['cardsAbove'] !== undefined && !isNonNegativeInteger(p['cardsAbove']))) {
          return { success: false, error: 'deck:insert: invalid cards or position' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'deck:take': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (p !== undefined && (typeof p?.['cardsAbove'] !== 'number'
          || !Number.isSafeInteger(p['cardsAbove']) || p['cardsAbove'] < 0)) {
          return { success: false, error: 'deck:take: invalid cardsAbove' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      case 'card:play-to-table': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || typeof p['cardId'] !== 'string') {
          return { success: false, error: 'card:play-to-table requires string "cardId"' };
        }
        const pos = p['position'] as Record<string, unknown> | undefined;
        if (!pos || typeof pos['x'] !== 'number' || typeof pos['y'] !== 'number' || typeof pos['z'] !== 'number') {
          return { success: false, error: 'card:play-to-table requires "position" with x, y, z numbers' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      // ── M1.5.4: card:transfer validation ───────────────────────────────
      case 'card:transfer': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonEmptyString(p['cardId'])) {
          return { success: false, error: 'card:transfer requires non-empty string "cardId"' };
        }
        if (p['targetPlayerIndex'] === undefined && p['targetPlayerId'] === undefined) {
          return { success: false, error: 'card:transfer requires targetPlayerIndex or targetPlayerId' };
        }
        if (p['targetPlayerIndex'] !== undefined && !isNonNegativeInteger(p['targetPlayerIndex'])) {
          return { success: false, error: 'card:transfer: targetPlayerIndex must be a non-negative integer' };
        }
        if (p['dragId'] !== undefined && !isNonNegativeInteger(p['dragId'])) {
          return { success: false, error: 'card:transfer: invalid dragId' };
        }
        if (p['targetPlayerId'] !== undefined && !isNonEmptyString(p['targetPlayerId'])) {
          return { success: false, error: 'card:transfer: targetPlayerId must be a non-empty string' };
        }
        if (p['seq'] !== undefined && !isNonNegativeInteger(p['seq'])) {
          return { success: false, error: 'card:transfer: seq must be a non-negative integer if provided' };
        }
        if (p['handIndex'] !== undefined && !isNonNegativeInteger(p['handIndex'])) {
          return { success: false, error: 'card:transfer: handIndex must be a non-negative integer if provided' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      case 'object:move': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonEmptyString(p['objectId'])) {
          return { success: false, error: 'object:move requires string "objectId"' };
        }
        // M1.7.5 Part 3: rotation sync carries the full authoritative transform.
        const pos = p['position'] as Record<string, unknown> | undefined;
        if (!pos || typeof pos !== 'object') {
          return { success: false, error: 'object:move requires object "position"' };
        }
        if (!isFiniteInRange(pos['x'], -100, 100) ||
            !isFiniteInRange(pos['y'], -100, 100) ||
            !isFiniteInRange(pos['z'], -100, 100)) {
          return { success: false, error: 'object:move: position x, y, z must be finite numbers in [-100, 100]' };
        }
        if (!isFiniteInRange(p['rotation'], -1000, 1000)) {
          return { success: false, error: 'object:move: rotation must be a finite number' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      case 'object:flip':
      case 'object:grab':
      case 'object:release': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || typeof p['objectId'] !== 'string') {
          return { success: false, error: `${type} requires string "objectId"` };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      // ── M1.5.3: cursor:move validation ─────────────────────────────────
      case 'draw:hover': {
        const payload = msg['payload'] as Record<string, unknown> | undefined;
        if (typeof payload?.['hovering'] !== 'boolean') {
          return { success: false, error: 'draw:hover requires a boolean hovering value' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'cursor:move': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p) {
          return { success: false, error: 'cursor:move requires payload' };
        }
        if (!isFiniteInRange(p['x'], -50, 50)) {
          return { success: false, error: 'cursor:move: x must be a finite number in [-50, 50]' };
        }
        if (p['y'] !== undefined && !isFiniteInRange(p['y'], 0, 50)) {
          return { success: false, error: 'cursor:move: y must be a finite number in [0, 50]' };
        }
        if (!isFiniteInRange(p['z'], -50, 50)) {
          return { success: false, error: 'cursor:move: z must be a finite number in [-50, 50]' };
        }
        if (!isNonNegativeInteger(p['seq'])) {
          return { success: false, error: 'cursor:move: seq must be a non-negative integer' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      // ── M1.5.3: object:drag-start validation ────────────────────────────
      case 'object:drag-preview': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonNegativeInteger(p['dragId']) || (p['phase'] !== 'start' && p['phase'] !== 'move') ||
            !Array.isArray(p['cards']) || p['cards'].length < 1 || p['cards'].length > 30 ||
            !p['cards'].every((card: unknown) => {
              if (!card || typeof card !== 'object') return false;
              const c = card as Record<string, unknown>;
              return isNonEmptyString(c['objectId']) && isFiniteInRange(c['x'], -100, 100) &&
                isFiniteInRange(c['y'], 0, 5) && isFiniteInRange(c['z'], -100, 100) &&
                (c['rotation'] === undefined || isFiniteInRange(c['rotation'], -1000, 1000)) &&
                (c['faceUp'] === undefined || typeof c['faceUp'] === 'boolean');
            })) {
          return { success: false, error: 'object:drag-preview: invalid frame' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'object:drag-preview-stop': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonNegativeInteger(p['dragId'])) {
          return { success: false, error: 'object:drag-preview-stop: invalid dragId' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }
      case 'object:drag-start': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonEmptyString(p['objectId'])) {
          return { success: false, error: 'object:drag-start requires non-empty string "objectId"' };
        }
        if (!isFiniteInRange(p['x'], -100, 100) ||
            !isFiniteInRange(p['y'], -100, 100) ||
            !isFiniteInRange(p['z'], -100, 100)) {
          return { success: false, error: 'object:drag-start: x, y, z must be finite numbers in [-100, 100]' };
        }
        if (p['seq'] !== undefined && !isNonNegativeInteger(p['seq'])) {
          return { success: false, error: 'object:drag-start: seq must be a non-negative integer if provided' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      // ── M1.5.3: object:drag-move validation ─────────────────────────────
      case 'object:drag-move': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonEmptyString(p['objectId'])) {
          return { success: false, error: 'object:drag-move requires non-empty string "objectId"' };
        }
        if (!isFiniteInRange(p['x'], -100, 100) ||
            !isFiniteInRange(p['y'], -100, 100) ||
            !isFiniteInRange(p['z'], -100, 100)) {
          return { success: false, error: 'object:drag-move: x, y, z must be finite numbers in [-100, 100]' };
        }
        if (!isNonNegativeInteger(p['seq'])) {
          return { success: false, error: 'object:drag-move: seq must be a non-negative integer' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      // ── M1.5.3: object:drag-end validation ──────────────────────────────
      case 'object:drag-end': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p || !isNonEmptyString(p['objectId'])) {
          return { success: false, error: 'object:drag-end requires non-empty string "objectId"' };
        }
        if (!isFiniteInRange(p['x'], -100, 100) ||
            !isFiniteInRange(p['y'], -100, 100) ||
            !isFiniteInRange(p['z'], -100, 100)) {
          return { success: false, error: 'object:drag-end: x, y, z must be finite numbers in [-100, 100]' };
        }
        if (p['seq'] !== undefined && !isNonNegativeInteger(p['seq'])) {
          return { success: false, error: 'object:drag-end: seq must be a non-negative integer if provided' };
        }
        if (p['dragId'] !== undefined && !isNonNegativeInteger(p['dragId'])) {
          return { success: false, error: 'object:drag-end: invalid dragId' };
        }
        if (p['faceUp'] !== undefined && typeof p['faceUp'] !== 'boolean') {
          return { success: false, error: 'object:drag-end: faceUp must be a boolean if provided' };
        }
        if (p['targetPlayerIndex'] !== undefined && p['targetPlayerIndex'] !== null && !isNonNegativeInteger(p['targetPlayerIndex'])) {
          return { success: false, error: 'object:drag-end: targetPlayerIndex must be a non-negative integer or null' };
        }
        if (p['handIndex'] !== undefined && !isNonNegativeInteger(p['handIndex'])) {
          return { success: false, error: 'object:drag-end: handIndex must be a non-negative integer if provided' };
        }
        // M1.7.5 Part 2: optional seat-derived / manual table yaw (radians).
        if (p['rotation'] !== undefined && !isFiniteInRange(p['rotation'], -1000, 1000)) {
          return { success: false, error: 'object:drag-end: rotation must be a finite number if provided' };
        }
        return { success: true, data: raw as ClientToServerMessage };
      }

      default:
        return { success: false, error: `Unknown message type: "${type}"` };
    }
  },
};
