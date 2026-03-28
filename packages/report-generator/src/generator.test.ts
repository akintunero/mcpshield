import { describe, it, expect } from 'vitest';
import { generateReport } from './generator.js';
import type { Finding } from '@mcpshield/types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: 'test-001',
    catalogId: 'MCPS-S3-001',
    title: 'Public S3 Bucket',
    severity: 'critical',
    service: 's3',
    resource: { service: 's3', type: 'bucket', id: 'vulnerable-bucket', region: 'us-east-1' },
    description: 'A test finding',
    evidence: {},
    riskScore: 98,
    detectedAt: new Date().toISOString(),
    status: 'open',
    ...overrides,
  };
}

describe('generateReport', () => {
  const baseInput = {
    scanId: 'scan-001',
    endpoint: 'http://localhost:4566',
    region: 'us-east-1',
    resourcesScanned: 15,
    score: {
      score: 60,
      grade: 'D' as const,
      totalFindings: 2,
      breakdown: { critical: 1, high: 0, medium: 0, low: 1 },
      computedAt: '',
      delta: undefined,
    },
    allFindings: [
      makeFinding({ severity: 'critical', riskScore: 98 }),
      makeFinding({
        findingId: 'test-002',
        catalogId: 'MCPS-TAG-001',
        title: 'Missing Tags',
        severity: 'low',
        riskScore: 20,
      }),
    ],
  };

  it('generates report with correct structure', () => {
    const report = generateReport(baseInput);
    expect(report.reportId).toBeDefined();
    expect(report.scanId).toBe('scan-001');
    expect(report.score.grade).toBe('D');
    expect(report.executiveSummary).toBeTruthy();
    expect(report.topRisks).toHaveLength(2);
  });

  it('ranks top risks by risk score descending', () => {
    const report = generateReport(baseInput);
    expect(report.topRisks[0]!.riskScore).toBeGreaterThanOrEqual(report.topRisks[1]!.riskScore);
  });

  it('includes recommendations', () => {
    const report = generateReport(baseInput);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('generates markdown output', () => {
    const report = generateReport(baseInput);
    expect(report.markdown).toContain('# MCPShield Security Posture Assessment');
    expect(report.markdown).toContain('vulnerable-bucket');
  });

  it('handles empty findings gracefully', () => {
    const report = generateReport({
      ...baseInput,
      allFindings: [],
      score: {
        ...baseInput.score,
        totalFindings: 0,
        score: 100,
        grade: 'A' as const,
        breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
      },
    });
    expect(report.topRisks).toHaveLength(0);
    expect(report.markdown).toContain('Grade');
  });
});
