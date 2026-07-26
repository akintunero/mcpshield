import type { Finding, SecurityScore, Grade, SeverityBreakdown, CategoryBreakdown } from '@mcpshield/types';
import { SEVERITY_WEIGHT } from '@mcpshield/types';
import { clamp, nowIso } from '@mcpshield/shared';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('scoring-engine:scoring');

function resolveGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Score category lookup. Each catalog ID maps to a scoring dimension.
 * When adding a new finding, add the corresponding scoreCategory to
 * the catalog entry in finding-engine, then add the mapping here.
 */
const CATEGORY_LOOKUP: Record<string, keyof CategoryBreakdown> = {
  'MCPS-S3-001': 'publicExposure', 'MCPS-S3-002': 'encryption', 'MCPS-S3-003': 'recovery',
  'MCPS-S3-004': 'logging', 'MCPS-EC2-001': 'publicExposure', 'MCPS-EC2-002': 'publicExposure',
  'MCPS-IAM-001': 'identity', 'MCPS-IAM-002': 'identity', 'MCPS-IAM-003': 'identity',
  'MCPS-IAM-004': 'identity', 'MCPS-IAM-005': 'identity', 'MCPS-IAM-006': 'identity',
  'MCPS-KMS-001': 'encryption', 'MCPS-SECRETS-001': 'secrets', 'MCPS-SEC-001': 'secrets',
  'MCPS-SSM-001': 'secrets', 'MCPS-CT-001': 'logging', 'MCPS-DDB-001': 'encryption',
  'MCPS-SQS-001': 'encryption', 'MCPS-SNS-001': 'encryption', 'MCPS-LM-001': 'recovery',
  'MCPS-TAG-001': 'identity', 'MCPS-NAM-001': 'identity', 'MCPS-DESC-001': 'identity',
};

export function computeCategoryBreakdown(findings: Finding[]): CategoryBreakdown {
  const open = findings.filter((f) => f.status === 'open');
  const deductions: Record<string, number> = {};

  for (const f of open) {
    const cat = CATEGORY_LOOKUP[f.catalogId] || 'identity';
    deductions[cat] = (deductions[cat] || 0) + (SEVERITY_WEIGHT[f.severity] ?? 0);
  }

  const get = (key: string): number => clamp(100 - (deductions[key] || 0), 0, 100);

  return {
    publicExposure: get('publicExposure'),
    identity: get('identity'),
    encryption: get('encryption'),
    secrets: get('secrets'),
    recovery: get('recovery'),
    logging: get('logging'),
  };
}

export interface DetailedSecurityScore extends SecurityScore {
  categoryBreakdown: CategoryBreakdown;
  improvements: string[];
  resolvedCount: number;
  remainingCount: number;
}

export function computeSecurityScore(
  findings: Finding[],
  previousScore?: SecurityScore,
): DetailedSecurityScore {
  const activeFindings = findings.filter((f) => f.status === 'open');
  const resolvedFindings = findings.filter((f) => f.status === 'resolved');

  const breakdown: SeverityBreakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalDeductions = 0;

  for (const f of activeFindings) {
    breakdown[f.severity] += 1;
    totalDeductions += SEVERITY_WEIGHT[f.severity] ?? 0;
  }

  const score = clamp(100 - totalDeductions, 0, 100);
  const grade = resolveGrade(score);
  const delta = previousScore ? score - previousScore.score : undefined;
  const categoryBreakdown = computeCategoryBreakdown(findings);

  const improvements: string[] = [];
  if (delta && delta > 0) improvements.push(`Security score improved by +${delta} points`);
  if (resolvedFindings.length > 0) improvements.push(`${resolvedFindings.length} findings remediated`);

  logger.info(
    `Score ${score}/100, Grade ${grade}, ${activeFindings.length} open, ${resolvedFindings.length} resolved`,
  );

  return {
    score,
    grade,
    totalFindings: activeFindings.length,
    breakdown,
    categoryBreakdown,
    improvements,
    resolvedCount: resolvedFindings.length,
    remainingCount: activeFindings.length,
    computedAt: nowIso(),
    delta,
  };
}
