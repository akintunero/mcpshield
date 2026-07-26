import { App } from '@slack/bolt';
import { getConfig, requireSlack } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { createMcpClient } from './mcp-client.js';
import { getLlmProvider } from './llm.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const logger = createLogger('agent:slack');

let mcpClient: Client | null = null;
let lastPendingApprovalId: string | null = null;

const SEV_EMOJI: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
const SEV_BADGE: Record<string, string> = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

function slackSev(severity: string): string {
  const e = SEV_EMOJI[severity] || '⚪';
  const b = SEV_BADGE[severity] || severity.toUpperCase();
  return `${e} *${b}*`;
}

function formatFindingsSlack(findings: any[]): string {
  if (findings.length === 0) return '_No findings open. Your posture is secure._';
  return findings.map((f: any) =>
    `• ${slackSev(f.severity)} \`${f.findingId}\` — *${f.title}* on \`${f.resource.type}:${f.resource.id}\` (Risk: ${f.riskScore})`
  ).join('\n');
}

function formatScoreSection(score: any): string {
  const cat = score.categoryBreakdown || {};
  return (
    `*Security Score*: ${score.score}/100 (Grade *${score.grade}*)\n` +
    `*Improvement*: ${score.delta ? `+${score.delta} points` : 'N/A (baseline scan)'}\n` +
    `*Resolved*: ${score.resolvedCount}  |  *Remaining*: ${score.remainingCount}\n\n` +
    `*Category Breakdown:*\n` +
    `  ${SEV_EMOJI.critical} Public Exposure: ${cat.publicExposure ?? '-'}/100\n` +
    `  ${SEV_EMOJI.high} Identity & Access: ${cat.identity ?? '-'}/100\n` +
    `  ${SEV_EMOJI.medium} Encryption: ${cat.encryption ?? '-'}/100\n` +
    `  ${SEV_EMOJI.high} Secrets: ${cat.secrets ?? '-'}/100\n` +
    `  ${SEV_EMOJI.medium} Recovery: ${cat.recovery ?? '-'}/100\n` +
    `  ${SEV_EMOJI.low} Logging: ${cat.logging ?? '-'}/100\n\n` +
    `*Open Findings:* 🔴 ${score.breakdown.critical} | 🟠 ${score.breakdown.high} | 🟡 ${score.breakdown.medium} | 🟢 ${score.breakdown.low}`
  );
}

function formatHeader(title: string): string {
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡 *MCPShield* — ${title}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function formatFooter(commands: string[]): string {
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n_Commands:_\n${commands.map((c) => `  • \`@Shield ${c}\``).join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

export async function startSlackBot() {
  const config = getConfig();
  const slackConfig = requireSlack(config);

  const app = new App({
    token: slackConfig.botToken,
    signingSecret: slackConfig.signingSecret,
    appToken: slackConfig.appToken,
    socketMode: true,
  });

  mcpClient = await createMcpClient();
  const llmProvider = getLlmProvider();

  logger.info('Slack Bolt application initialized in Socket Mode.');

  app.event('app_mention', async ({ event, say }) => {
    const rawText = event.text.replace(/<@U[A-Z0-9]+>/g, '').trim();
    logger.info(`Received Slack bot mention: "${rawText}" in channel ${event.channel}`);

    if (config.slack.allowedChannel && event.channel !== config.slack.allowedChannel) return;

    try {
      if (!mcpClient) throw new Error('MCP Client is not connected to the MCP Server.');

      const text = rawText.toLowerCase().replace(/\s+/g, ' ');

      // ── SCAN ──
      if (text === 'scan environment' || text === 'scan' || text === 'scan aws') {
        await say(`${formatHeader('Cloud Security Assessment')}\n\n⏳ *Scanning AWS environment via MCP tools...*`);

        const startTime = Date.now();
        const res = await mcpClient.callTool({ name: 'scan_environment', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        const score = result.score || { score: 0, grade: 'N/A', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } };

        await say(
          `${formatHeader('Cloud Security Assessment')}\n\n` +
          `✅ *Scan Completed!*\n\n` +
          `*Security Score*: ${score.score}/100 (Grade *${score.grade}*)\n` +
          `*Resources Scanned*: ${result.resourcesScanned}\n` +
          `*Time*: ${elapsed}s\n\n` +
          `*Findings:*\n` +
          `${result.findings.map((f: any) =>
            `  ${SEV_EMOJI[f.severity] || '⚪'} \`${f.findingId}\` — ${f.title}`
          ).join('\n') || '_No open findings_'}\n\n` +
          `${formatFooter(['explain MCPS-S3-001', 'plan', 'remediate --dry-run', 'security score'])}`
        );
        return;
      }

      // ── LIST FINDINGS ──
      if (['show findings', 'findings', 'list findings', 'list all'].includes(text)) {
        const res = await mcpClient.callTool({ name: 'list_findings', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader('Open Vulnerabilities Inventory')}\n\n` +
          `*Total*: ${result.total} findings\n\n` +
          `${formatFindingsSlack(result.findings)}\n\n` +
          `${formatFooter(['explain finding <id>', 'fix finding <id>', 'security score'])}`
        );
        return;
      }

      // ── SHOW CRITICAL ──
      if (['show critical', 'critical'].includes(text)) {
        const res = await mcpClient.callTool({ name: 'list_findings', arguments: { severity: 'critical' } });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader('Critical Vulnerabilities Only')}\n\n` +
          `*Total*: ${result.total} critical findings\n\n` +
          `${formatFindingsSlack(result.findings)}\n\n` +
          `👉 *Batch fix all critical:* \`@Shield fix all critical\``
        );
        return;
      }

      // ── EXPLAIN FINDING ──
      if (text.startsWith('explain finding')) {
        const findingId = rawText.substring('explain finding'.length).trim();
        await say(`${formatHeader('Finding Analysis')}\n\n🧠 *Analyzing \`${findingId}\` using generative AI...*`);

        const res = await mcpClient.callTool({ name: 'describe_finding', arguments: { findingId } });
        const result = JSON.parse((res as any).content[0].text);

        const systemPrompt = `You are a Senior Cloud Security Architect and SOC Analyst.
Explain this finding to a developer in a concise, educational, and professional manner.
State the Technical Impact, Business Impact, and Attack Scenario.
Do NOT output code blocks. End with remediation options.`;
        const llmResponse = await llmProvider.complete({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Please explain this finding: ${JSON.stringify(result, null, 2)}` },
          ],
        });

        const f = result.finding;
        await say(
          `${formatHeader(`Finding: ${f.findingId}`)}\n\n` +
          `${SEV_EMOJI[f.severity]} *Severity*: ${f.severity.toUpperCase()}\n` +
          `*Title*: ${f.title}\n` +
          `*Resource*: \`${f.resource.type}:${f.resource.id}\`\n` +
          `*Risk Score*: ${f.riskScore}/100\n\n` +
          `*Description:*\n${f.description}\n\n` +
          `*AI Analysis:*\n${llmResponse.content}\n\n` +
          `${formatFooter(['fix finding ' + findingId, 'generate terraform ' + findingId, 'generate aws-cli ' + findingId])}`
        );
        return;
      }

      // ── GENERATE TERRAFORM ──
      if (text.startsWith('generate terraform finding') || text.startsWith('generate terraform')) {
        const findingId = rawText.replace(/generate terraform finding/i, '').replace(/generate terraform/i, '').trim();
        const res = await mcpClient.callTool({ name: 'generate_terraform_fix', arguments: { findingId } });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader(`Terraform Remediation: ${findingId}`)}\n\n` +
          `\`\`\`hcl\n${result.content}\n\`\`\`\n` +
          `_Summary: ${result.summary}_`
        );
        return;
      }

      // ── GENERATE AWS CLI ──
      if (text.startsWith('generate aws-cli finding') || text.startsWith('generate aws-cli')) {
        const findingId = rawText.replace(/generate aws-cli finding/i, '').replace(/generate aws-cli/i, '').trim();
        const res = await mcpClient.callTool({ name: 'generate_cli_fix', arguments: { findingId } });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader(`AWS CLI Remediation: ${findingId}`)}\n\n` +
          `\`\`\`bash\n${result.content}\n\`\`\`\n` +
          `_Summary: ${result.summary}_`
        );
        return;
      }

      // ── DRY RUN ──
      if (text.includes('remediate --dry-run') || text.includes('dry-run') || text.includes('dry run') || text === 'plan') {
        // Resolve all open findings for planning
        const listRes = await mcpClient.callTool({ name: 'list_findings', arguments: {} });
        const list = JSON.parse((listRes as any).content[0].text);
        const openIds = list.findings.filter((f: any) => f.status === 'open').map((f: any) => f.findingId);
        if (openIds.length === 0) {
          await say('✅ No open findings to remediate. Run `@Shield scan aws` first.');
          return;
        }

        // Create a temporary approval for dry-run
        const aprRes = await mcpClient.callTool({
          name: 'approve_remediation',
          arguments: { findingIds: openIds, approvedBy: 'slack-user', note: 'Dry-run planning' },
        });
        const approval = JSON.parse((aprRes as any).content[0].text);
        lastPendingApprovalId = approval.approvalId;

        const dryRes = await mcpClient.callTool({
          name: 'execute_remediation',
          arguments: { approvalId: approval.approvalId, dryRun: true },
        });
        const plan = JSON.parse((dryRes as any).content[0].text);

        const changes = plan.estimatedChanges || [];
        await say(
          `${formatHeader('Remediation Plan (DRY RUN)')}\n\n` +
          `📋 *Estimated Changes:* ${changes.length} resources\n` +
          `⏱ *Estimated Duration:* ${plan.estimatedDuration || '~30s'}\n` +
          `📊 *Estimated Risk Reduction:* ${plan.estimatedRisk || 'Moderate'}\n\n` +
          `*Planned Operations:*\n${changes.map((c: any) =>
            `  • ${SEV_EMOJI[c.catalogId?.includes('CRITICAL') ? 'critical' : 'high'] || '⚪'} \`${c.findingId}\` — ${c.description}`
          ).join('\n') || '_No operations planned_'}\n\n` +
          `*Note:* No AWS calls were executed. This is a simulation.\n\n` +
          `👉 *To execute:* \`@Shield fix all\` then \`@Shield approve\``
        );
        return;
      }

      // ── FIX FINDING <id> (exact, before generic pattern) ──
      if (text.startsWith('fix finding') || text.startsWith('remediate finding')) {
        const rawFindingId = text.startsWith('fix finding')
          ? rawText.substring(rawText.toLowerCase().indexOf('fix finding') + 'fix finding'.length).trim()
          : rawText.substring(rawText.toLowerCase().indexOf('remediate finding') + 'remediate finding'.length).trim();
        if (!rawFindingId) {
          await say('Usage: `@Shield fix finding MCPS-S3-001`');
          return;
        }
        const stateRes = await mcpClient.callTool({ name: 'list_findings', arguments: {} });
        const stateResult = JSON.parse((stateRes as any).content[0].text);
        const resolvedFinding = stateResult.findings.find((f: any) =>
          f.findingId === rawFindingId || f.resource.id === rawFindingId || f.findingId.toLowerCase().includes(rawFindingId.toLowerCase()));
        if (!resolvedFinding) {
          await say(`❌ Finding "${rawFindingId}" not found. Try \`@Shield list findings\` first.`);
          return;
        }
        const findingId = resolvedFinding.findingId;
        await say(`${formatHeader('Remediation Authorization')}\n\n🔑 *Authorizing fix for \`${findingId}\`...*`);

        const res = await mcpClient.callTool({
          name: 'approve_remediation',
          arguments: { findingIds: [findingId], approvedBy: event.user || 'Slack User', note: 'Requested via Slack.' },
        });
        const approval = JSON.parse((res as any).content[0].text);
        lastPendingApprovalId = approval.approvalId;

        let tfFix = '_No Terraform remediation available_';
        let cliFix = '_No AWS CLI remediation available_';
        try {
          const tfRes = await mcpClient.callTool({ name: 'generate_terraform_fix', arguments: { findingId } });
          tfFix = `\`\`\`hcl\n${JSON.parse((tfRes as any).content[0].text).content}\n\`\`\``;
        } catch {}
        try {
          const cliRes = await mcpClient.callTool({ name: 'generate_cli_fix', arguments: { findingId } });
          cliFix = `\`\`\`bash\n${JSON.parse((cliRes as any).content[0].text).content}\n\`\`\``;
        } catch {}

        await say(
          `${formatHeader('Remediation Authorized')}\n\n` +
          `⚠️ *Status:* Approved (Pending Execution)\n` +
          `🔑 *Approval ID:* \`${approval.approvalId}\`\n` +
          `🎯 *Target:* \`${findingId}\`\n\n` +
          `🏗️ *Terraform Fix (review only — NOT executed):*\n${tfFix}\n\n` +
          `💻 *AWS CLI Fix (review only — NOT executed):*\n${cliFix}\n\n` +
          `⚠️ *No AWS calls have been executed.*\n\n` +
          `👉 *To execute the fix, type: \`@Shield approve\`*`
        );
        return;
      }

      // ── REMEDIATE <finding-id> or fix <severity> ──
      const remediateMatch = text.match(/^(?:fix|remediate)\s+(\S+)$/i);
      if (remediateMatch) {
        const rawFindingId = remediateMatch[1]!;
        const stateRes = await mcpClient.callTool({ name: 'list_findings', arguments: {} });
        const stateResult = JSON.parse((stateRes as any).content[0].text);
        const resolvedFinding = stateResult.findings.find((f: any) =>
          f.findingId === rawFindingId || f.resource.id === rawFindingId ||
          f.findingId.toLowerCase().includes(rawFindingId.toLowerCase()) ||
          f.severity === rawFindingId.toLowerCase());

        if (!resolvedFinding) {
          if (['critical', 'high', 'medium', 'low'].includes(rawFindingId.toLowerCase())) {
            const sev = rawFindingId.toLowerCase();
            const filtered = stateResult.findings.filter((f: any) => f.severity === sev && f.status === 'open');
            if (filtered.length === 0) {
              await say(`✅ No open *${sev}* findings.`);
              return;
            }
            const ids = filtered.map((f: any) => f.findingId);
            const res = await mcpClient.callTool({
              name: 'approve_remediation',
              arguments: { findingIds: ids, approvedBy: event.user || 'Slack User', note: `Batch fix ${sev}` },
            });
            const approval = JSON.parse((res as any).content[0].text);
            lastPendingApprovalId = approval.approvalId;
            await say(
              `${formatHeader('Batch Remediation Authorized')}\n\n` +
              `⚠️ *${ids.length} ${sev} findings approved*\n` +
              `🔑 *Approval ID:* \`${approval.approvalId}\`\n\n` +
              `*Targets:*\n${ids.map((id: string) => `  • \`${id}\``).join('\n')}\n\n` +
              `👉 *To execute: \`@Shield approve\`*`
            );
            return;
          }
          await say(`❌ Finding "${rawFindingId}" not found. Try \`@Shield list findings\` first.`);
          return;
        }

        const findingId = resolvedFinding.findingId;
        await say(`${formatHeader('Remediation Authorization')}\n\n🔑 *Authorizing fix for \`${findingId}\`...*`);

        const res = await mcpClient.callTool({
          name: 'approve_remediation',
          arguments: { findingIds: [findingId], approvedBy: event.user || 'Slack User', note: 'Requested via Slack.' },
        });
        const approval = JSON.parse((res as any).content[0].text);
        lastPendingApprovalId = approval.approvalId;

        let tfFix = '_No Terraform remediation available_';
        let cliFix = '_No AWS CLI remediation available_';
        try {
          const tfRes = await mcpClient.callTool({ name: 'generate_terraform_fix', arguments: { findingId } });
          tfFix = `\`\`\`hcl\n${JSON.parse((tfRes as any).content[0].text).content}\n\`\`\``;
        } catch {}
        try {
          const cliRes = await mcpClient.callTool({ name: 'generate_cli_fix', arguments: { findingId } });
          cliFix = `\`\`\`bash\n${JSON.parse((cliRes as any).content[0].text).content}\n\`\`\``;
        } catch {}

        await say(
          `${formatHeader('Remediation Authorized')}\n\n` +
          `⚠️ *Status:* Approved (Pending Execution)\n` +
          `🔑 *Approval ID:* \`${approval.approvalId}\`\n` +
          `🎯 *Target:* \`${findingId}\`\n\n` +
          `🏗️ *Terraform Fix (review only — NOT executed):*\n${tfFix}\n\n` +
          `💻 *AWS CLI Fix (review only — NOT executed):*\n${cliFix}\n\n` +
          `⚠️ *No AWS calls have been executed.*\n\n` +
          `👉 *To execute the fix, type: \`@Shield approve\`*`
        );
        return;
      }

      // ── FIX ALL ──
      if (text === 'fix all critical' || text === 'fix critical' || text === 'fix all') {
        const severity = text.includes('critical') ? 'critical' : undefined;
        await say(`${formatHeader('Batch Remediation')}\n\n🔑 *Querying open findings...*`);
        const listRes = await mcpClient.callTool({ name: 'list_findings', arguments: severity ? { severity } : {} });
        const list = JSON.parse((listRes as any).content[0].text);
        const openIds = list.findings.filter((f: any) => f.status === 'open').map((f: any) => f.findingId);
        if (openIds.length === 0) {
          await say('✅ No open findings to remediate.');
          return;
        }

        const res = await mcpClient.callTool({
          name: 'approve_remediation',
          arguments: { findingIds: openIds, approvedBy: event.user || 'Slack User', note: 'Batch authorize.' },
        });
        const approval = JSON.parse((res as any).content[0].text);
        lastPendingApprovalId = approval.approvalId;

        await say(
          `${formatHeader('Batch Authorization')}\n\n` +
          `⚠️ *${openIds.length} findings approved for remediation*\n` +
          `🔑 *Approval ID:* \`${approval.approvalId}\`\n\n` +
          `*Targets:*\n${openIds.map((id: string) => `  • \`${id}\``).join('\n')}\n\n` +
          `👉 *To execute: \`@Shield approve\`*`
        );
        return;
      }

      // ── APPROVE ──
      if (text === 'approve') {
        if (!lastPendingApprovalId) {
          await say('❌ No pending authorizations. Run `@Shield fix finding <id>` first.');
          return;
        }

        await say(`${formatHeader('Executing Remediation')}\n\n🚀 *Applying fixes for \`${lastPendingApprovalId}\`...*`);

        const res = await mcpClient.callTool({
          name: 'execute_remediation',
          arguments: { approvalId: lastPendingApprovalId },
        });
        const result = JSON.parse((res as any).content[0].text);
        lastPendingApprovalId = null;

        const successCount = result.results.filter((r: any) => r.success).length;
        const failCount = result.results.filter((r: any) => !r.success).length;
        const verifyCount = (result.verifications || []).filter((v: any) => v.verified).length;

        const resultLines = result.results.map((r: any) =>
          `  • \`${r.findingId}\`: ${r.success ? '✅ *Fixed*' : '❌ *Failed*'} — ${r.message}`
        ).join('\n');

        await say(
          `${formatHeader('Remediation Complete')}\n\n` +
          `📊 *Results:* ${successCount} success, ${failCount} failed\n` +
          `🔍 *Verification:* ${verifyCount}/${result.results.length} passed\n` +
          `📈 *New Score:* ${result.score.score}/100 (Grade *${result.score.grade}*)\n` +
          (result.score.delta ? `📊 *Improvement:* +${result.score.delta} points\n` : '') +
          `\n*Details:*\n${resultLines}\n\n` +
          `${formatFooter(['rescan', 'security score', 'generate report'])}`
        );
        return;
      }

      // ── RESCAN ──
      if (text === 'rescan') {
        await say(`${formatHeader('Re-scanning')}\n\n⏳ *Verifying remediations...*`);
        const res = await mcpClient.callTool({ name: 'rescan_environment', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);
        const score = result.score || {};
        await say(
          `${formatHeader('Re-scan Complete')}\n\n` +
          `✅ *Scan finished.* Open findings: *${result.findings.length}*\n` +
          `*Score*: ${score.score}/100 (Grade *${score.grade}*)\n\n` +
          `${formatFooter(['security score', 'generate report'])}`
        );
        return;
      }

      // ── SECURITY SCORE ──
      if (['security score', 'score', 'security'].includes(text)) {
        const res = await mcpClient.callTool({ name: 'security_score', arguments: {} });
        const score = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader('Security Posture Assessment')}\n\n` +
          `${formatScoreSection(score)}\n\n` +
          `${formatFooter(['scan aws', 'list findings', 'generate report'])}`
        );
        return;
      }

      // ── GENERATE REPORT ──
      if (text === 'generate report' || text === 'report') {
        await say(`${formatHeader('Generating Report')}\n\n📄 *Compiling executive security assessment...*`);
        const res = await mcpClient.callTool({ name: 'generate_report', arguments: {} });
        const report = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader('Executive Security Report')}\n\n` +
          `*Score*: ${report.score.score}/100 (Grade *${report.score.grade}*)\n` +
          `*Report ID*: \`${report.reportId}\`\n\n` +
          `*Top Risks:*\n${report.topRisks.map((r: any) =>
            `  • ${SEV_EMOJI[r.severity] || '⚪'} \`${r.findingId}\` — ${r.title} (Risk: ${r.riskScore})`
          ).join('\n') || '_None_'}\n\n` +
          `*Executive Summary:*\n${report.executiveSummary}\n\n` +
          `*Recommendations:*\n${report.recommendations.map((r: string) => `  • ${r}`).join('\n')}\n\n` +
          `${report.markdown.length > 2800
            ? `📄 _Full report generated. Use \`@Shield history\` or \`@Shield export audit\` for the complete output._`
            : report.markdown}`
        );
        return;
      }

      // ── HISTORY ──
      if (text === 'history' || text === 'list history' || text === 'audit') {
        const res = await mcpClient.callTool({ name: 'list_history', arguments: { limit: 20 } });
        const result = JSON.parse((res as any).content[0].text);
        const entries = result.entries || [];
        await say(
          `${formatHeader('Audit History')}\n\n` +
          `*Total Events*: ${result.total}\n` +
          `*Recent:*\n${entries.map((e: any) =>
            `  • \`${new Date(e.timestamp).toLocaleTimeString()}\` ${e.action.replace(/_/g, ' ')} — ${e.summary}`
          ).join('\n') || '_No history yet_'}\n\n` +
          `${formatFooter(['export audit', 'clear history'])}`
        );
        return;
      }

      // ── EXPORT AUDIT ──
      if (text === 'export audit' || text === 'export history') {
        const res = await mcpClient.callTool({ name: 'export_history', arguments: { format: 'markdown' } });
        const content = (res as any).content[0].text;
        await say(
          `${formatHeader('Audit History Export')}\n\n` +
          (content.length > 2800 ? content.substring(0, 2700) + '\n..._truncated for Slack_' : content)
        );
        return;
      }

      // ── CLEAR HISTORY ──
      if (text === 'clear history') {
        await mcpClient.callTool({ name: 'clear_history', arguments: {} });
        await say('✅ Audit history cleared.');
        return;
      }

      // ── VERIFY ──
      if (text.startsWith('verify')) {
        const parts = rawText.split(/\s+/);
        if (parts.length >= 3) {
          const [, catalogId, resourceId] = parts;
          const res = await mcpClient.callTool({ name: 'verify_resource', arguments: { catalogId, resourceId } });
          const v = JSON.parse((res as any).content[0].text);
          await say(
            `${formatHeader('Resource Verification')}\n\n` +
            `*Catalog*: \`${v.catalogId}\`\n` +
            `*Resource*: \`${v.resourceId}\`\n` +
            `*Status*: ${v.verified ? '✅ *PASSED*' : '❌ *FAILED*'}\n\n` +
            `*AWS CLI Command:*\n\`\`\`bash\n${v.verificationCommand}\n\`\`\`\n` +
            `*Expected Before:* ${v.expectedBefore}\n` +
            `*Expected After:* ${v.expectedAfter}`
          );
        } else {
          await say('Usage: `@Shield verify MCPS-S3-001 customer-files`');
        }
        return;
      }

      // ── EXPLAIN LAST ACTION ──
      if (text === 'explain last action' || text === 'last action' || text === 'trace') {
        const res = await mcpClient.callTool({ name: 'explain_last_action', arguments: {} });
        const t = JSON.parse((res as any).content[0].text);
        await say(
          `${formatHeader('Last Tool Invocation')}\n\n` +
          `*Tool*: \`${t.toolName}\`\n` +
          `*Reason*: ${t.reason}\n` +
          `*Duration*: ${t.duration}\n` +
          `*Success*: ${t.success ? '✅ Yes' : '❌ No'}\n\n` +
          `*AWS SDK Operation*: \`${t.awsSdkOperation}\`\n` +
          `*AWS CLI Equivalent*: \`${t.awsCliEquivalent}\`\n\n` +
          `*Input:*\n\`\`\`json\n${JSON.stringify(t.input, null, 2)}\n\`\`\``
        );
        return;
      }

      // ── EXPLAIN FINDING ELI5 ──
      const eli5Match = text.match(/^(?:explain finding|explain) (\S+) (?:for a beginner|eli5|simple|beginner)$/i);
      if (eli5Match) {
        const findingId = eli5Match[1]!;
        await say(`📚 *Generating beginner-friendly explanation for \`${findingId}\`...*`);
        try {
          const res = await mcpClient.callTool({ name: 'describe_finding', arguments: { findingId } });
          const finding = JSON.parse((res as any).content[0].text);
          const eli5Module = await import('./eli5.js');
          const explanation = await eli5Module.explainFindingELI5(finding, llmProvider);
          await say(
            `${formatHeader(`ELI5: ${finding.title}`)}\n\n${explanation}\n\n` +
            `${formatFooter(['quiz finding ' + findingId, 'explain finding ' + findingId])}`
          );
        } catch (err: any) {
          await say(`❌ ${err.message}`);
        }
        return;
      }

      const quizMatch = text.match(/^(?:quiz me on|quiz) finding (\S+)$/i);
      if (quizMatch) {
        const findingId = quizMatch[1]!;
        await say(`❓ *Generating quiz for \`${findingId}\`...*`);
        try {
          const res = await mcpClient.callTool({ name: 'describe_finding', arguments: { findingId } });
          const finding = JSON.parse((res as any).content[0].text);
          const eli5Module = await import('./eli5.js');
          const quiz = await eli5Module.quizOnFinding(finding, llmProvider);
          await say(`${formatHeader(`Quiz: ${finding.title}`)}\n\n${quiz}`);
        } catch (err: any) {
          await say(`❌ ${err.message}`);
        }
        return;
      }

      // ── FALLBACK: AI Agent ──
      await say(`🤔 _Processing with AI Security Analyst..._`);

      const toolsRes = await mcpClient.listTools();
      const mcpTools = toolsRes.tools;

      const completion = await llmProvider.complete({
        messages: [
          {
            role: 'system',
            content: `You are the MCPShield AI Security Analyst Bot. You enforce a strict HUMAN-IN-THE-LOOP security policy.

RULES:
1. You can SCAN and EXPLAIN findings freely using scan_environment, list_findings, describe_finding.
2. You can SHOW the security score using security_score.
3. You can GENERATE code as educational reference using generate_terraform_fix or generate_cli_fix, BUT always state that these are for review only and have NOT been executed.
4. You MUST NEVER suggest that the user run the generated CLI commands directly. Instead, tell them to use @Shield fix finding <id> then @Shield approve.
5. The only way to execute remediation is through: @Shield fix finding <id> → @Shield approve. No other path exists.
6. If the user asks you to fix or remediate something, do NOT call execute_remediation. Tell them to type @Shield fix finding <id>.

Be concise, professional, and educational. Always explain your reasoning.`,
          },
          { role: 'user', content: rawText },
        ],
        tools: mcpTools.map((t: any) => ({ name: t.name, description: t.description, parameters: t.inputSchema })),
      });

      const messages = [
        { role: 'user', content: rawText },
        { role: 'assistant', content: completion.content, toolCalls: completion.toolCalls },
      ];

      if (completion.toolCalls && completion.toolCalls.length > 0) {
        for (const tc of completion.toolCalls) {
          logger.info('LLM requested tool: ' + tc.name + ' args: ' + JSON.stringify(tc.arguments));
          await say(`⚙️ _Running \`${tc.name}\`..._`);
          const toolResult = await mcpClient.callTool({ name: tc.name, arguments: tc.arguments as any });
          messages.push({ role: 'tool', name: tc.name, toolCallId: tc.id, content: (toolResult as any).content[0].text } as any);
        }
        const finalCompletion = await llmProvider.complete({ messages: messages as any });
        await say(finalCompletion.content);
      } else {
        await say(completion.content);
      }
    } catch (err: any) {
      logger.error(`Error: ${err.message}`, err);
      await say(`❌ *Error:* ${err.message}`);
    }
  });

  await app.start();
  logger.info('Slack Bot started in Socket Mode.');
}
