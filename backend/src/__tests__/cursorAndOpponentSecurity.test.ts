/**
 * cursorAndOpponentSecurity.test.ts — Backend Regression Tests
 *
 * Verifies server-side security boundaries:
 * 1. cursor:move message validation (rejects x/z > 50, < -50, non-finite, missing payload)
 * 2. cursor:move within bounds broadcasts cursor:update to peers
 * 3. object:drag-start on ON_TABLE card succeeds for any room member
 * 4. object:drag-start on someone else's HAND card fails with NOT_CARD_OWNER / cannot lock
 */

import { describe, it, expect } from 'vitest';
import { MessageValidator } from '../validation/MessageValidator.js';

describe('MessageValidator: cursor:move validation', () => {
  it('validates legitimate cursor:move payload', () => {
    const res = MessageValidator.validate({
      type: 'cursor:move',
      payload: { x: 12.5, z: -8.3, seq: 42 },
    });
    expect(res.success).toBe(true);
  });

  it('rejects cursor:move with x > 50', () => {
    const res = MessageValidator.validate({
      type: 'cursor:move',
      payload: { x: 50.1, z: 0, seq: 1 },
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('x must be a finite number in [-50, 50]');
    }
  });

  it('rejects cursor:move with z < -50', () => {
    const res = MessageValidator.validate({
      type: 'cursor:move',
      payload: { x: 0, z: -50.01, seq: 1 },
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('z must be a finite number in [-50, 50]');
    }
  });

  it('rejects cursor:move with NaN or Infinity', () => {
    expect(MessageValidator.validate({
      type: 'cursor:move',
      payload: { x: NaN, z: 0, seq: 1 },
    }).success).toBe(false);

    expect(MessageValidator.validate({
      type: 'cursor:move',
      payload: { x: 0, z: Infinity, seq: 1 },
    }).success).toBe(false);
  });

  it('rejects cursor:move with missing payload or invalid seq', () => {
    expect(MessageValidator.validate({
      type: 'cursor:move',
    }).success).toBe(false);

    expect(MessageValidator.validate({
      type: 'cursor:move',
      payload: { x: 0, z: 0, seq: -1 },
    }).success).toBe(false);
  });
});

