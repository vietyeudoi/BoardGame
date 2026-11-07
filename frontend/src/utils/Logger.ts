/**
 * Logger.ts — Frontend Logger
 * Structured logging with context. Never logs private data.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IS_DEV = (import.meta as any).env?.DEV ?? false;

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

class ContextLogger implements ILogger {
  constructor(private readonly _context: string) {}

  debug(message: string, context?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    console.debug(`[${this._context}] ${message}`, context ?? '');
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.info(`[${this._context}] ${message}`, context ?? '');
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[${this._context}] ${message}`, context ?? '');
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(`[${this._context}] ${message}`, context ?? '');
  }
}

export const Logger = {
  create(context: string): ILogger {
    return new ContextLogger(context);
  },
};

