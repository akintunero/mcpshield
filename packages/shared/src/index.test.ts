import { describe, it, expect, vi } from 'vitest';
import {
  uuid,
  shortId,
  findingInstanceId,
  ok,
  err,
  tryCatch,
  retry,
  groupBy,
  clamp,
  round,
  assertNever,
} from './index.js';

describe('ids', () => {
  it('generates unique uuids', () => {
    expect(uuid()).not.toBe(uuid());
  });
  it('prefixes short ids', () => {
    expect(shortId('scan')).toMatch(/^scan_[0-9a-f]{8}$/);
  });
  it('builds finding instance ids', () => {
    expect(findingInstanceId('MCPS-S3-001', 'my-bucket')).toBe('MCPS-S3-001:my-bucket');
  });
});

describe('Result', () => {
  it('wraps success and failure', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
  it('captures thrown errors', async () => {
    const res = await tryCatch(async () => {
      throw new Error('boom');
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('boom');
  });
});

describe('retry', () => {
  it('retries until success', async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('transient');
        return 'done';
      },
      { retries: 5, baseDelayMs: 1, maxDelayMs: 2 },
    );
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('stops when shouldRetry returns false', async () => {
    const onRetry = vi.fn();
    await expect(
      retry(
        async () => {
          throw new Error('fatal');
        },
        { retries: 5, baseDelayMs: 1, shouldRetry: () => false, onRetry },
      ),
    ).rejects.toThrow('fatal');
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('groups by key', () => {
    const grouped = groupBy([{ s: 'a' }, { s: 'a' }, { s: 'b' }], (x) => x.s);
    expect(grouped.a).toHaveLength(2);
    expect(grouped.b).toHaveLength(1);
  });
  it('clamps and rounds', () => {
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(round(1.2345, 2)).toBe(1.23);
  });
  it('assertNever throws', () => {
    expect(() => assertNever('x' as never)).toThrow();
  });
});
