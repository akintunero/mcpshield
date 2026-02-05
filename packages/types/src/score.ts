import { z } from 'zod';

/** Count of findings per severity. */
export const SeverityBreakdownSchema = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});
export type SeverityBreakdown = z.infer<typeof SeverityBreakdownSchema>;

/** Letter grade derived from the numeric score. */
export const GradeSchema = z.enum(['A', 'B', 'C', 'D', 'F']);
export type Grade = z.infer<typeof GradeSchema>;

/** A computed security posture score for a scan. */
export const SecurityScoreSchema = z.object({
  score: z.number().min(0).max(100),
  grade: GradeSchema,
  totalFindings: z.number().int().nonnegative(),
  breakdown: SeverityBreakdownSchema,
  computedAt: z.string().datetime(),
  /** Delta versus the previous scan's score, if any. */
  delta: z.number().optional(),
});
export type SecurityScore = z.infer<typeof SecurityScoreSchema>;
