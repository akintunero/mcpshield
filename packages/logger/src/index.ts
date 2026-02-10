import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';

export type { Logger } from 'pino';

/** Log levels supported by the logger. */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

/** Keys whose values are always redacted from logs. */
const REDACT_PATHS = [
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'SLACK_SIGNING_SECRET',
  'NIM_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'apiKey',
  'token',
  'authorization',
  'password',
  '*.apiKey',
  '*.token',
  '*.authorization',
  '*.password',
  'headers.authorization',
];

function resolveLevel(explicit?: LogLevel): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  return explicit ?? fromEnv ?? 'info';
}

/**
 * Create a namespaced logger. In development it pretty-prints when `pino-pretty`
 * is available; otherwise it emits structured JSON (production default).
 */
export function createLogger(name: string, options: Partial<LoggerOptions> = {}): Logger {
  const level = resolveLevel(options.level as LogLevel | undefined);
  const isProd = process.env.NODE_ENV === 'production';

  const base: LoggerOptions = {
    name,
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[redacted]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
  };

  // Pretty printing is opt-in (MCPSHIELD_LOG_PRETTY=true) to keep production and
  // CI output as structured JSON and avoid transport worker overhead.
  if (!isProd && process.env.MCPSHIELD_LOG_PRETTY === 'true') {
    try {
      const transport = pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      });
      return pino(base, transport);
    } catch {
      // pino-pretty not installed — fall back to JSON.
    }
  }

  return pino(base);
}

/** A shared root logger for quick use; prefer `createLogger(name)` per module. */
export const logger = createLogger('mcpshield');
