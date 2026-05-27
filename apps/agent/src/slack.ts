import { App } from '@slack/bolt';
import { getConfig, requireSlack } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { createMcpClient } from './mcp-client.js';
import { getLlmProvider } from './llm.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const logger = createLogger('agent:slack');

let mcpClient: Client | null = null;
let lastPendingApprovalId: string | null = null;

/** Helper to format severity indicators for Slack */
function slackSev(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return '🚨 *CRITICAL*';
    case 'high':
      return '⚠️ *HIGH*';
    case 'medium':
      return '⚡ *MEDIUM*';
    case 'low':
      return '🔍 *LOW*';
    default:
      return `*${severity.toUpperCase()}*`;
  }
}

/** Formats a table-like visual summary of findings in Slack */
function formatFindingsSlack(findings: any[]): string {
  if (findings.length === 0) return '_No findings open! Your posture is secure._';

  return findings
    .map((f: any) => {
      return `• [${slackSev(f.severity)}] \`${f.findingId}\` — *${f.title}* on \`${f.resource.type}:${f.resource.id}\` (Risk: ${f.riskScore})`;
    })
    .join('\n');
}

export async function startSlackBot() {
  const config = getConfig();
  const slackConfig = requireSlack(config);

  // Initialize Bolt App in Socket Mode
  const app = new App({
    token: slackConfig.botToken,
    signingSecret: slackConfig.signingSecret,
    appToken: slackConfig.appToken,
    socketMode: true,
  });

  // Connect to the local MCP Server
  mcpClient = await createMcpClient();
  const llmProvider = getLlmProvider();

  logger.info('Slack Bolt application initialized in Socket Mode.');

  // Handle App Mentions
  app.event('app_mention', async ({ event, say }) => {
    const rawText = event.text.replace(/<@U[A-Z0-9]+>/g, '').trim();
    logger.info(`Received Slack bot mention: "${rawText}" in channel ${event.channel}`);

    // Restrict bot to a single configured channel if set
    if (config.slack.allowedChannel && event.channel !== config.slack.allowedChannel) {
      logger.debug(
        `Ignoring mention in channel ${event.channel}. Configured allowed channel is ${config.slack.allowedChannel}`,
      );
      return;
    }

    try {
      if (!mcpClient) {
        throw new Error('MCP Client is not connected to the MCP Server.');
      }

      // --- 1. Deterministic / RegEx Commands (Workshop Mode) -------------------
      const text = rawText.toLowerCase();

      // COMMAND: scan environment
      if (text === 'scan environment' || text === 'scan') {
        await say('🔄 *Scanning AWS environment via MCP tools...* (this takes a few seconds)');
        const res = await mcpClient.callTool({ name: 'scan_environment', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);

        await say(
          `✅ *Scan Completed!* (Scan ID: \`${result.scanId}\`)\n` +
            `• Resources Scanned: *${result.resourcesScanned}*\n` +
            `• Open Findings Detected: *${result.findings.length}*\n\n` +
            `*Current Open Vulnerabilities:*\n${formatFindingsSlack(result.findings)}\n\n` +
            `Type \`@Shield security score\` to view your grade or \`@Shield explain finding <id>\` to learn more.`,
        );
        return;
      }

      // COMMAND: show findings
      if (text === 'show findings' || text === 'findings') {
        const res = await mcpClient.callTool({ name: 'list_findings', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `🛡️ *MCPShield Open Vulnerabilities Inventory:* (${result.total} total)\n` +
            `${formatFindingsSlack(result.findings)}`,
        );
        return;
      }

      // COMMAND: show critical
      if (text === 'show critical' || text === 'critical') {
        const res = await mcpClient.callTool({
          name: 'list_findings',
          arguments: { severity: 'critical' },
        });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `🚨 *MCPShield Open CRITICAL Vulnerabilities:* (${result.total} total)\n` +
            `${formatFindingsSlack(result.findings)}`,
        );
        return;
      }

      // COMMAND: explain finding <id>
      if (text.startsWith('explain finding')) {
        const findingId = rawText.substring('explain finding'.length).trim();
        await say(`🧠 *Analyzing finding \`${findingId}\` using generative AI...*`);

        const res = await mcpClient.callTool({
          name: 'describe_finding',
          arguments: { findingId },
        });
        const result = JSON.parse((res as any).content[0].text);

        // Formulate LLM call
        const systemPrompt = `You are a Senior Cloud Security Architect and SOC Analyst. 
Explain this finding to a developer in a concise, educational, and professional manner.
Start your response with a friendly SOC greeting (e.g. "Shield SOC Analyst here...").
State the Technical Impact, Business Impact, and a short walk-through of the Attack Scenario.
Do NOT output code blocks; let the developer know they can generate remediations by running "generate terraform" or "generate aws-cli" commands.`;

        const llmResponse = await llmProvider.complete({
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Please explain this security finding details: ${JSON.stringify(result, null, 2)}`,
            },
          ],
        });

        await say(llmResponse.content);
        return;
      }

      // COMMAND: generate terraform finding <id>
      if (text.startsWith('generate terraform finding') || text.startsWith('generate terraform')) {
        const findingId = rawText
          .replace(/generate terraform finding/i, '')
          .replace(/generate terraform/i, '')
          .trim();
        const res = await mcpClient.callTool({
          name: 'generate_terraform_fix',
          arguments: { findingId },
        });
        const result = JSON.parse((res as any).content[0].text);

        await say(
          `🏗️ *Terraform Remediation Script for \`${findingId}\`:*\n` +
            `\`\`\`hcl\n${result.content}\n\`\`\`\n` +
            `_Summary: ${result.summary}_`,
        );
        return;
      }

      // COMMAND: generate aws-cli finding <id>
      if (text.startsWith('generate aws-cli finding') || text.startsWith('generate aws-cli')) {
        const findingId = rawText
          .replace(/generate aws-cli finding/i, '')
          .replace(/generate aws-cli/i, '')
          .trim();
        const res = await mcpClient.callTool({
          name: 'generate_cli_fix',
          arguments: { findingId },
        });
        const result = JSON.parse((res as any).content[0].text);

        await say(
          `💻 *AWS CLI Remediation Commands for \`${findingId}\`:*\n` +
            `\`\`\`bash\n${result.content}\n\`\`\`\n` +
            `_Summary: ${result.summary}_`,
        );
        return;
      }

      // COMMAND: fix finding <id>
      if (text.startsWith('fix finding')) {
        const rawFindingId = rawText.substring('fix finding'.length).trim();
        // Resolve finding first to make sure it exists
        const stateRes = await mcpClient.callTool({
          name: 'list_findings',
          arguments: {},
        });
        const stateResult = JSON.parse((stateRes as any).content[0].text);
        const resolvedFinding = stateResult.findings.find((f: any) => 
          f.findingId === rawFindingId || 
          f.resource.id === rawFindingId || 
          f.findingId.toLowerCase().includes(rawFindingId.toLowerCase())
        );

        if (!resolvedFinding) {
          await say(`❌ Finding "${rawFindingId}" not found in current inventory.`);
          return;
        }

        const findingId = resolvedFinding.findingId;
        await say(`🔑 *Registering remediation authorization for finding \`${findingId}\`...*`);

        const res = await mcpClient.callTool({
          name: 'approve_remediation',
          arguments: {
            findingIds: [findingId],
            approvedBy: event.user || 'Slack User',
            note: 'Requested via Slack chat command.',
          },
        });
        const approval = JSON.parse((res as any).content[0].text);
        lastPendingApprovalId = approval.approvalId;

        // Generate proposed fixes
        let tfFix = '_No Terraform remediation available_';
        let cliFix = '_No AWS CLI remediation available_';

        try {
          const tfRes = await mcpClient.callTool({
            name: 'generate_terraform_fix',
            arguments: { findingId },
          });
          const tfResult = JSON.parse((tfRes as any).content[0].text);
          tfFix = `\`\`\`hcl\n${tfResult.content}\n\`\`\``;
        } catch (e: any) {
          logger.warn(`Failed to generate tf fix for Slack: ${e.message}`);
        }

        try {
          const cliRes = await mcpClient.callTool({
            name: 'generate_cli_fix',
            arguments: { findingId },
          });
          const cliResult = JSON.parse((cliRes as any).content[0].text);
          cliFix = `\`\`\`bash\n${cliResult.content}\n\`\`\``;
        } catch (e: any) {
          logger.warn(`Failed to generate cli fix for Slack: ${e.message}`);
        }

        await say(
          `⚠️ *Remediation Authorized & Pending Execution* (ID: \`${approval.approvalId}\`)\n` +
            `• Targets: \`${findingId}\`\n` +
            `• Status: *Approved*\n\n` +
            `🏗️ *Proposed Terraform Fix:*\n${tfFix}\n\n` +
            `💻 *Proposed AWS CLI Fix:*\n${cliFix}\n\n` +
            `👉 *To execute this fix directly against LocalStack, type:* \`@Shield approve\``,
        );
        return;
      }

      // COMMAND: fix all critical
      if (text === 'fix all critical' || text === 'fix critical') {
        await say(
          '🔑 *Querying all open CRITICAL findings for batch remediation authorization...*',
        );
        const listRes = await mcpClient.callTool({
          name: 'list_findings',
          arguments: { severity: 'critical' },
        });
        const list = JSON.parse((listRes as any).content[0].text);

        const openCriticalIds = list.findings
          .filter((f: any) => f.status === 'open')
          .map((f: any) => f.findingId);
        if (openCriticalIds.length === 0) {
          await say('✅ No open CRITICAL findings exist in inventory.');
          return;
        }

        const res = await mcpClient.callTool({
          name: 'approve_remediation',
          arguments: {
            findingIds: openCriticalIds,
            approvedBy: event.user || 'Slack User',
            note: 'Batch authorize critical fixes.',
          },
        });
        const approval = JSON.parse((res as any).content[0].text);
        lastPendingApprovalId = approval.approvalId;

        await say(
          `⚠️ *Batch Remediation Authorized & Pending Execution* (ID: \`${approval.approvalId}\`)\n` +
            `• Targets: \`${openCriticalIds.join(', ')}\`\n` +
            `• Status: *Approved*\n\n` +
            `👉 *To apply all ${openCriticalIds.length} critical fixes, type:* \`@Shield approve\``,
        );
        return;
      }

      // COMMAND: approve
      if (text === 'approve') {
        if (!lastPendingApprovalId) {
          await say(
            '❌ No pending authorizations found in memory. Please initiate a fix command first (e.g. `@Shield fix finding <id>`).',
          );
          return;
        }

        await say(
          `🚀 *Executing approved remediation actions for authorization \`${lastPendingApprovalId}\` against AWS (LocalStack)...*`,
        );

        const res = await mcpClient.callTool({
          name: 'execute_remediation',
          arguments: { approvalId: lastPendingApprovalId },
        });
        const result = JSON.parse((res as any).content[0].text);

        lastPendingApprovalId = null; // clear state

        const successMessages = result.results
          .map(
            (r: any) =>
              `• \`${r.findingId}\`: ${r.success ? '✅ *Success*' : '❌ *Failed*'} — _${r.message}_`,
          )
          .join('\n');

        // Automatically trigger scan after execution to update state
        let freshScore = result.score;
        try {
          await mcpClient.callTool({ name: 'scan_environment', arguments: {} });
          const scoreRes = await mcpClient.callTool({ name: 'security_score', arguments: {} });
          freshScore = JSON.parse((scoreRes as any).content[0].text);
        } catch (e: any) {
          logger.warn(`Failed to run post-remediation scan: ${e.message}`);
        }

        await say(
          `📊 *Remediation Run Completed:*\n${successMessages}\n\n` +
            `*New Security Posture:* Score *${freshScore.score}/100* (Grade *${freshScore.grade}*).`,
        );
        return;
      }

      // COMMAND: rescan
      if (text === 'rescan') {
        await say('🔄 *Re-scanning environment to verify remediations...*');
        const res = await mcpClient.callTool({ name: 'rescan_environment', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);
        await say(
          `✅ *Re-scan finished!* Open findings count is now *${result.findings.length}*.\n` +
            `Type \`@Shield security score\` to verify posture improvements.`,
        );
        return;
      }

      // COMMAND: security score
      if (text === 'security score' || text === 'score') {
        const res = await mcpClient.callTool({ name: 'security_score', arguments: {} });
        const score = JSON.parse((res as any).content[0].text);

        await say(
          `📊 *Current Security Posture Assessment:*\n` +
            `• Score: *${score.score}/100*\n` +
            `• Letter Grade: *[ ${score.grade} ]*\n` +
            `• Open Findings: *${score.totalFindings}*\n` +
            `  - Critical: ${score.breakdown.critical} | High: ${score.breakdown.high} | Medium: ${score.breakdown.medium} | Low: ${score.breakdown.low}`,
        );
        return;
      }

      // COMMAND: explain finding <id> eli5 / for a beginner
      const eli5Match = text.match(
        /^(?:explain finding|explain) (\S+) (?:for a beginner|eli5|simple|beginner)$/i,
      );
      if (eli5Match) {
        const findingId = eli5Match[1]!;
        await say(`📚 *Generating beginner-friendly explanation for \`${findingId}\`...*`);
        try {
          const res = await mcpClient.callTool({
            name: 'describe_finding',
            arguments: { findingId },
          });
          const finding = JSON.parse((res as any).content[0].text);
          const eli5Module = await import('./eli5.js');
          const explanation = await eli5Module.explainFindingELI5(finding, llmProvider);
          await say(`*🧠 ELI5: ${finding.title}*\n\n${explanation}`);
        } catch (err: any) {
          await say(`❌ Could not generate explanation: ${err.message}`);
        }
        return;
      }

      // COMMAND: quiz me on finding <id>
      const quizMatch = text.match(/^(?:quiz me on|quiz) finding (\S+)$/i);
      if (quizMatch) {
        const findingId = quizMatch[1]!;
        await say(`❓ *Generating quiz questions for \`${findingId}\`...*`);
        try {
          const res = await mcpClient.callTool({
            name: 'describe_finding',
            arguments: { findingId },
          });
          const finding = JSON.parse((res as any).content[0].text);
          const eli5Module = await import('./eli5.js');
          const quiz = await eli5Module.quizOnFinding(finding, llmProvider);
          await say(`*📝 Quiz: ${finding.title}*\n\n${quiz}`);
        } catch (err: any) {
          await say(`❌ Could not generate quiz: ${err.message}`);
        }
        return;
      }

      // COMMAND: generate report
      if (text === 'generate report' || text === 'report') {
        await say('📄 *Generating Executive Security Assessment Report...*');
        const res = await mcpClient.callTool({ name: 'generate_report', arguments: {} });
        const report = JSON.parse((res as any).content[0].text);

        // Print the rendered Markdown
        await say(`Here is your executive security report:\n\n${report.markdown}`);
        return;
      }

      // --- 2. Fallback to AI Agent conversational reasoning (General Q&A) ----
      await say('🤔 _Processing question with AI Security Analyst reasoning..._');

      // Fetch all tools definitions to pass to the model
      const toolsRes = await mcpClient.listTools();
      const mcpTools = toolsRes.tools;

      const completion = await llmProvider.complete({
        messages: [
          {
            role: 'system',
            content: `You are the MCPShield AI Security Analyst Bot. 
You interact with the user via Slack. You have access to Model Context Protocol (MCP) tools that scan the environment, explain findings, and execute remediations.
Provide answers directly. Answer queries, explain vulnerabilities, or run security workflows.
Always act as a helpful Cloud Security Specialist.`,
          },
          { role: 'user', content: rawText },
        ],
        tools: mcpTools.map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      });

      // Handle simple agent loop: if LLM wants to call tools, execute them
      const messages = [
        { role: 'user', content: rawText },
        { role: 'assistant', content: completion.content, toolCalls: completion.toolCalls },
      ];

      if (completion.toolCalls && completion.toolCalls.length > 0) {
        for (const tc of completion.toolCalls) {
          logger.info(
            'LLM requested tool call: ' + tc.name + ' with args: ' + JSON.stringify(tc.arguments),
          );
          await say(`⚙️ _Tool invocation: running \`${tc.name}\`..._`);

          const toolResult = await mcpClient.callTool({
            name: tc.name,
            arguments: tc.arguments as any,
          });
          const toolText = (toolResult as any).content[0].text;

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: toolText,
          } as any);
        }

        // Call LLM again with tool results to formulate final response
        const finalCompletion = await llmProvider.complete({
          messages: messages as any,
        });
        await say(finalCompletion.content);
      } else {
        await say(completion.content);
      }
    } catch (err: any) {
      logger.error(`Error processing Slack mention event: ${err.message}`, err);
      await say(`❌ *Error:* ${err.message}`);
    }
  });

  await app.start();
  logger.info('Slack Bot successfully started and listening for Socket Mode events.');
}
