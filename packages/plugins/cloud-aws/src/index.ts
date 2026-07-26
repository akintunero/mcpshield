import type { CreatedPlugin } from '@mcpshield/plugin-sdk';
import { createPlugin } from '@mcpshield/plugin-sdk';
import { scanEnvironment, executeRemediationAction, verifyFinding, s3Client } from '@mcpshield/aws-tools';
import { runSecurityEngine } from '@mcpshield/security-engine';
import { getConfig } from '@mcpshield/config';
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { mapFindingToRemediation } from './remediation-mapper.js';

const _plugin: CreatedPlugin = createPlugin({
  apiVersion: 'v1',
  id: 'cloud-aws',
  name: 'AWS Cloud',
  version: '1.0.0',
  category: 'cloud',
  capabilities: ['discover', 'scan', 'verify', 'remediate'],

  async health(ctx) {
    try {
      await s3Client.send(new ListBucketsCommand({}));
      return { reachable: true, identity: 's3:active', location: getConfig().aws.region };
    } catch (e: any) {
      return { reachable: false, message: e.message };
    }
  },

  async discover(ctx) {
    const snapshots = await scanEnvironment();
    return snapshots.map((r: any) => ({
      provider: 'aws',
      service: r.service,
      type: r.type,
      id: r.id,
      nativeRef: r.arn,
      location: r.region,
      attributes: r.attributes,
      tags: r.tags,
    }));
  },

  async scan(ctx) {
    const snapshots = await scanEnvironment();
    const findings = runSecurityEngine(snapshots);
    return findings.map((f: any) => ({
      id: `cloud-aws/${f.catalogId}/${f.resource.id}`,
      title: f.title,
      description: f.description,
      severity: f.severity,
      resource: {
        type: f.resource.type,
        id: f.resource.id,
        location: f.resource.region,
      },
      remediation: {
        summary: `Fix ${f.catalogId} on ${f.resource.id}`,
      },
      evidence: f.evidence,
      riskScore: f.riskScore,
    }));
  },

  async verify(ctx, catalogId, resourceId) {
    const result = await verifyFinding(catalogId, resourceId);
    if (!result) {
      return { verified: false, details: { error: 'No verifier' } };
    }
    return {
      verified: result.verified,
      details: result.details,
      verificationCommand: result.verificationCommand,
      expectedBefore: result.expectedBefore,
      expectedAfter: result.expectedAfter,
    };
  },

  async remediate(ctx, finding) {
    try {
      const origFinding = {
        findingId: finding.id,
        catalogId: finding.catalogId,
        title: finding.title,
        severity: finding.severity,
        service: 'aws',
        resource: {
          service: 'aws',
          type: finding.resource.type,
          id: finding.resource.id,
        },
        description: finding.description,
        evidence: finding.evidence || {},
        riskScore: finding.riskScore || 50,
        detectedAt: new Date().toISOString(),
        status: 'open',
      };
      const action = mapFindingToRemediation(origFinding as any);
      if (!action) {
        return { success: false, message: 'No remediation mapping' };
      }
      const result = await executeRemediationAction(action);
      return { success: result.success, message: result.message };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  },
});

export default _plugin;
