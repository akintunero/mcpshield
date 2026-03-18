import { describe, it, expect, vi } from 'vitest';
import { generateTerraformFix, renderTemplate } from './generator.js';

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

describe('generateTerraformFix', () => {
  it('generates terraform HCL for the finding', () => {
    const result = generateTerraformFix(mockFinding);
    expect(result.kind).toBe('terraform');
    expect(result.findingId).toBe(mockFinding.findingId);
    expect(result.content).toContain('vulnerable-bucket');
    expect(result.content).toContain('aws_s3_bucket_public_access_block');
  });

  it('includes endpoint in rendered output', () => {
    const result = generateTerraformFix(mockFinding);
    expect(result.content).not.toContain('{{endpoint}}');
  });
});

describe('renderTemplate', () => {
  it('replaces S3 bucket placeholder', () => {
    const template = 'bucket = "{{bucket}}"';
    const result = renderTemplate(template, mockFinding);
    expect(result).toBe('bucket = "vulnerable-bucket"');
  });

  it('replaces resource ID placeholder', () => {
    const template = 'resource_id = "{{resourceId}}"';
    const result = renderTemplate(template, mockFinding);
    expect(result).toContain('vulnerable_bucket');
  });
});
