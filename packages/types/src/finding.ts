import { z } from 'zod';
import { SeveritySchema } from './severity.js';
import { AwsServiceSchema, ResourceRefSchema } from './aws.js';

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
 * A catalog entry describes a class of misconfiguration independent of any
 * live resource. Scanners instantiate concrete `Finding`s from these entries.
 */
export const FindingCatalogEntrySchema = z.object({
  /** Stable catalog id, e.g. "MCPS-S3-001". */
  id: z.string().regex(/^MCPS-[A-Z0-9]+-\d{3}$/),
  title: z.string().min(1),
  severity: SeveritySchema,
  service: AwsServiceSchema,
  category: z.string().min(1),
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
  service: AwsServiceSchema,
  resource: ResourceRefSchema,
  description: z.string().min(1),
  /** Detected state that proves the finding (redaction-safe). */
  evidence: z.record(z.string(), z.unknown()).default({}),
  riskScore: z.number().min(0).max(100),
  detectedAt: z.string().datetime(),
  status: FindingStatusSchema.default('open'),
});
export type Finding = z.infer<typeof FindingSchema>;
