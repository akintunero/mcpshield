import { z } from 'zod';
import { SeveritySchema } from './severity.js';
import { ResourceRefSchema } from './aws.js';

/** MITRE ATT&CK mapping for a finding. */
export const MitreMappingSchema = z.object({
  tactic: z.string(),
  techniqueId: z.string(),
  techniqueName: z.string(),
});
export type MitreMapping = z.infer<typeof MitreMappingSchema>;

/** CIS AWS Foundations Benchmark mapping for a finding. */
export const CisMappingSchema = z.object({
  benchmark: z.string(),
  controlId: z.string(),
  title: z.string(),
});
export type CisMapping = z.infer<typeof CisMappingSchema>;

/**
 * Remediation templates stored on a catalog entry. `{{placeholders}}` are
 * substituted by the generators with concrete, per-resource values.
 */
export const RemediationTemplateSchema = z.object({
  terraform: z.string(),
  awsCli: z.string(),
});
export type RemediationTemplate = z.infer<typeof RemediationTemplateSchema>;

/**
 * AWS SDK strategy for automated remediation. Eliminates the hardcoded
 * switch statement in server.ts — the MCP server reads these fields
 * directly to build RemediationAction objects.
 */
export const RemediationStrategySchema = z.object({
  /** AWS service to target (e.g. "s3", "iam", "ec2"). */
  service: z.string(),
  /** Logical operation name understood by the remediator layer. */
  operation: z.string(),
  /**
   * Maps from RemediationAction param keys to the template variables
   * that should be filled from the finding's resource/evidence.
   * Example: `{ bucket: "resource.id", sgId: "resource.id" }`
   */
  paramMapping: z.record(z.string(), z.string()).default({}),
});
export type RemediationStrategy = z.infer<typeof RemediationStrategySchema>;

/** Scoring category used for the category breakdown in security_score. */
export const ScoreCategorySchema = z.enum([
  'publicExposure', 'identity', 'encryption', 'secrets', 'recovery', 'logging',
]);
export type ScoreCategory = z.infer<typeof ScoreCategorySchema>;

/**
 * A catalog entry describes a class of misconfiguration independent of any
 * live resource. Scanners instantiate concrete `Finding`s from these entries.
 */
export const FindingCatalogEntrySchema = z.object({
  /** Stable catalog id, e.g. "MCPS-S3-001". */
  id: z.string().regex(/^MCPS-[A-Z0-9]+-\d{3}$/),
  title: z.string().min(1),
  severity: SeveritySchema,
  service: z.string(),
  /** Human-readable category (e.g. "Data Protection", "Identity & Access Management"). */
  category: z.string().min(1),
  /** Scoring category for the category breakdown in security_score (0-100 per category). */
  scoreCategory: ScoreCategorySchema.optional(),
  description: z.string().min(1),
  businessImpact: z.string().min(1),
  technicalImpact: z.string().min(1),
  attackScenario: z.string().min(1),
  bestPractice: z.string().min(1),
  mitre: z.array(MitreMappingSchema).min(1),
  cis: z.array(CisMappingSchema).min(1),
  /** Base risk score (0-100) before per-resource adjustment. */
  baseRiskScore: z.number().min(0).max(100),
  remediation: RemediationTemplateSchema,
  /** Optional AWS SDK strategy for automated remediation. */
  remediationStrategy: RemediationStrategySchema.optional(),
  references: z.array(z.string().url()).default([]),
});
export type FindingCatalogEntry = z.infer<typeof FindingCatalogEntrySchema>;

/** Lifecycle status of a detected finding. */
export const FindingStatusSchema = z.enum(['open', 'remediating', 'resolved']);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

/** A concrete finding detected against a live resource. */
export const FindingSchema = z.object({
  /** Unique instance id, e.g. "MCPS-S3-001:my-bucket". */
  findingId: z.string().min(1),
  catalogId: z.string().min(1),
  title: z.string().min(1),
  severity: SeveritySchema,
  service: z.string(),
  resource: ResourceRefSchema,
  description: z.string().min(1),
  /** Detected state that proves the finding (redaction-safe). */
  evidence: z.record(z.string(), z.unknown()).default({}),
  riskScore: z.number().min(0).max(100),
  detectedAt: z.string().datetime(),
  status: FindingStatusSchema.default('open'),
});
export type Finding = z.infer<typeof FindingSchema>;
