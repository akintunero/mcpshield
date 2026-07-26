import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { PluginRegistry, CapabilityRouter, createEventBus, RBAC } from '@mcpshield/mcp-core';
import { executeRemediationAction } from '@mcpshield/aws-tools';
import { computeSecurityScore } from '@mcpshield/scoring-engine';
import { generateTerraformFix } from '@mcpshield/terraform-generator';
import { generateAwsCliFix } from '@mcpshield/aws-cli-generator';
import { generateReport } from '@mcpshield/report-generator';
import { defaultRegistry } from '@mcpshield/security-engine';

import { loadState, saveState, recordAudit, recordEvidence } from './state.js';
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

const eventBus = createEventBus();
const pluginRegistry = new PluginRegistry();
const capabilityRouter = new CapabilityRouter();
const rbac = new RBAC();

// Seed RBAC with the configured API key holder as admin
const apiKeyUser = getConfig().security.apiKey ? 'api-key-holder' : 'anonymous';
rbac.assignRole(apiKeyUser, 'admin');
rbac.assignRole('slack-bot', 'operator');

// Default to anonymous viewer — production deployments should configure proper roles
rbac.assignRole('anonymous', 'viewer');

async function initializePlugins(pluginDirs?: string[]): Promise<void> {
  const stateDir = getConfig().mcp.stateDir;
  const { default: builtInAwsPlugin } = await import('@mcpshield/cloud-aws');

  // Create a plugin context matching @mcpshield/plugin-sdk/types
  const createCtx = (pluginId: string): any => ({
    pluginId,
    logger: {
      info: (msg: string) => logger.info(`[${pluginId}] ${msg}`),
      warn: (msg: string) => logger.warn(`[${pluginId}] ${msg}`),
      error: (msg: string) => logger.error(`[${pluginId}] ${msg}`),
      debug: (msg: string) => logger.debug(`[${pluginId}] ${msg}`),
    },
    stateDir,
    config: {},
    eventBus: { emit: (e: any) => eventBus.emit({ ...e, pluginId, timestamp: nowIso() }) },
    abortSignal: new AbortController().signal,
  });

  const ctx = createCtx('cloud-aws');
  await builtInAwsPlugin.init(ctx);
  // Cast to MCPPlugin for backward compat with the legacy registry
  pluginRegistry.register(builtInAwsPlugin as any);
  capabilityRouter.registerPlugin(builtInAwsPlugin as any);

  logger.info(`Loaded plugin: cloud-aws (${builtInAwsPlugin.manifest.capabilities.length} capabilities)`);
  logger.info(`Plugin initialization complete. ${pluginRegistry.getAll().length} plugin(s) active.`);
}

function groupByService(snapshots: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of snapshots) {
    counts[s.service] = (counts[s.service] || 0) + 1;
  }
  return counts;
}

function resolveParam(expr: string, finding: Finding): unknown {
  if (expr.startsWith('static:')) {
    const val = expr.slice(7);
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }
  const parts = expr.split('.');
  let obj: unknown = finding as any;
  for (const part of parts) {
    if (obj === undefined || obj === null) return undefined;
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const arr = (obj as any)[match[1]!];
      obj = Array.isArray(arr) ? arr[Number(match[2]!)] : undefined;
    } else {
      obj = (obj as any)[part];
    }
  }
  return obj;
}

function mapFindingToRemediation(finding: Finding): RemediationAction | null {
  const { catalogId, resource } = finding;
  const resourceId = resource.id;
  const entry = defaultRegistry.has(catalogId) ? defaultRegistry.require(catalogId) : null;
  const strategy = entry?.remediationStrategy;

  if (strategy) {
    const params: Record<string, unknown> = {};
    for (const [key, expr] of Object.entries(strategy.paramMapping)) {
      params[key] = resolveParam(expr, finding);
    }
    return {
      findingId: finding.findingId,
      catalogId,
      description: `Apply remediation for ${catalogId} on ${resource.type} "${resourceId}".`,
      service: strategy.service,
      operation: strategy.operation,
      params,
    };
  }

  if (catalogId === 'MCPS-IAM-006') {
    return {
      findingId: finding.findingId, catalogId,
      description: `Replace wildcard policy on role "${resourceId}".`,
      service: 'iam', operation: 'putRolePolicy',
      params: {
        roleName: resourceId,
        policyDocument: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['s3:GetObject', 's3:ListBucket', 'ec2:Describe*'], Resource: ['arn:aws:s3:::workshop-*', 'arn:aws:ec2:*:*:instance/*'] }] }),
      },
    };
  }

  if (catalogId === 'MCPS-DESC-001' && resource.type === 'parameter') {
    return {
      findingId: finding.findingId, catalogId,
      description: `Add description to SSM Parameter "${resourceId}".`,
      service: 'ssm', operation: 'putParameterDescription',
      params: { parameterName: resourceId, description: 'Managed by MCPShield', parameterType: (finding.evidence.type as string) || 'String', value: (finding.evidence.value as string) || 'placeholder' },
    };
  }

  return null;
}

export function createMcpServer(): Server {
  const mcpServer = new Server(
    { name: 'mcpshield-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info('Received ListToolsRequest from MCP client.');
    return {
      tools: [
        {
          name: 'scan_environment',
          description: 'Scan all discovered environments via registered plugins.',
          inputSchema: { type: 'object', properties: {
            services: { type: 'array', items: { type: 'string' }, description: 'Optional service filter.' },
          } },
        },
        {
          name: 'list_findings',
          description: 'Retrieve security findings from the last scan.',
          inputSchema: { type: 'object', properties: {
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Severity filter.' },
            service: { type: 'string', description: 'Service filter.' },
          } },
        },
        {
          name: 'describe_finding',
          description: 'Full details for a specific finding.',
          inputSchema: { type: 'object', properties: {
            findingId: { type: 'string', description: 'Finding instance ID.' },
          }, required: ['findingId'] },
        },
        {
          name: 'security_score',
          description: 'Current security score and grade.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'generate_report',
          description: 'Executive security assessment report.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'generate_cli_fix',
          description: 'CLI command sequence for a finding.',
          inputSchema: { type: 'object', properties: {
            findingId: { type: 'string', description: 'Finding ID.' },
          }, required: ['findingId'] },
        },
        {
          name: 'generate_terraform_fix',
          description: 'Terraform config for a finding.',
          inputSchema: { type: 'object', properties: {
            findingId: { type: 'string', description: 'Finding ID.' },
          }, required: ['findingId'] },
        },
        {
          name: 'verify_resource',
          description: 'Independent verification check for a finding.',
          inputSchema: { type: 'object', properties: {
            catalogId: { type: 'string', description: 'Catalog ID e.g. MCPS-S3-001' },
            resourceId: { type: 'string', description: 'Resource ID' },
          }, required: ['catalogId', 'resourceId'] },
        },
        {
          name: 'approve_remediation',
          description: 'Approve findings for remediation.',
          inputSchema: { type: 'object', properties: {
            findingIds: { type: 'array', items: { type: 'string' }, description: 'Finding IDs.' },
            approvedBy: { type: 'string', description: 'Approver identity.' },
            note: { type: 'string' },
          }, required: ['findingIds', 'approvedBy'] },
        },
        {
          name: 'execute_remediation',
          description: 'Execute approved remediations. Use dryRun=true to simulate.',
          inputSchema: { type: 'object', properties: {
            approvalId: { type: 'string', description: 'Approval ID.' },
            dryRun: { type: 'boolean', description: 'Simulate without executing.' },
          }, required: ['approvalId'] },
        },
        {
          name: 'rescan_environment',
          description: 'Trigger a fresh scan.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'list_history', description: 'Audit history.', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
        },
        {
          name: 'clear_history', description: 'Clear audit history.', inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'export_history', description: 'Export audit history.', inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['markdown', 'json'] } } },
        },
        {
          name: 'explain_last_action', description: 'Explain last tool invocation.', inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'verify_all', description: 'Verify all findings.', inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'generate_report_html', description: 'HTML report.', inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['executive', 'developer', 'evidence', 'audit'] } } },
        },
        {
          name: 'health',
          description: 'Query status of MCPShield and all registered plugins.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    };
  });

  async function performScanAndSave(services?: AwsService[]): Promise<ScanResult> {
    const state = await loadState();
    const scanId = shortId('scn');
    const startedAt = nowIso();

    // Scan through ALL registered plugins
    const sdkFindings = await pluginRegistry.scanAll();

    // Convert SDK findings back to types.Finding for lifecycle management
    const findings: Finding[] = sdkFindings.map((f: any) => ({
      findingId: f.catalogId ? `${f.catalogId}:${f.resource.id}` : f.id,
      catalogId: f.catalogId || f.capabilityId,
      title: f.title,
      severity: f.severity,
      service: f.resource.service,
      resource: {
        provider: 'aws',
        service: f.resource.service,
        type: f.resource.type,
        id: f.resource.id,
        arn: f.resource.nativeRef,
        region: f.resource.location,
        nativeRef: f.resource.nativeRef,
        location: f.resource.location,
      },
      description: f.description,
      evidence: f.evidence || {},
      riskScore: f.riskScore || 50,
      detectedAt: f.detectedAt || nowIso(),
      status: f.status || 'open',
    }));

    const completedAt = nowIso();
    const snapshots: any[] = sdkFindings.map((f: any) => ({
      service: f.resource.service, type: f.resource.type, id: f.resource.id,
      arn: f.resource.nativeRef, region: f.resource.location, attributes: {}, tags: {},
    }));

    const existingFindingsMap = new Map(state.allFindings.map((f) => [f.findingId, f]));
    const mergedFindings: Finding[] = [];

    for (const f of findings) {
      const existing = existingFindingsMap.get(f.findingId);
      if (existing) {
        mergedFindings.push({ ...f, status: existing.status === 'resolved' ? 'open' : existing.status });
      } else {
        mergedFindings.push(f);
      }
      existingFindingsMap.delete(f.findingId);
    }

    for (const [_, f] of existingFindingsMap) {
      mergedFindings.push({ ...f, status: f.status === 'open' || f.status === 'remediating' ? 'resolved' : f.status });
    }

    state.allFindings = mergedFindings;
    const score = computeSecurityScore(mergedFindings);

    const scanResult: ScanResult = {
      scanId, startedAt, completedAt,
      endpoint: '', region: '',
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
    let finding = allFindings.find((f) => f.findingId === findingId);
    if (finding) return finding;
    finding = allFindings.find((f) => f.resource.id === findingId);
    if (finding) return finding;
    finding = allFindings.find((f) => f.findingId.toLowerCase().includes(findingId.toLowerCase()));
    if (finding) return finding;
    return undefined;
  }

  // Map MCP tool names to RBAC action+resource pairs
  const TOOL_PERMISSIONS: Record<string, [string, string]> = {
    scan_environment: ['execute', 'scan'],
    list_findings: ['list', 'findings'],
    describe_finding: ['read', 'findings'],
    security_score: ['read', 'score'],
    generate_report: ['read', 'reports'],
    generate_cli_fix: ['read', 'remediation'],
    generate_terraform_fix: ['read', 'remediation'],
    verify_resource: ['read', 'findings'],
    approve_remediation: ['approve', 'remediation'],
    execute_remediation: ['execute', 'remediation'],
    rescan_environment: ['execute', 'scan'],
    list_history: ['read', 'audit-logs'],
    clear_history: ['admin', 'audit-logs'],
    export_history: ['export', 'audit-logs'],
    explain_last_action: ['read', 'audit-logs'],
    verify_all: ['read', 'findings'],
    generate_report_html: ['read', 'reports'],
    health: ['read', 'system'],
  };

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Received CallToolRequest for tool: ${name}`);

    try {
      const state = await loadState();

      // RBAC enforcement gate
      const perm = TOOL_PERMISSIONS[name];
      if (perm) {
        const userId = (args?.approvedBy as string) || 'anonymous';
        try {
          rbac.checkPermission(userId, perm[0]!, perm[1]!);
        } catch (e: any) {
          return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: e.message }, null, 2) }] };
        }
      }

      switch (name) {
        case 'scan_environment': {
          const startedAt = Date.now();
          eventBus.emit({ type: 'scan.started', timestamp: nowIso(), data: {} });
          await recordAudit(state, 'scan_started', 'Plugin-based scan initiated');
          const scanResult = await performScanAndSave();
          eventBus.emit({ type: 'scan.completed', timestamp: nowIso(), data: { scanId: scanResult.scanId, findings: scanResult.findings.length } });
          for (const f of scanResult.findings) {
            eventBus.emit({ type: 'finding.detected', timestamp: nowIso(), pluginId: 'cloud-aws', data: { findingId: f.findingId, catalogId: f.catalogId, severity: f.severity } });
          }
          await recordAudit(state, 'scan_completed', `Scan finished — ${scanResult.findings.length} findings across ${pluginRegistry.getAll().length} plugins`,
            { scanId: scanResult.scanId, resourcesScanned: scanResult.resourcesScanned, findingCount: scanResult.findings.length },
            scanResult.findings.map((f) => f.findingId), Date.now() - startedAt);
          return { content: [{ type: 'text', text: JSON.stringify(scanResult, null, 2) }] };
        }

        case 'list_findings': {
          const severity = args?.severity as Severity | undefined;
          const service = args?.service as string | undefined;
          let filtered = state.allFindings;
          if (severity) filtered = filtered.filter((f) => f.severity === severity);
          if (service) filtered = filtered.filter((f) => f.service === service);
          return { content: [{ type: 'text', text: JSON.stringify({ findings: filtered, total: filtered.length }, null, 2) }] };
        }

        case 'describe_finding': {
          const rawFindingId = args?.findingId as string;
          const finding = resolveFinding(rawFindingId, state.allFindings);
          if (!finding) throw new Error(`Finding "${rawFindingId}" not found. Run scan_environment.`);
          const entry = generateTerraformFix(finding);
          return { content: [{ type: 'text', text: JSON.stringify({ finding, catalog: entry }, null, 2) }] };
        }

        case 'security_score': {
          const score = computeSecurityScore(state.allFindings);
          return { content: [{ type: 'text', text: JSON.stringify(score, null, 2) }] };
        }

        case 'generate_report': {
          if (!state.lastScan) throw new Error('No scans performed yet. Run scan_environment first.');
          const score = computeSecurityScore(state.allFindings);
          const report = generateReport({ scanId: state.lastScan.scanId, endpoint: '', region: '', resourcesScanned: state.lastScan.resourcesScanned, score, allFindings: state.allFindings });
          return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
        }

        case 'generate_cli_fix': {
          const rawFindingId = args?.findingId as string;
          const finding = resolveFinding(rawFindingId, state.allFindings);
          if (!finding) throw new Error(`Finding "${rawFindingId}" not found.`);
          const fix = generateAwsCliFix(finding);
          return { content: [{ type: 'text', text: JSON.stringify(fix, null, 2) }] };
        }

        case 'generate_terraform_fix': {
          const rawFindingId = args?.findingId as string;
          const finding = resolveFinding(rawFindingId, state.allFindings);
          if (!finding) throw new Error(`Finding "${rawFindingId}" not found.`);
          const fix = generateTerraformFix(finding);
          return { content: [{ type: 'text', text: JSON.stringify(fix, null, 2) }] };
        }

        case 'approve_remediation': {
          const rawFindingIds = args?.findingIds as string[];
          const approvedBy = args?.approvedBy as string;
          const note = args?.note as string | undefined;
          if (!Array.isArray(rawFindingIds) || rawFindingIds.length === 0) throw new Error('findingIds array cannot be empty.');
          const resolvedFindingIds: string[] = [];
          for (const fid of rawFindingIds) {
            const finding = resolveFinding(fid, state.allFindings);
            if (!finding) throw new Error(`Finding ID "${fid}" was not found.`);
            if (finding.status !== 'open') throw new Error(`Finding ID "${fid}" is not open (status: ${finding.status}).`);
            resolvedFindingIds.push(finding.findingId);
          }
          const approvalId = shortId('apr');
          const approval: Approval = { approvalId, findingIds: resolvedFindingIds, requestedBy: approvedBy, createdAt: nowIso(), status: 'approved', approvedBy, decidedAt: nowIso(), note };
          state.approvals[approvalId] = approval;
          await saveState(state);
          return { content: [{ type: 'text', text: JSON.stringify(approval, null, 2) }] };
        }

        case 'execute_remediation': {
          const approvalId = args?.approvalId as string;
          const dryRun = args?.dryRun === true;
          const approval = state.approvals[approvalId];
          if (!approval) throw new Error(`Approval entry "${approvalId}" not found.`);
          if (!dryRun && approval.status !== 'approved') throw new Error(`Approval "${approvalId}" not in approved state.`);

          const startedAt = Date.now();
          eventBus.emit({ type: 'remediation.requested', timestamp: nowIso(), data: { approvalId, findingIds: approval.findingIds, dryRun } });
          await recordAudit(state, dryRun ? 'remediation_dry_run' : 'remediation_executed',
            dryRun ? `DRY RUN: Planned ${approval.findingIds.length} remediations` : `Executing ${approval.findingIds.length} remediations`,
            { approvalId, findingIds: approval.findingIds, dryRun }, approval.findingIds);

          const results: RemediationResult[] = [];
          const estimatedChanges: any[] = [];
          const awsPlugin = pluginRegistry.get('cloud-aws');

          for (const fid of approval.findingIds) {
            const findingIndex = state.allFindings.findIndex((f) => f.findingId === fid);
            if (findingIndex === -1) {
              results.push({ findingId: fid, catalogId: 'MCPS-UNKNOWN', success: false, message: 'Finding missing.', executedAt: nowIso() });
              continue;
            }
            const finding = state.allFindings[findingIndex]!;
            const action = mapFindingToRemediation(finding);

            if (dryRun) {
              estimatedChanges.push({ findingId: finding.findingId, catalogId: finding.catalogId, title: finding.title, resource: finding.resource.id, operation: action?.operation || 'unknown', description: action?.description || 'No automatic remediation', duration: '~5s', risk: finding.severity === 'critical' ? 'High' : finding.severity === 'high' ? 'Medium' : 'Low' });
              results.push({ findingId: fid, catalogId: finding.catalogId, success: true, message: `[DRY RUN] Would apply: ${action?.description || 'unknown'}`, executedAt: nowIso() });
              continue;
            }

            if (finding.status !== 'open') {
              results.push({ findingId: fid, catalogId: finding.catalogId, success: true, message: `Already resolved (${finding.status}).`, executedAt: nowIso() });
              continue;
            }

            finding.status = 'remediating';
            await saveState(state);

            if (!action) {
              finding.status = 'open';
              await saveState(state);
              results.push({ findingId: fid, catalogId: finding.catalogId, success: false, message: `No remediation mapping for ${finding.catalogId}.`, executedAt: nowIso() });
              continue;
            }

            const beforeState: Record<string, unknown> = {};
            try {
              const before = awsPlugin ? await awsPlugin.verify(finding.catalogId, finding.resource.id) : null;
              if (before) beforeState.details = before.details;
            } catch {}

            const res = await executeRemediationAction(action);
            results.push(res);
            if (res.success) {
              finding.status = 'resolved';
              eventBus.emit({ type: 'remediation.executed', timestamp: nowIso(), pluginId: 'cloud-aws', data: { findingId: finding.findingId, catalogId: finding.catalogId } });
            } else {
              finding.status = 'open';
              eventBus.emit({ type: 'remediation.failed', timestamp: nowIso(), pluginId: 'cloud-aws', data: { findingId: finding.findingId, catalogId: finding.catalogId, message: res.message } });
            }
            await saveState(state);

            if (res.success && awsPlugin) {
              const verificationResult = await awsPlugin.verify(finding.catalogId, finding.resource.id);
              if (verificationResult) {
                await recordEvidence(state, finding.findingId, finding.catalogId, finding.resource.id, finding.severity, beforeState, { details: verificationResult.details }, verificationResult.verified ? 'passed' : 'failed', 'Plugin verification', verificationResult.verificationCommand || '', action.operation);
              }
            }
          }

          if (!dryRun) {
            approval.status = 'executed';
            state.approvals[approvalId] = approval;
            state.remediationResults.push(...results);
            const verifications: any[] = [];
            if (awsPlugin) {
              for (const r of results) {
                if (!r.success) continue;
                const f = state.allFindings.find((x) => x.findingId === r.findingId);
                if (!f) continue;
                const v = await awsPlugin.verify(f.catalogId, f.resource.id);
                if (v) {
                  verifications.push(v);
                  eventBus.emit({ type: 'verification.completed', timestamp: nowIso(), pluginId: 'cloud-aws', data: { findingId: f.findingId, catalogId: f.catalogId, verified: v.verified } });
                }
              }
            }
            const score = computeSecurityScore(state.allFindings);
            await recordAudit(state, 'remediation_verified', `Verification: ${verifications.filter((v: any) => v.verified).length}/${verifications.length} passed`,
              { approvalId, verificationCount: verifications.length, passedCount: verifications.filter((v: any) => v.verified).length }, approval.findingIds, Date.now() - startedAt);
            return { content: [{ type: 'text', text: JSON.stringify({ approvalId, results, verifications, score }, null, 2) }] };
          }

          return { content: [{ type: 'text', text: JSON.stringify({ dryRun: true, approvalId, estimatedChanges, totalFindings: estimatedChanges.length, estimatedDuration: `${estimatedChanges.length * 5}s`, note: 'No AWS calls executed.' }, null, 2) }] };
        }

        case 'rescan_environment': {
          const scanResult = await performScanAndSave();
          return { content: [{ type: 'text', text: JSON.stringify(scanResult, null, 2) }] };
        }

        case 'verify_resource': {
          const catalogId = args?.catalogId as string;
          const resourceId = args?.resourceId as string;
          if (!catalogId || !resourceId) throw new Error('Both catalogId and resourceId are required.');
          const awsPlugin = pluginRegistry.get('cloud-aws');
          if (!awsPlugin) throw new Error('cloud-aws plugin not loaded.');
          const verification = await awsPlugin.verify(catalogId, resourceId);
          if (!verification) throw new Error(`No verifier for catalog "${catalogId}".`);
          return { content: [{ type: 'text', text: JSON.stringify(verification, null, 2) }] };
        }

        case 'list_history': {
          const limit = args?.limit as number | undefined;
          let entries = state.auditHistory;
          if (limit && limit > 0) entries = entries.slice(-limit);
          return { content: [{ type: 'text', text: JSON.stringify({ entries, total: state.auditHistory.length }, null, 2) }] };
        }

        case 'clear_history': {
          state.auditHistory = [];
          await saveState(state);
          return { content: [{ type: 'text', text: JSON.stringify({ message: 'Audit history cleared.', timestamp: nowIso() }, null, 2) }] };
        }

        case 'export_history': {
          const format = (args?.format as string) || 'markdown';
          const entries = state.auditHistory;
          if (format === 'json') return { content: [{ type: 'text', text: JSON.stringify({ entries, total: entries.length, exportedAt: nowIso() }, null, 2) }] };
          const lines = entries.map((e: any) => `| ${new Date(e.timestamp).toLocaleTimeString()} | ${e.action} | ${e.summary} | ${e.duration ? `${e.duration}ms` : '-'} |`);
          return { content: [{ type: 'text', text: `# MCPShield Audit History\n\nTotal: ${entries.length}\n\n| Time | Action | Summary | Duration |\n|------|--------|---------|----------|\n${lines.join('\n')}` }] };
        }

        case 'explain_last_action': {
          const traces = state.toolTraces;
          if (traces.length === 0) return { content: [{ type: 'text', text: JSON.stringify({ message: 'No invocations recorded.' }, null, 2) }] };
          const last = traces[traces.length - 1]!;
          return { content: [{ type: 'text', text: JSON.stringify({ explanation: `The AI invoked "${last.toolName}".`, toolName: last.toolName, reason: last.reason, input: last.input, duration: `${last.duration}ms`, success: last.success, result: last.result, timestamp: last.timestamp }, null, 2) }] };
        }

        case 'verify_all': {
          const awsPlugin = pluginRegistry.get('cloud-aws');
          const results: any[] = [];
          if (awsPlugin) {
            for (const f of state.allFindings) {
              const v = await awsPlugin.verify(f.catalogId, f.resource.id).catch(() => null);
              if (v) results.push({ findingId: f.findingId, catalogId: f.catalogId, resourceId: f.resource.id, verified: v.verified, command: v.verificationCommand });
            }
          }
          return { content: [{ type: 'text', text: JSON.stringify({ total: results.length, passed: results.filter((r) => r.verified).length, failed: results.filter((r) => !r.verified).length, results }, null, 2) }] };
        }

        case 'generate_report_html': {
          if (!state.lastScan) throw new Error('No scans performed yet.');
          const format = (args?.format as string) || 'executive';
          const score = computeSecurityScore(state.allFindings);
          const report = generateReport({ scanId: state.lastScan.scanId, endpoint: '', region: '', resourcesScanned: state.lastScan.resourcesScanned, score, allFindings: state.allFindings });
          const openF = state.allFindings.filter((f) => f.status === 'open');
          const title = format === 'developer' ? 'Developer Report' : format === 'evidence' ? 'Evidence Report' : format === 'audit' ? 'Audit Report' : 'Executive Report';
          const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:sans-serif;max-width:960px;margin:40px auto;color:#333}h1{color:#00d4aa}.score{font-size:48px;font-weight:bold;text-align:center;padding:20px;background:#eee;border-radius:12px}.badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:bold}</style></head><body><h1>${title}</h1><div class="score">${score.score}/100 (${score.grade})</div><p>Open: ${score.totalFindings} | Resolved: ${score.resolvedCount}</p>${openF.map((f) => `<p><span class="badge">${f.severity}</span> ${f.findingId}: ${f.title}</p>`).join('')}</body></html>`;
          return { content: [{ type: 'text', text: html }] };
        }

        case 'health': {
          const pluginHealths = await Promise.all(
            pluginRegistry.getAll().map(async (p) => {
              try { return { id: p.id, health: await p.health() }; }
              catch (e: any) { return { id: p.id, health: { reachable: false, provider: p.id, message: e.message } }; }
            })
          );
          return { content: [{ type: 'text', text: JSON.stringify({
            status: pluginHealths.some((h) => h.health.reachable) ? 'ok' : 'degraded',
            version: '1.0.0',
            uptimeSeconds: process.uptime(),
            plugins: pluginHealths,
            lastScanId: state.lastScan?.scanId,
          }, null, 2) }] };
        }

        default:
          throw new Error(`Tool not found: ${name}`);
      }
    } catch (err: any) {
      logger.error(`Error executing tool ${name}: ${err.message}`, err);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: err.message }, null, 2) }] };
    }
  });

  return mcpServer;
}

export { initializePlugins, pluginRegistry };
