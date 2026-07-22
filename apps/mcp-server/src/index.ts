import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { createMcpServer } from './server.js';

const logger = createLogger('mcp-server:main');

type Session = {
  transport: SSEServerTransport;
  server: Server;
};

function parseCorsOrigins(raw: string | undefined): boolean | string | string[] {
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

async function main() {
  const config = getConfig();
  const transportType = config.mcp.transport;

  logger.info(`Starting MCPShield MCP Server with transport type: ${transportType.toUpperCase()}`);

  if (transportType === 'stdio') {
    const mcpServer = createMcpServer();
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info('MCP Server listening on stdio.');

    const stop = async () => {
      logger.info('Shutting down...');
      await mcpServer.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => void stop());
    process.on('SIGINT', () => void stop());
    return;
  }

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

  await fastify.register(cors, {
    origin: parseCorsOrigins(config.security.corsOrigins),
  });
  await fastify.register(rateLimit, {
    max: config.security.rateLimitMax,
    timeWindow: '1 minute',
  });

  const sessions = new Map<string, Session>();
  const mcpApiKey = config.security.mcpApiKey;

  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/health')) return;
    if (!mcpApiKey) return;
    if (!bearerMatches(request.headers.authorization, mcpApiKey)) {
      return reply
        .status(401)
        .send({ error: 'Unauthorized. Provide MCP_API_KEY via Authorization: Bearer <key>.' });
    }
  });

  fastify.get('/sse', async (request, reply) => {
    logger.info('Client initiated SSE connection.');
    const server = createMcpServer();
    const transport = new SSEServerTransport('/messages', reply.raw);
    const sessionId = transport.sessionId;
    sessions.set(sessionId, { transport, server });

    reply.raw.on('close', () => {
      sessions.delete(sessionId);
      void server.close().catch(() => undefined);
      logger.info(`SSE session closed: ${sessionId}`);
    });

    await server.connect(transport);
    return reply;
  });

  fastify.post('/messages', async (request, reply) => {
    const sessionId =
      typeof request.query === 'object' && request.query && 'sessionId' in request.query
        ? String((request.query as { sessionId?: string }).sessionId ?? '')
        : '';
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      return reply.status(400).send('Active SSE session not found. Connect to /sse first.');
    }
    try {
      await session.transport.handlePostMessage(request.raw, reply.raw, request.body);
    } catch (err: any) {
      logger.error(`Error processing message: ${err.message}`);
      return reply.status(500).send(err.message);
    }
  });

  fastify.get('/health', async () => {
    return { status: 'ok', transport: 'http-sse', sessions: sessions.size };
  });

  const stop = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down...`);
    for (const { server } of sessions.values()) {
      await server.close().catch(() => undefined);
    }
    sessions.clear();
    await fastify.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  const proto = httpsOpts.key ? 'https' : 'http';
  await fastify.listen({ host: config.mcp.httpHost, port: config.mcp.httpPort });
  logger.info(
    `MCP Server running at ${proto}://${config.mcp.httpHost}:${config.mcp.httpPort}/sse (multi-session)`,
  );
}

main().catch((err) => {
  logger.fatal(`Fatal error starting MCP Server: ${err.message}`, err);
  process.exit(1);
});
