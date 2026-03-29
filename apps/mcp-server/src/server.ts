import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { scanEnvironment, executeRemediationAction, s3Client } from '@mcpshield/aws-tools';
import { runSecurityEngine } from '@mcpshield/security-engine';
import { computeSecurityScore } from '@mcpshield/scoring-engine';
import { generateTerraformFix } from '@mcpshield/terraform-generator';
import { generateAwsCliFix } from '@mcpshield/aws-cli-generator';
import { generateReport } from '@mcpshield/report-generator';

import { loadState, saveState } from './state.js';
import { shortId, nowIso } from '@mcpshield/shared';
import { createLogger } from '@mcpshield/logger';
import { getConfig } from '@mcpshield/config';
import type {
  Finding,
  ScanResult,
  Approval,
  RemediationAction,
  RemediationResult,
  AwsService,
  Severity,
} from '@mcpshield/types';

const logger = createLogger('mcp-server:server');

// Instantiate the MCP Server
export const mcpServer = new Server(
  {
    name: 'mcpshield-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/** Helper to group resource snapshots by service for count report */
function groupByService(snapshots: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of snapshots) {
    counts[s.service] = (counts[s.service] || 0) + 1;
  }
  return counts;
}

/** Helper to resolve access key ID from evidence */
function resolveAccessKeyId(finding: Finding): string {
  if (finding.evidence.accessKeyId) {
    return finding.evidence.accessKeyId as string;
  }
  if (Array.isArray(finding.evidence.staleActiveKeys) && finding.evidence.staleActiveKeys[0]) {
    return (finding.evidence.staleActiveKeys[0] as any).accessKeyId || '';
  }
  if (Array.isArray(finding.evidence.unusedActiveKeys) && finding.evidence.unusedActiveKeys[0]) {
    return (finding.evidence.unusedActiveKeys[0] as any).accessKeyId || '';
  }
  return '';
}

/** Map a detected finding to a concrete RemediationAction executable by aws-tools */
function mapFindingToRemediation(finding: Finding): RemediationAction | null {
  const { catalogId, resource } = finding;
  const resourceId = resource.id;

  switch (catalogId) {
    case 'MCPS-S3-001':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Enable S3 Block Public Access on bucket "${resourceId}".`,
        service: 's3',
        operation: 'putPublicAccessBlock',
        params: { bucket: resourceId },
      };

    case 'MCPS-IAM-001':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Detach direct AdministratorAccess policy attachment from user "${resourceId}".`,
        service: 'iam',
        operation: 'detachUserPolicy',
        params: {
          userName: resourceId,
          policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess',
        },
      };

    case 'MCPS-IAM-002': {
      const accessKeyId = resolveAccessKeyId(finding);
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Deactivate stale, non-rotated IAM access key "${accessKeyId}" for user "${resourceId}".`,
        service: 'iam',
        operation: 'deactivateAccessKey',
        params: { userName: resourceId, accessKeyId },
      };
    }

    case 'MCPS-EC2-001':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Revoke public internet TCP port 22 ingress for security group "${resourceId}".`,
        service: 'ec2',
        operation: 'revokeSecurityGroupIngress',
        params: { sgId: resourceId, port: 22 },
      };

    case 'MCPS-EC2-002':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Revoke public internet TCP port 3389 ingress for security group "${resourceId}".`,
        service: 'ec2',
        operation: 'revokeSecurityGroupIngress',
        params: { sgId: resourceId, port: 3389 },
      };

    case 'MCPS-S3-002':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Enable default AES256 server-side encryption on bucket "${resourceId}".`,
        service: 's3',
        operation: 'putBucketEncryption',
        params: { bucket: resourceId },
      };

    case 'MCPS-S3-003':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Enable S3 bucket versioning on bucket "${resourceId}".`,
        service: 's3',
        operation: 'putBucketVersioning',
        params: { bucket: resourceId },
      };

    case 'MCPS-CT-001':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Start logging on CloudTrail "${resourceId}".`,
        service: 'cloudtrail',
        operation: 'startLogging',
        params: { trailName: resourceId },
      };

    case 'MCPS-IAM-003':
      return {
        findingId: finding.findingId,
        catalogId,
        description:
          'Configure strict IAM account password policy (length 14, uppercase, symbols, history).',
        service: 'iam',
        operation: 'updatePasswordPolicy',
        params: {},
      };

    case 'MCPS-IAM-004':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Delete unused IAM user "${resourceId}" (deleting credentials and policies first).`,
        service: 'iam',
        operation: 'deleteUser',
        params: { userName: resourceId },
      };

    case 'MCPS-IAM-005': {
      const accessKeyId = resolveAccessKeyId(finding);
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Deactivate unused access key "${accessKeyId}" for user "${resourceId}".`,
        service: 'iam',
        operation: 'deactivateAccessKey',
        params: { userName: resourceId, accessKeyId },
      };
    }

    case 'MCPS-S3-004':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Enable S3 server access logging on bucket "${resourceId}" pointing to logging target.`,
        service: 's3',
        operation: 'putBucketLogging',
        params: { bucket: resourceId },
      };

    case 'MCPS-TAG-001':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Add required governance tags (Owner, Environment, DataClassification) to bucket "${resourceId}".`,
        service: 's3',
        operation: 'putBucketTagging',
        params: {
          bucket: resourceId,
          tags: {
            Owner: 'security',
            Environment: 'workshop',
            DataClassification: 'internal',
          },
        },
      };

    case 'MCPS-NAM-001':
      return {
        findingId: finding.findingId,
        catalogId,
        description: `Rename bucket "${resourceId}" to compliance-conforming format and migrate objects.`,
        service: 's3',
        operation: 'renameBucket',
        params: {
          bucket: resourceId,
          newBucket: 'workshop-mcpshield-data',
        },
      };

    case 'MCPS-DESC-001':
      if (resource.type === 'parameter') {
        return {
          findingId: finding.findingId,
          catalogId,
          description: `Add description to SSM Parameter "${resourceId}".`,
          service: 'ssm',
          operation: 'putParameterDescription',
          params: {
            parameterName: resourceId,
            description: 'Managed by MCPShield — Systems Parameter',
            parameterType: (finding.evidence.type as string) || 'String',
            value: (finding.evidence.value as string) || 'placeholder',
          },
        };
      }
      break;
  }

  return null;
}

// 1. Declare available tools to the MCP client (LLM Agent)
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info('Received ListToolsRequest from MCP client.');
  return {
    tools: [
      {
        name: 'scan_environment',
        description:
          'Scan the active AWS environment (LocalStack) to catalog resources and detect misconfigurations.',
        inputSchema: {
          type: 'object',
          properties: {
            services: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional subset of AWS services to scan (s3, iam, ec2, cloudtrail). Omit to scan all.',
            },
          },
        },
      },
      {
        name: 'list_findings',
        description:
          'Retrieve a list of security findings detected during the last environment scan.',
        inputSchema: {
          type: 'object',
          properties: {
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Optional severity filter.',
            },
            service: {
              type: 'string',
              description: 'Optional service filter (e.g. s3, iam).',
            },
          },
        },
      },
      {
        name: 'describe_finding',
        description:
          'Retrieve full descriptive and compliance details for a specific finding instance.',
        inputSchema: {
          type: 'object',
          properties: {
            findingId: {
              type: 'string',
              description: 'The unique finding instance identifier, e.g. "MCPS-S3-001:my-bucket".',
            },
          },
          required: ['findingId'],
        },
      },
      {
        name: 'security_score',
        description:
          'Compute and return the current overall security score and grade breakdown of the environment.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'generate_report',
        description:
          'Compile a comprehensive, structured executive security assessment report in Markdown.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'generate_cli_fix',
        description:
          'Generate an AWS CLI command sequence to remediate a specific security finding.',
        inputSchema: {
          type: 'object',
          properties: {
            findingId: {
              type: 'string',
              description: 'Finding instance ID.',
            },
          },
          required: ['findingId'],
        },
      },
      {
        name: 'generate_terraform_fix',
        description:
          'Generate a Terraform configuration block to remediate a specific security finding.',
        inputSchema: {
          type: 'object',
          properties: {
            findingId: {
              type: 'string',
              description: 'Finding instance ID.',
            },
          },
          required: ['findingId'],
        },
      },
      {
        name: 'approve_remediation',
        description:
          'Approve a list of security findings for remediation. Creates an approval entry required to apply fixes.',
        inputSchema: {
          type: 'object',
          properties: {
            findingIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'The finding IDs to approve.',
            },
            approvedBy: {
              type: 'string',
              description: 'Identity of the human approver (e.g., Slack handle).',
            },
            note: {
              type: 'string',
              description: 'Optional approval notes.',
            },
          },
          required: ['findingIds', 'approvedBy'],
        },
      },
      {
        name: 'execute_remediation',
        description:
          'Apply approved remediations against AWS (LocalStack). Requires a valid approval ID.',
        inputSchema: {
          type: 'object',
          properties: {
            approvalId: {
              type: 'string',
              description: 'The authorization ID returned by approve_remediation.',
            },
          },
          required: ['approvalId'],
        },
      },
      {
        name: 'rescan_environment',
        description: 'Trigger a fresh environment scan and update the security posture score.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'health',
        description:
          'Query status of MCPShield server and verify connectivity to the local AWS endpoint.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Helper function to execute scan, update findings lifecycle, and compute score
async function performScanAndSave(services?: AwsService[]): Promise<ScanResult> {
  const state = await loadState();
  const scanId = shortId('scn');
  const startedAt = nowIso();

  // 1. Scan LocalStack API for raw resource structures
  const snapshots = await scanEnvironment(services);

  // 2. Run rule evaluations to detect vulnerabilities
  const findings = runSecurityEngine(snapshots);
  const completedAt = nowIso();

  // 3. Keep track of findings lifecycle (merge old and new findings)
  const existingFindingsMap = new Map(state.allFindings.map((f) => [f.findingId, f]));
  const mergedFindings: Finding[] = [];

  for (const f of findings) {
    const existing = existingFindingsMap.get(f.findingId);
    if (existing) {
      mergedFindings.push({
        ...f,
        status: existing.status === 'resolved' ? 'open' : existing.status,
      });
    } else {
      mergedFindings.push(f);
    }
    existingFindingsMap.delete(f.findingId);
  }

  // Findings missing from new scan are resolved
  for (const [_, f] of existingFindingsMap) {
    if (f.status === 'open' || f.status === 'remediating') {
      mergedFindings.push({
        ...f,
        status: 'resolved',
      });
    } else {
      mergedFindings.push(f);
    }
  }

  state.allFindings = mergedFindings;

  // 4. Calculate security score
  const score = computeSecurityScore(mergedFindings);

  const scanResult: ScanResult = {
    scanId,
    startedAt,
    completedAt,
    endpoint: getConfig().aws.endpoint,
    region: getConfig().aws.region,
    resourcesScanned: snapshots.length,
    resourceCounts: groupByService(snapshots),
    findings: mergedFindings.filter((f) => f.status === 'open'),
    score,
  };

  state.lastScan = scanResult;
  await saveState(state);
  return scanResult;
}

function resolveFinding(findingId: string, allFindings: Finding[]): Finding | undefined {
  if (!findingId) return undefined;
  // 1. Exact match
  let finding = allFindings.find((f) => f.findingId === findingId);
  if (finding) return finding;

  // 2. Resource ID exact match
  finding = allFindings.find((f) => f.resource.id === findingId);
  if (finding) return finding;

  // 3. Substring match (case-insensitive)
  finding = allFindings.find((f) => f.findingId.toLowerCase().includes(findingId.toLowerCase()));
  if (finding) return finding;

  return undefined;
}

// 2. Handle Tool Executions
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info(`Received CallToolRequest for tool: ${name}`);

  try {
    const state = await loadState();

    switch (name) {
      case 'scan_environment': {
        const services = args?.services as AwsService[] | undefined;
        const scanResult = await performScanAndSave(services);
        return { content: [{ type: 'text', text: JSON.stringify(scanResult, null, 2) }] };
      }

      case 'list_findings': {
        const severity = args?.severity as Severity | undefined;
        const service = args?.service as AwsService | undefined;

        let filtered = state.allFindings;
        if (severity) {
          filtered = filtered.filter((f) => f.severity === severity);
        }
        if (service) {
          filtered = filtered.filter((f) => f.service === service);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  findings: filtered,
                  total: filtered.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case 'describe_finding': {
        const rawFindingId = args?.findingId as string;
        const finding = resolveFinding(rawFindingId, state.allFindings);
        if (!finding) {
          throw new Error(
            `Finding "${rawFindingId}" not found in current inventory. Please run scan_environment.`,
          );
        }
        const entry = generateTerraformFix(finding); // verifies catalog details

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  finding,
                  catalog: entry,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case 'security_score': {
        const score = computeSecurityScore(state.allFindings);
        return { content: [{ type: 'text', text: JSON.stringify(score, null, 2) }] };
      }

      case 'generate_report': {
        if (!state.lastScan) {
          throw new Error('No scans have been performed yet. Run scan_environment first.');
        }
        const score = computeSecurityScore(state.allFindings);
        const report = generateReport({
          scanId: state.lastScan.scanId,
          endpoint: state.lastScan.endpoint,
          region: state.lastScan.region,
          resourcesScanned: state.lastScan.resourcesScanned,
          score,
          allFindings: state.allFindings,
        });

        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
      }

      case 'generate_cli_fix': {
        const rawFindingId = args?.findingId as string;
        const finding = resolveFinding(rawFindingId, state.allFindings);
        if (!finding) {
          throw new Error(`Finding "${rawFindingId}" not found.`);
        }
        const fix = generateAwsCliFix(finding);
        return { content: [{ type: 'text', text: JSON.stringify(fix, null, 2) }] };
      }

      case 'generate_terraform_fix': {
        const rawFindingId = args?.findingId as string;
        const finding = resolveFinding(rawFindingId, state.allFindings);
        if (!finding) {
          throw new Error(`Finding "${rawFindingId}" not found.`);
        }
        const fix = generateTerraformFix(finding);
        return { content: [{ type: 'text', text: JSON.stringify(fix, null, 2) }] };
      }

      case 'approve_remediation': {
        const rawFindingIds = args?.findingIds as string[];
        const approvedBy = args?.approvedBy as string;
        const note = args?.note as string | undefined;

        if (!Array.isArray(rawFindingIds) || rawFindingIds.length === 0) {
          throw new Error('findingIds array cannot be empty.');
        }

        const resolvedFindingIds: string[] = [];

        // Verify findings are open and exist in catalog
        for (const fid of rawFindingIds) {
          const finding = resolveFinding(fid, state.allFindings);
          if (!finding) {
            throw new Error(`Finding ID "${fid}" was not found.`);
          }
          if (finding.status !== 'open') {
            throw new Error(`Finding ID "${fid}" is not open (status: ${finding.status}).`);
          }
          resolvedFindingIds.push(finding.findingId);
        }

        const approvalId = shortId('apr');
        const approval: Approval = {
          approvalId,
          findingIds: resolvedFindingIds,
          requestedBy: approvedBy,
          createdAt: nowIso(),
          status: 'approved', // Auto-approve since Slack bot acts as the interface gateway
          approvedBy,
          decidedAt: nowIso(),
          note,
        };

        state.approvals[approvalId] = approval;
        await saveState(state);

        return { content: [{ type: 'text', text: JSON.stringify(approval, null, 2) }] };
      }

      case 'execute_remediation': {
        const approvalId = args?.approvalId as string;
        const approval = state.approvals[approvalId];

        if (!approval) {
          throw new Error(`Approval entry "${approvalId}" not found.`);
        }
        if (approval.status !== 'approved') {
          throw new Error(
            `Approval "${approvalId}" is not in approved state (status: ${approval.status}).`,
          );
        }

        logger.info(`Applying approved remediations for approval: ${approvalId}`);
        const results: RemediationResult[] = [];

        for (const fid of approval.findingIds) {
          const findingIndex = state.allFindings.findIndex((f) => f.findingId === fid);
          if (findingIndex === -1) {
            results.push({
              findingId: fid,
              catalogId: 'MCPS-UNKNOWN',
              success: false,
              message: 'Finding missing from system record.',
              executedAt: nowIso(),
            });
            continue;
          }

          const finding = state.allFindings[findingIndex]!;
          if (finding.status !== 'open') {
            results.push({
              findingId: fid,
              catalogId: finding.catalogId,
              success: true,
              message: `Finding was already resolved (status: ${finding.status}).`,
              executedAt: nowIso(),
            });
            continue;
          }

          // Mark as remediating in state
          finding.status = 'remediating';
          await saveState(state);

          const action = mapFindingToRemediation(finding);
          if (!action) {
            finding.status = 'open'; // rollback
            await saveState(state);
            results.push({
              findingId: fid,
              catalogId: finding.catalogId,
              success: false,
              message: `No automatic remediation mapping exists for finding catalog ${finding.catalogId}.`,
              executedAt: nowIso(),
            });
            continue;
          }

          const res = await executeRemediationAction(action);
          results.push(res);

          if (res.success) {
            finding.status = 'resolved';
          } else {
            finding.status = 'open'; // fail back
          }
          await saveState(state);
        }

        // Update approval
        approval.status = 'executed';
        state.approvals[approvalId] = approval;
        state.remediationResults.push(...results);

        // Recompute score
        const score = computeSecurityScore(state.allFindings);
        await saveState(state);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  approvalId,
                  results,
                  score,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case 'rescan_environment': {
        const services = state.lastScan?.findings.map((f) => f.service) || undefined;
        const scanResult = await performScanAndSave(services);
        return { content: [{ type: 'text', text: JSON.stringify(scanResult, null, 2) }] };
      }

      case 'health': {
        let reachable = false;
        const config = getConfig();
        const services: Record<string, string> = {};

        try {
          // Verify LocalStack connectivity by calling S3
          await s3Client.send(new ListBucketsCommand({}));
          reachable = true;
          services.s3 = 'active';
        } catch (e: any) {
          logger.warn(`LocalStack healthcheck failed: ${e.message}`);
        }

        const health = {
          status: reachable ? 'ok' : 'degraded',
          version: '1.0.0',
          uptimeSeconds: process.uptime(),
          cloudProvider: {
            reachable,
            endpoint: config.aws.endpoint,
            region: config.aws.region,
            services,
          },
          lastScanId: state.lastScan?.scanId,
        };

        return { content: [{ type: 'text', text: JSON.stringify(health, null, 2) }] };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (err: any) {
    logger.error(`Error executing tool ${name}: ${err.message}`, err);
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }],
    };
  }
});
