import { z } from 'zod';

export const AuditActionSchema = z.enum([
  'scan_started',
  'scan_completed',
  'finding_discovered',
  'finding_explained',
  'plan_generated',
  'remediation_approved',
  'remediation_executed',
  'remediation_verified',
  'remediation_dry_run',
  'report_generated',
  'evidence_exported',
  'history_exported',
  'score_computed',
  'tool_invoked',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  action: AuditActionSchema,
  summary: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
  findingIds: z.array(z.string()).default([]),
  duration: z.number().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const ToolTraceSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  toolName: z.string(),
  reason: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  awsSdkOperation: z.string().optional(),
  awsCliEquivalent: z.string().optional(),
  result: z.record(z.string(), z.unknown()).default({}),
  success: z.boolean(),
  duration: z.number(),
});
export type ToolTrace = z.infer<typeof ToolTraceSchema>;

export const EvidenceRecordSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  catalogId: z.string(),
  resourceId: z.string(),
  severity: z.string(),
  status: z.string(),
  timestamp: z.string().datetime(),
  beforeState: z.record(z.string(), z.unknown()).default({}),
  afterState: z.record(z.string(), z.unknown()).default({}),
  verificationStatus: z.enum(['passed', 'failed', 'skipped']),
  verificationMethod: z.string(),
  awsCliCommand: z.string(),
  awsSdkOperation: z.string(),
  evidenceHash: z.string(),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const CategoryBreakdownSchema = z.object({
  publicExposure: z.number().min(0).max(100).default(0),
  identity: z.number().min(0).max(100).default(0),
  encryption: z.number().min(0).max(100).default(0),
  secrets: z.number().min(0).max(100).default(0),
  recovery: z.number().min(0).max(100).default(0),
  logging: z.number().min(0).max(100).default(0),
});
export type CategoryBreakdown = z.infer<typeof CategoryBreakdownSchema>;
