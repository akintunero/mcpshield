import { z } from 'zod';

/** Finding severity levels, ordered from most to least urgent. */
export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type Severity = z.infer<typeof SeveritySchema>;

/** All severities in descending urgency order. */
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'] as const;

/** Sort rank for a severity (lower = more urgent). */
export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Per-severity weight used by the scoring engine (points deducted per finding). */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 4,
  low: 1,
};

/** Compare two severities for sorting (critical first). */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}
