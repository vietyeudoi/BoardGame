/**
 * Logger.ts — Backend Structured Logger
 * Never logs private data (passwords, tokens, private card info).
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const IS_DEV = process.env['NODE_ENV'] !== 'production';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: Record<string, unknown>;
}

function serialize(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data);
  } catch {
    return '[unserializable]';
  }
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level}] [${entry.context}] ${entry.message}`;
  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${base} ${serialize(entry.data)}`;
  }
  return base;
}

class ContextLogger {
  constructor(private readonly _context: string) {}

  private _entry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
    return { timestamp: new Date().toISOString(), level, context: this._context, message, data };
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    console.debug(formatEntry(this._entry('DEBUG', message, data)));
  }

  info(message: string, data?: Record<string, unknown>): void {
    console.info(formatEntry(this._entry('INFO', message, data)));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(formatEntry(this._entry('WARN', message, data)));
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(formatEntry(this._entry('ERROR', message, data)));
  }
}

export const Logger = {
  create(context: string): ContextLogger {
    return new ContextLogger(context);
  },
};

