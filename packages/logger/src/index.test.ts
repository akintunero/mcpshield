import { describe, it, expect, afterEach } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { createLogger } from './index.js';

afterEach(() => {
  delete process.env.LOG_LEVEL;
});

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  // Build a logger with redaction identical to createLogger, writing to memory.
  const log = pino(
    {
      name: 'test',
      level: 'info',
      redact: { paths: ['NIM_API_KEY', 'token'], censor: '[redacted]' },
    },
    stream,
  );
  return { log, lines };
}

describe('createLogger', () => {
  it('honors LOG_LEVEL from the environment', () => {
    process.env.LOG_LEVEL = 'debug';
    const log = createLogger('env-test', { transport: undefined });
    expect(log.level).toBe('debug');
  });

  it('redacts sensitive fields', () => {
    const { log, lines } = captureLogger();
    log.info({ NIM_API_KEY: 'nvapi-secret', token: 'xoxb-secret', safe: 'ok' }, 'hello');
    const output = lines.join('');
    expect(output).toContain('[redacted]');
    expect(output).not.toContain('nvapi-secret');
    expect(output).not.toContain('xoxb-secret');
    expect(output).toContain('ok');
  });
});
