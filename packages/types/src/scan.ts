import { z } from 'zod';
import { AwsServiceSchema } from './aws.js';
import { FindingSchema } from './finding.js';
import { SecurityScoreSchema } from './score.js';

/** A point-in-time snapshot of a single AWS resource captured during a scan. */
export const ResourceSnapshotSchema = z.object({
  service: AwsServiceSchema,
  type: z.string(),
  id: z.string(),
  arn: z.string().optional(),
  region: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  tags: z.record(z.string(), z.string()).default({}),
});
export type ResourceSnapshot = z.infer<typeof ResourceSnapshotSchema>;

/** The full result of scanning the environment. */
export const ScanResultSchema = z.object({
  scanId: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  endpoint: z.string(),
  region: z.string(),
  resourcesScanned: z.number().int().nonnegative(),
  /** Count of resources scanned per service. */
  resourceCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  findings: z.array(FindingSchema),
  /** Security score computed immediately after the scan. */
  score: SecurityScoreSchema.optional(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
