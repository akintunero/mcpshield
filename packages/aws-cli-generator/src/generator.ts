import type { Finding, GeneratedRemediation } from '@mcpshield/types';
import { defaultRegistry } from '@mcpshield/finding-engine';
import { getConfig } from '@mcpshield/config';
import { nowIso } from '@mcpshield/shared';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('aws-cli-generator:generator');

export function renderTemplate(template: string, finding: Finding): string {
  const config = getConfig();
  const endpoint = config.aws.endpoint;
  const region = finding.resource.region || config.aws.region;
  const resourceId = finding.resource.id;
  const safeResourceId = resourceId.replace(/[^a-zA-Z0-9_]/g, '_');

  let rendered = template;

  // Global placeholders
  rendered = rendered.replace(/{{endpoint}}/g, endpoint);
  rendered = rendered.replace(/{{region}}/g, region);
  rendered = rendered.replace(/{{resourceId}}/g, safeResourceId);
  rendered = rendered.replace(/{{resourceType}}/g, finding.resource.type);

  // Service specific placeholders
  if (finding.resource.service === 's3') {
    rendered = rendered.replace(/{{bucket}}/g, resourceId);
  }
  if (finding.resource.service === 'iam') {
    rendered = rendered.replace(/{{userName}}/g, resourceId);

    // Resolve access key ID from evidence if present
    let accessKeyId = '';
    if (finding.evidence.accessKeyId) {
      accessKeyId = finding.evidence.accessKeyId as string;
    } else if (
      Array.isArray(finding.evidence.staleActiveKeys) &&
      finding.evidence.staleActiveKeys[0]
    ) {
      accessKeyId = (finding.evidence.staleActiveKeys[0] as any).accessKeyId || '';
    } else if (
      Array.isArray(finding.evidence.unusedActiveKeys) &&
      finding.evidence.unusedActiveKeys[0]
    ) {
      accessKeyId = (finding.evidence.unusedActiveKeys[0] as any).accessKeyId || '';
    }
    rendered = rendered.replace(/{{accessKeyId}}/g, accessKeyId);
  }
  if (finding.resource.service === 'ec2') {
    rendered = rendered.replace(/{{sgId}}/g, resourceId);
  }

  return rendered;
}

/**
 * Generate resource-specific AWS CLI commands to remediate a security finding.
 */
export function generateAwsCliFix(finding: Finding): GeneratedRemediation {
  logger.info(`Generating AWS CLI remediation for finding: ${finding.findingId}`);
  const catalogEntry = defaultRegistry.require(finding.catalogId);
  const template = catalogEntry.remediation.awsCli;
  const content = renderTemplate(template, finding);

  return {
    findingId: finding.findingId,
    catalogId: finding.catalogId,
    kind: 'aws-cli',
    content,
    summary: `AWS CLI command chain to resolve: "${catalogEntry.title}" on ${finding.resource.type} "${finding.resource.id}"`,
    resource: finding.resource,
    generatedAt: nowIso(),
  };
}
