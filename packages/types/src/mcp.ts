import { z } from 'zod';
import { SeveritySchema } from './severity.js';
import { AwsServiceSchema } from './aws.js';
import { FindingSchema, FindingCatalogEntrySchema } from './finding.js';
import { ScanResultSchema } from './scan.js';
import { SecurityScoreSchema } from './score.js';
import { GeneratedRemediationSchema, RemediationResultSchema } from './remediation.js';
import { ApprovalSchema } from './approval.js';
import { ReportSchema } from './report.js';

/**
 * Canonical MCP tool names exposed by the MCPShield MCP server. The agent and
 * any MCP client reference these names.
 */
export const MCP_TOOL_NAMES = [
  'scan_environment',
  'list_findings',
  'describe_finding',
  'security_score',
  'generate_report',
  'generate_cli_fix',
  'generate_terraform_fix',
  'approve_remediation',
  'execute_remediation',
  'rescan_environment',
  'health',
] as const;

export const McpToolNameSchema = z.enum(MCP_TOOL_NAMES);
export type McpToolName = z.infer<typeof McpToolNameSchema>;

// --- scan_environment -------------------------------------------------------
export const ScanEnvironmentInputSchema = z.object({
  services: z
    .array(AwsServiceSchema)
    .optional()
    .describe('Optional subset of services to scan. Omit to scan everything.'),
});
export const ScanEnvironmentOutputSchema = ScanResultSchema;

// --- list_findings ----------------------------------------------------------
export const ListFindingsInputSchema = z.object({
  severity: SeveritySchema.optional().describe('Filter findings by severity.'),
  service: AwsServiceSchema.optional().describe('Filter findings by AWS service.'),
});
export const ListFindingsOutputSchema = z.object({
  findings: z.array(FindingSchema),
  total: z.number().int().nonnegative(),
});

// --- describe_finding -------------------------------------------------------
export const DescribeFindingInputSchema = z.object({
  findingId: z.string().min(1).describe('The finding instance id, e.g. "MCPS-S3-001:my-bucket".'),
});
export const DescribeFindingOutputSchema = z.object({
  finding: FindingSchema,
  catalog: FindingCatalogEntrySchema,
});

// --- security_score ---------------------------------------------------------
export const SecurityScoreInputSchema = z.object({});
export const SecurityScoreOutputSchema = SecurityScoreSchema;

// --- generate_report --------------------------------------------------------
export const GenerateReportInputSchema = z.object({});
export const GenerateReportOutputSchema = ReportSchema;

// --- generate_cli_fix / generate_terraform_fix -----------------------------
export const GenerateFixInputSchema = z.object({
  findingId: z.string().min(1).describe('The finding instance id to remediate.'),
});
export const GenerateFixOutputSchema = GeneratedRemediationSchema;

// --- approve_remediation ----------------------------------------------------
export const ApproveRemediationInputSchema = z.object({
  findingIds: z.array(z.string().min(1)).min(1).describe('Finding ids to approve for remediation.'),
  approvedBy: z.string().min(1).describe('Human approver identity (e.g. Slack user).'),
  note: z.string().optional(),
});
export const ApproveRemediationOutputSchema = ApprovalSchema;

// --- execute_remediation ----------------------------------------------------
export const ExecuteRemediationInputSchema = z.object({
  approvalId: z
    .string()
    .min(1)
    .describe('An approval id returned by approve_remediation. Required — no approval, no write.'),
});
export const ExecuteRemediationOutputSchema = z.object({
  approvalId: z.string(),
  results: z.array(RemediationResultSchema),
  score: SecurityScoreSchema,
});

// --- rescan_environment -----------------------------------------------------
export const RescanEnvironmentInputSchema = z.object({});
export const RescanEnvironmentOutputSchema = ScanResultSchema;

// --- health -----------------------------------------------------------------
export const HealthInputSchema = z.object({});
export const HealthOutputSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  cloudProvider: z.object({
    reachable: z.boolean(),
    endpoint: z.string(),
    region: z.string(),
    services: z.record(z.string(), z.string()).default({}),
  }),
  lastScanId: z.string().optional(),
});
