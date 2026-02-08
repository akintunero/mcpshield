import { describe, it, expect } from 'vitest';
import {
  FindingSchema,
  FindingCatalogEntrySchema,
  ScanResultSchema,
  SecurityScoreSchema,
  ApprovalSchema,
  compareSeverity,
  SEVERITY_WEIGHT,
  MCP_TOOL_NAMES,
  HealthOutputSchema,
} from './index.js';

describe('severity helpers', () => {
  it('orders critical before low', () => {
    expect(compareSeverity('critical', 'low')).toBeLessThan(0);
    expect(compareSeverity('low', 'critical')).toBeGreaterThan(0);
    expect(compareSeverity('high', 'high')).toBe(0);
  });

  it('weights critical highest', () => {
    expect(SEVERITY_WEIGHT.critical).toBeGreaterThan(SEVERITY_WEIGHT.high);
    expect(SEVERITY_WEIGHT.high).toBeGreaterThan(SEVERITY_WEIGHT.medium);
    expect(SEVERITY_WEIGHT.medium).toBeGreaterThan(SEVERITY_WEIGHT.low);
  });
});

describe('catalog entry schema', () => {
  it('accepts a well-formed entry and enforces the id pattern', () => {
    const entry = {
      id: 'MCPS-S3-001',
      title: 'Public S3 Bucket',
      severity: 'critical',
      service: 's3',
      category: 'Data Protection',
      description: 'Bucket is publicly accessible.',
      businessImpact: 'Data exposure and compliance breach.',
      technicalImpact: 'Anonymous read of objects.',
      attackScenario: 'Attacker enumerates and downloads objects.',
      bestPractice: 'Block public access at the account and bucket level.',
      mitre: [
        { tactic: 'Collection', techniqueId: 'T1530', techniqueName: 'Data from Cloud Storage' },
      ],
      cis: [
        {
          benchmark: 'CIS AWS Foundations Benchmark v3.0',
          controlId: '2.1.5',
          title: 'Block public access',
        },
      ],
      baseRiskScore: 95,
      remediation: { terraform: 'resource ...', awsCli: 'aws s3api ...' },
    };
    const parsed = FindingCatalogEntrySchema.parse(entry);
    expect(parsed.references).toEqual([]);
    expect(() => FindingCatalogEntrySchema.parse({ ...entry, id: 'bad-id' })).toThrow();
  });
});

describe('finding + scan schemas', () => {
  it('round-trips a scan result', () => {
    const finding = {
      findingId: 'MCPS-S3-001:my-bucket',
      catalogId: 'MCPS-S3-001',
      title: 'Public S3 Bucket',
      severity: 'critical',
      service: 's3',
      resource: { service: 's3', type: 'bucket', id: 'my-bucket' },
      description: 'Bucket is public.',
      riskScore: 95,
      detectedAt: new Date().toISOString(),
    };
    const parsedFinding = FindingSchema.parse(finding);
    expect(parsedFinding.status).toBe('open');

    const scan = ScanResultSchema.parse({
      scanId: 'scan-1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      endpoint: 'http://localhost:4566',
      region: 'us-east-1',
      resourcesScanned: 1,
      resourceCounts: { s3: 1 },
      findings: [finding],
    });
    expect(scan.findings).toHaveLength(1);
  });
});

describe('score + approval schemas', () => {
  it('validates a score', () => {
    const score = SecurityScoreSchema.parse({
      score: 62,
      grade: 'D',
      totalFindings: 9,
      breakdown: { critical: 2, high: 3, medium: 3, low: 1 },
      computedAt: new Date().toISOString(),
    });
    expect(score.score).toBe(62);
  });

  it('defaults approval status to pending', () => {
    const approval = ApprovalSchema.parse({
      approvalId: 'apr-1',
      findingIds: ['MCPS-S3-001:my-bucket'],
      requestedBy: 'U123',
      createdAt: new Date().toISOString(),
    });
    expect(approval.status).toBe('pending');
  });
});

describe('mcp contract', () => {
  it('exposes 11 tools', () => {
    expect(MCP_TOOL_NAMES).toHaveLength(11);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(11);
  });

  it('validates a health payload', () => {
    const health = HealthOutputSchema.parse({
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: 12,
      cloudProvider: { reachable: true, endpoint: 'http://localhost:4566', region: 'us-east-1' },
    });
    expect(health.cloudProvider.services).toEqual({});
  });
});
