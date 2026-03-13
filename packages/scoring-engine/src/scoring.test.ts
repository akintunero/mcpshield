import { describe, it, expect } from 'vitest';
import { computeSecurityScore } from './scoring.js';
import type { Finding } from '@mcpshield/types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: 'test-001',
    catalogId: 'MCPS-S3-001',
    title: 'Test Finding',
    severity: 'high',
    service: 's3',
    resource: { service: 's3', type: 'bucket', id: 'test-bucket', region: 'us-east-1' },
    description: 'A test finding',
    evidence: {},
    riskScore: 50,
    detectedAt: new Date().toISOString(),
    status: 'open',
    ...overrides,
  };
}

describe('computeSecurityScore', () => {
  it('returns 100 with grade A when no findings exist', () => {
    const result = computeSecurityScore([]);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.totalFindings).toBe(0);
  });

  it('deducts points for open findings', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'high', findingId: 'test-002', catalogId: 'MCPS-EC2-001' }),
    ];
    const result = computeSecurityScore(findings);
    expect(result.score).toBeLessThan(100);
    expect(result.breakdown.critical).toBe(1);
    expect(result.breakdown.high).toBe(1);
  });

  it('ignores resolved findings', () => {
    const findings = [makeFinding({ severity: 'critical', status: 'resolved' })];
    const result = computeSecurityScore(findings);
    expect(result.score).toBe(100);
    expect(result.totalFindings).toBe(0);
  });

  it('returns grade F at score 0', () => {
    const criticals = Array.from({ length: 5 }, (_, i) =>
      makeFinding({ severity: 'critical', findingId: `test-${i}`, catalogId: `MCPS-S3-00${i}` }),
    );
    const result = computeSecurityScore(criticals);
    expect(result.grade).toBe('F');
    expect(result.score).toBe(0);
  });

  it('computes delta when previous score is provided', () => {
    const prev = {
      score: 50,
      grade: 'F' as const,
      totalFindings: 5,
      breakdown: { critical: 2, high: 2, medium: 1, low: 0 },
      computedAt: '',
      delta: undefined,
    };
    const findings = [makeFinding({ severity: 'medium' })];
    const result = computeSecurityScore(findings, prev);
    expect(result.delta).toBe(46);
  });
});
