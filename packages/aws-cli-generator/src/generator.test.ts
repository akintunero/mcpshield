import { describe, it, expect, vi } from 'vitest';
import { generateAwsCliFix, renderTemplate } from './generator.js';

vi.mock('@mcpshield/config', () => ({
  getConfig: () => ({
    aws: {
      endpoint: 'http://localhost:4566',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  }),
}));

const mockFinding = {
  findingId: 'MCPS-S3-001:vulnerable-bucket',
  catalogId: 'MCPS-S3-001',
  title: 'Public S3 Bucket',
  severity: 'critical' as const,
  service: 's3' as const,
  resource: {
    service: 's3' as const,
    type: 'bucket' as const,
    id: 'vulnerable-bucket',
    region: 'us-east-1',
  },
  description: 'An S3 bucket allows public access.',
  evidence: { publicAccessBlockMissing: true },
  riskScore: 98,
  detectedAt: new Date().toISOString(),
  status: 'open' as const,
};

const iamFinding = {
  ...mockFinding,
  findingId: 'MCPS-IAM-002:vulnerable-user',
  catalogId: 'MCPS-IAM-002',
  service: 'iam' as const,
  resource: {
    service: 'iam' as const,
    type: 'user' as const,
    id: 'vulnerable-user',
    region: 'us-east-1',
  },
  evidence: { staleActiveKeys: [{ accessKeyId: 'AKIA1234567890EXAMPLE' }] },
};

describe('generateAwsCliFix', () => {
  it('generates AWS CLI command for the finding', () => {
    const result = generateAwsCliFix(mockFinding);
    expect(result.kind).toBe('aws-cli');
    expect(result.findingId).toBe(mockFinding.findingId);
    expect(result.content).toContain('vulnerable-bucket');
  });

  it('includes the endpoint in rendered output', () => {
    const result = generateAwsCliFix(mockFinding);
    expect(result.content).not.toContain('{{endpoint}}');
  });

  it('resolves access key ID from evidence', () => {
    const result = generateAwsCliFix(iamFinding);
    expect(result.content).toContain('AKIA1234567890EXAMPLE');
  });
});

describe('renderTemplate', () => {
  it('replaces IAM placeholders', () => {
    const template = '--user-name {{userName}} --access-key-id {{accessKeyId}}';
    const result = renderTemplate(template, iamFinding);
    expect(result).toContain('vulnerable-user');
    expect(result).toContain('AKIA1234567890EXAMPLE');
  });
});
