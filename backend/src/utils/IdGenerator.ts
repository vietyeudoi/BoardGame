/**
 * IdGenerator.ts — UUID and short ID generation
 */
import { randomUUID } from 'crypto';

export const IdGenerator = {
  generate(): string {
    return randomUUID();
  },

  generateShort(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  },
};

