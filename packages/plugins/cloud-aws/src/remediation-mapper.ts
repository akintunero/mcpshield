import type { RemediationAction } from '@mcpshield/types';
import { defaultRegistry } from '@mcpshield/security-engine';

/**
 * Extracted from server.ts — maps a finding to a RemediationAction
 * using the catalog's remediationStrategy field.
 */
export function mapFindingToRemediation(finding: any): RemediationAction | null {
  const { catalogId, resource } = finding;
  const resourceId = resource.id;
  const entry = defaultRegistry.has(catalogId) ? defaultRegistry.require(catalogId) : null;
  const strategy = entry?.remediationStrategy;

  if (strategy) {
    const params: Record<string, unknown> = {};
    for (const [key, expr] of Object.entries(strategy.paramMapping)) {
      params[key] = resolveParam(expr as string, finding);
    }
    return {
      findingId: finding.findingId,
      catalogId,
      description: `Apply remediation for ${catalogId} on ${resource.type} "${resourceId}".`,
      service: strategy.service,
      operation: strategy.operation,
      params,
    };
  }

  // Fallback for entries that need dynamic params
  if (catalogId === 'MCPS-IAM-006') {
    return {
      findingId: finding.findingId, catalogId,
      description: `Replace wildcard policy on role "${resourceId}" with a least-privilege scoped policy.`,
      service: 'iam', operation: 'putRolePolicy',
      params: {
        roleName: resourceId,
        policyDocument: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['s3:GetObject', 's3:ListBucket', 'ec2:Describe*'], Resource: ['arn:aws:s3:::workshop-*', 'arn:aws:ec2:*:*:instance/*'] }] }),
      },
    };
  }

  if (catalogId === 'MCPS-DESC-001' && resource.type === 'parameter') {
    return {
      findingId: finding.findingId, catalogId,
      description: `Add description to SSM Parameter "${resourceId}".`,
      service: 'ssm', operation: 'putParameterDescription',
      params: { parameterName: resourceId, description: 'Managed by MCPShield — Systems Parameter', parameterType: (finding.evidence?.type as string) || 'String', value: (finding.evidence?.value as string) || 'placeholder' },
    };
  }

  return null;
}

function resolveParam(expr: string, finding: any): unknown {
  if (expr.startsWith('static:')) {
    const val = expr.slice(7);
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }
  const parts = expr.split('.');
  let obj: unknown = finding;
  for (const part of parts) {
    if (obj === undefined || obj === null) return undefined;
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const arr = (obj as any)[match[1]!];
      obj = Array.isArray(arr) ? arr[Number(match[2]!)] : undefined;
    } else {
      obj = (obj as any)[part];
    }
  }
  return obj;
}
