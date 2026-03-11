import type { Finding, SecurityScore, Grade, SeverityBreakdown } from '@mcpshield/types';
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
 * Calculates a point-in-time security score and letter grade based on active (open) findings.
 * Enables comparison with a previous score to calculate improvement deltas.
 */
export function computeSecurityScore(
  findings: Finding[],
  previousScore?: SecurityScore,
): SecurityScore {
  const activeFindings = findings.filter((f) => f.status === 'open');

  const breakdown: SeverityBreakdown = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalDeductions = 0;
  for (const f of activeFindings) {
    breakdown[f.severity] += 1;
    totalDeductions += SEVERITY_WEIGHT[f.severity] ?? 0;
  }

  const score = clamp(100 - totalDeductions, 0, 100);
  const grade = resolveGrade(score);
  const delta = previousScore ? score - previousScore.score : undefined;

  logger.info(
    `Computed security posture: Score ${score}/100, Grade ${grade}, ${activeFindings.length} open findings.`,
  );

  return {
    score,
    grade,
    totalFindings: activeFindings.length,
    breakdown,
    computedAt: nowIso(),
    delta,
  };
}
