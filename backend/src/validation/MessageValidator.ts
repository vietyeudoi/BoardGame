/**
 * MessageValidator.ts — Validates ALL incoming client messages
 * Per PROJECT_RULES.md Section D: Never trust client data.
 */
import type { ClientToServerMessage } from '../../../shared/types/protocol.js';

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
        const maxPlayers = p['maxPlayers'];
        if (maxPlayers !== undefined &&
          (typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 8)) {
          return { success: false, error: 'room:create "maxPlayers" must be an integer from 2 to 8' };
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

      case 'room:leave':
      case 'ping':
      case 'card:draw':
        return { success: true, data: raw as ClientToServerMessage };

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
      case 'cursor:move': {
        const p = msg['payload'] as Record<string, unknown> | undefined;
        if (!p) {
          return { success: false, error: 'cursor:move requires payload' };
        }
        if (!isFiniteInRange(p['x'], -50, 50)) {
          return { success: false, error: 'cursor:move: x must be a finite number in [-50, 50]' };
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
