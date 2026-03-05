import { describe, it, expect } from 'vitest';
import { runSecurityEngine } from './engine.js';
import type { ResourceSnapshot } from '@mcpshield/types';

function makeSnapshot(overrides: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return {
    service: 's3',
    type: 'bucket',
    id: 'test-bucket',
    arn: 'arn:aws:s3:::test-bucket',
    region: 'us-east-1',
    attributes: {},
    tags: {},
    ...overrides,
  };
}

describe('runSecurityEngine', () => {
  it('returns empty array for compliant snapshots', () => {
    const snapshot = makeSnapshot({
      attributes: {
        publicAccessBlock: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
        encryption: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
        versioning: { Status: 'Enabled' },
      },
      tags: { Owner: 'security', Environment: 'workshop', DataClassification: 'internal' },
    });
    const findings = runSecurityEngine([snapshot]);
    const publicBucketFindings = findings.filter((f) => f.catalogId === 'MCPS-S3-001');
    expect(publicBucketFindings).toHaveLength(0);
  });

  it('detects public S3 bucket', () => {
    const snapshot = makeSnapshot({
      attributes: {
        publicAccessBlock: null,
        acl: {
          grants: [
            {
              Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' },
              Permission: 'READ',
            },
          ],
        },
      },
    });
    const findings = runSecurityEngine([snapshot]);
    const s3Findings = findings.filter((f) => f.catalogId === 'MCPS-S3-001');
    expect(s3Findings.length).toBeGreaterThan(0);
    expect(s3Findings[0]!.severity).toBe('critical');
    expect(s3Findings[0]!.resource.id).toBe('test-bucket');
  });

  it('detects AdministratorAccess on IAM user', () => {
    const snapshot = makeSnapshot({
      service: 'iam',
      type: 'user',
      id: 'admin-user',
      attributes: {
        attachedPolicies: [
          {
            PolicyName: 'AdministratorAccess',
            PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
          },
        ],
        accessKeys: [],
      },
    });
    const findings = runSecurityEngine([snapshot]);
    const adminFindings = findings.filter((f) => f.catalogId === 'MCPS-IAM-001');
    expect(adminFindings.length).toBeGreaterThan(0);
  });

  it('detects SSH open to internet', () => {
    const snapshot = makeSnapshot({
      service: 'ec2',
      type: 'security-group',
      id: 'sg-123',
      attributes: {
        ipPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 22,
            ToPort: 22,
            IpRanges: [{ CidrIp: '0.0.0.0/0' }],
          },
        ],
        ipPermissionsEgress: [],
      },
    });
    const findings = runSecurityEngine([snapshot]);
    const sshFindings = findings.filter((f) => f.catalogId === 'MCPS-EC2-001');
    expect(sshFindings.length).toBeGreaterThan(0);
  });

  it('generates stable finding IDs across runs', () => {
    const snapshot = makeSnapshot({
      attributes: { publicAccessBlock: null },
    });
    const first = runSecurityEngine([snapshot]);
    const second = runSecurityEngine([snapshot]);
    expect(first[0]!.findingId).toBe(second[0]!.findingId);
  });
});
