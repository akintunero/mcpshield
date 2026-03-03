import type { ResourceSnapshot, Finding } from '@mcpshield/types';
import { defaultRegistry } from '@mcpshield/finding-engine';
import { findingInstanceId } from '@mcpshield/shared';
import { RULES } from './rules.js';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('security-engine:engine');

/**
 * Evaluate a list of resource snapshots against the security rules.
 * Returns concrete findings for any violated checks.
 */
export function runSecurityEngine(snapshots: ResourceSnapshot[]): Finding[] {
  logger.info(`Analyzing ${snapshots.length} resource snapshots for vulnerabilities...`);
  const findings: Finding[] = [];

  for (const snapshot of snapshots) {
    for (const rule of RULES) {
      try {
        const evaluation = rule(snapshot);
        if (evaluation && evaluation.isViolated) {
          const catalogEntry = defaultRegistry.get(evaluation.catalogId);
          if (!catalogEntry) {
            logger.warn(`Rule returned unknown catalogId: ${evaluation.catalogId}`);
            continue;
          }

          const fid = findingInstanceId(catalogEntry.id, snapshot.id);

          findings.push({
            findingId: fid,
            catalogId: catalogEntry.id,
            title: catalogEntry.title,
            severity: catalogEntry.severity,
            service: catalogEntry.service,
            resource: {
              service: snapshot.service,
              type: snapshot.type,
              id: snapshot.id,
              arn: snapshot.arn,
              region: snapshot.region,
            },
            description: evaluation.descriptionOverride || catalogEntry.description,
            evidence: evaluation.evidence,
            riskScore: catalogEntry.baseRiskScore,
            detectedAt: new Date().toISOString(),
            status: 'open',
          });
        }
      } catch (err: any) {
        logger.error(
          `Error executing rule for resource ${snapshot.service}:${snapshot.type}:${snapshot.id}: ${err.message}`,
          err,
        );
      }
    }
  }

  logger.info(`Analysis complete. Detected ${findings.length} security findings.`);
  return findings;
}
