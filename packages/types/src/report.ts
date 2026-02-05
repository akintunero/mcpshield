import { z } from 'zod';
import { SeveritySchema } from './severity.js';
import { SecurityScoreSchema, SeverityBreakdownSchema } from './score.js';

/** A single entry in the report's "top risks" list. */
export const TopRiskSchema = z.object({
  findingId: z.string(),
  catalogId: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  riskScore: z.number().min(0).max(100),
});
export type TopRisk = z.infer<typeof TopRiskSchema>;

/** A structured executive security assessment. */
export const ReportSchema = z.object({
  reportId: z.string().min(1),
  generatedAt: z.string().datetime(),
  scanId: z.string().min(1),
  endpoint: z.string(),
  region: z.string(),
  resourcesScanned: z.number().int().nonnegative(),
  score: SecurityScoreSchema,
  breakdown: SeverityBreakdownSchema,
  executiveSummary: z.string().min(1),
  topRisks: z.array(TopRiskSchema),
  completedRemediations: z.array(z.string()).default([]),
  outstandingFindings: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  /** Fully rendered Markdown version of the report. */
  markdown: z.string().min(1),
});
export type Report = z.infer<typeof ReportSchema>;
