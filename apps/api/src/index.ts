import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { readState } from './state.js';
import { computeSecurityScore } from '@mcpshield/scoring-engine';
import { createMcpClient } from './mcp-client.js';
import { getLlmProvider } from './llm.js';

const logger = createLogger('api:main');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const metrics = {
  requestsTotal: 0,
  requestsByPath: {} as Record<string, number>,
  errorsTotal: 0,
  startTime: Date.now(),
};

function metricsText(): string {
  const uptime = (Date.now() - metrics.startTime) / 1000;
  return [
    '# HELP mcpshield_requests_total Total HTTP requests',
    '# TYPE mcpshield_requests_total counter',
    `mcpshield_requests_total ${metrics.requestsTotal}`,
    '',
    '# HELP mcpshield_errors_total Total HTTP errors',
    '# TYPE mcpshield_errors_total counter',
    `mcpshield_errors_total ${metrics.errorsTotal}`,
    '',
    '# HELP mcpshield_uptime_seconds Server uptime in seconds',
    '# TYPE mcpshield_uptime_seconds gauge',
    `mcpshield_uptime_seconds ${uptime}`,
  ].join('\n');
}

function parseCorsOrigins(raw: string): boolean | string | string[] {
  if (!raw || raw.trim() === '' || raw.trim() === '*') return true;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (list.length === 1) return list[0]!;
  return list;
}

function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isPublicPath(url: string): boolean {
  if (url === '/health' || url === '/metrics' || url === '/api/config') return true;
  if (url.startsWith('/api/')) return false;
  // Static dashboard assets
  return true;
}

async function main() {
  const config = getConfig();

  const httpsOpts: { key?: Buffer; cert?: Buffer } = {};
  if (config.security.tlsKeyPath && config.security.tlsCertPath) {
    try {
      httpsOpts.key = readFileSync(config.security.tlsKeyPath);
      httpsOpts.cert = readFileSync(config.security.tlsCertPath);
      logger.info('TLS enabled (prefer reverse-proxy TLS in production).');
    } catch (err: any) {
      logger.warn(`Failed to load TLS certificates: ${err.message}. Falling back to HTTP.`);
    }
  }

  const fastify = Fastify({
    logger: false,
    ...(httpsOpts.key && httpsOpts.cert ? { https: httpsOpts } : {}),
  });

  await fastify.register(cors, { origin: parseCorsOrigins(config.security.corsOrigins) });
  await fastify.register(rateLimit, { max: config.security.rateLimitMax, timeWindow: '1 minute' });

  fastify.addHook('preHandler', async (request, reply) => {
    metrics.requestsTotal++;
    metrics.requestsByPath[request.url] = (metrics.requestsByPath[request.url] || 0) + 1;

    if (isPublicPath(request.url.split('?')[0] || request.url)) return;

    if (config.security.apiKey) {
      if (!bearerMatches(request.headers.authorization, config.security.apiKey)) {
        metrics.errorsTotal++;
        return reply
          .status(401)
          .send({ error: 'Unauthorized. Provide API_KEY via Authorization: Bearer <key> header.' });
      }
    }
  });

  fastify.get('/health', async () => {
    const state = await readState();
    return {
      status: 'ok',
      uptimeSeconds: process.uptime(),
      lastScanId: state.lastScan?.scanId,
    };
  });

  fastify.get('/metrics', async (_request, reply) => {
    return reply.type('text/plain').send(metricsText());
  });

  /** Public bootstrap config for the dashboard (never returns secrets). */
  fastify.get('/api/config', async () => {
    return {
      authRequired: Boolean(config.security.apiKey),
      apiBaseUrl: config.api.baseUrl,
    };
  });

  fastify.get('/api/state', async (_request, reply) => {
    try {
      const state = await readState();
      const score = computeSecurityScore(state.allFindings);
      return {
        score,
        lastScan: state.lastScan,
        findings: state.allFindings,
        approvals: Object.values(state.approvals),
        remediations: state.remediationResults,
      };
    } catch (err: any) {
      metrics.errorsTotal++;
      logger.error(`Error reading state: ${err.message}`);
      return reply.status(500).send({ error: 'Failed to read state.' });
    }
  });

  fastify.post('/api/scan', async (_request, reply) => {
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
      metrics.errorsTotal++;
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

      const toolsRes = await mcpClient.listTools();
      const mcpTools = toolsRes.tools;

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

      if (completion.toolCalls && completion.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: completion.content || '',
          toolCalls: completion.toolCalls,
        } as any);

        for (const tc of completion.toolCalls) {
          logger.info(`Dashboard Chatbot invoking tool: ${tc.name}`);
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

        completion = await llmProvider.complete({ messages: messages as any });
      }

      return { content: completion.content };
    } catch (err: any) {
      metrics.errorsTotal++;
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

  const dashboardDistPath = join(__dirname, '../../dashboard/dist');
  if (existsSync(dashboardDistPath)) {
    logger.info(`Registering static dashboard handler for path: ${dashboardDistPath}`);
    await fastify.register(fastifyStatic, {
      root: dashboardDistPath,
      prefix: '/',
      wildcard: true,
    });

    fastify.setNotFoundHandler(async (_request, reply) => {
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
        endpoints: { health: '/health', state: '/api/state', metrics: '/metrics' },
      };
    });
  }

  const stop = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await fastify.close();
    logger.info('Server closed.');
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  const proto = httpsOpts.key ? 'https' : 'http';
  await fastify.listen({ host: config.api.host, port: config.api.port });
  logger.info(`REST API Server running at ${proto}://${config.api.host}:${config.api.port}`);
}

main().catch((err) => {
  logger.fatal(`Fatal error starting REST API Server: ${err.message}`, err);
  process.exit(1);
});
