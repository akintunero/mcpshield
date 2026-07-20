import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { readState } from './state.js';
import { computeSecurityScore } from '@mcpshield/scoring-engine';
import { createMcpClient } from './mcp-client.js';
import { getLlmProvider } from './llm.js';

const logger = createLogger('api:main');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const config = getConfig();
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: '*' });

  // 1. REST API endpoints
  fastify.get('/health', async () => {
    const state = await readState();
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      lastScanId: state.lastScan?.scanId,
    };
  });

  fastify.get('/api/state', async () => {
    const state = await readState();
    const score = computeSecurityScore(state.allFindings);
    return {
      score,
      lastScan: state.lastScan,
      findings: state.allFindings,
      approvals: Object.values(state.approvals),
      remediations: state.remediationResults,
    };
  });

  fastify.post('/api/scan', async (request, reply) => {
    try {
      logger.info('API delegated scan to MCP server...');
      const mcpClient = await createMcpClient();
      try {
        const res = await mcpClient.callTool({ name: 'scan_environment', arguments: {} });
        const result = JSON.parse((res as any).content[0].text);
        logger.info(`Scan completed via MCP server: ${result.resourcesScanned} resources scanned.`);
        return {
          success: true,
          lastScan: result,
          findingsCount: result.findings.length,
        };
      } finally {
        try {
          await mcpClient.close();
        } catch {}
      }
    } catch (err: any) {
      logger.error(`Error in /api/scan: ${err.message}`, err);
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/api/chat', async (request, reply) => {
    const { message, history } = request.body as { message: string; history?: any[] };
    if (!message) {
      return reply.status(400).send({ error: 'Message is required' });
    }

    let mcpClient;
    try {
      mcpClient = await createMcpClient();
      const llmProvider = getLlmProvider();

      // Retrieve available tools from MCP server
      const toolsRes = await mcpClient.listTools();
      const mcpTools = toolsRes.tools;

      // Construct LLM message history
      const formattedHistory = (history || []).map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content,
      }));

      const messages = [
        {
          role: 'system',
          content: `You are the MCPShield AI Security Analyst Chatbot.
You are embedded directly in the MCPShield dashboard. You have direct access to Model Context Protocol (MCP) tools that scan the environment, explain findings, generate Terraform/CLI fixes, and execute remediations.
Explain vulnerabilities clearly, answer queries, or run security workflows.
When a user asks to scan, fix, or show score, use the appropriate tools.
Provide professional, concise responses.`,
        },
        ...formattedHistory,
        { role: 'user', content: message },
      ];

      let completion = await llmProvider.complete({
        messages: messages as any,
        tools: mcpTools.map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      });

      // Simple agent execution loop: if the LLM requests a tool call, execute it and call it back
      if (completion.toolCalls && completion.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: completion.content || '',
          toolCalls: completion.toolCalls,
        } as any);

        for (const tc of completion.toolCalls) {
          logger.info(
            `Dashboard Chatbot invoking tool: ${tc.name} with args: ${JSON.stringify(tc.arguments)}`,
          );
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

        // Call the LLM provider again with tool execution output
        completion = await llmProvider.complete({
          messages: messages as any,
        });
      }

      return {
        content: completion.content,
      };
    } catch (err: any) {
      logger.error(`Error in /api/chat: ${err.message}`, err);
      return reply.status(500).send({ error: err.message });
    } finally {
      if (mcpClient) {
        try {
          await mcpClient.close();
        } catch {}
      }
    }
  });

  // 2. Serve static dashboard assets if built
  const dashboardDistPath = join(__dirname, '../../dashboard/dist');
  if (existsSync(dashboardDistPath)) {
    logger.info(`Registering static dashboard handler for path: ${dashboardDistPath}`);
    await fastify.register(fastifyStatic, {
      root: dashboardDistPath,
      prefix: '/',
      wildcard: true,
    });

    // Support HTML5 History API for SPA navigation routing
    fastify.setNotFoundHandler(async (request, reply) => {
      return reply.sendFile('index.html');
    });
  } else {
    logger.warn(
      `Dashboard distribution directory not found at: ${dashboardDistPath}. Serving JSON API fallback.`,
    );
    fastify.get('/', async () => {
      return {
        message:
          'MCPShield API Server running. Dashboard not built yet. Run `pnpm build` at the root directory to enable the dashboard.',
        endpoints: {
          health: '/health',
          state: '/api/state',
        },
      };
    });
  }

  await fastify.listen({ host: config.api.host, port: config.api.port });
  logger.info(`REST API Server running at http://${config.api.host}:${config.api.port}`);
}

main().catch((err) => {
  logger.fatal(`Fatal error starting REST API Server: ${err.message}`, err);
  process.exit(1);
});
