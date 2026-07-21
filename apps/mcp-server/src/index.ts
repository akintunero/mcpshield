import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { readFileSync } from 'node:fs';

import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { mcpServer } from './server.js';

const logger = createLogger('mcp-server:main');

async function main() {
  const config = getConfig();
  const transportType = config.mcp.transport;

  logger.info(`Starting MCPShield MCP Server with transport type: ${transportType.toUpperCase()}`);

  if (transportType === 'stdio') {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info('MCP Server listening on stdio.');

    process.on('SIGTERM', () => {
      logger.info('Shutting down...');
      process.exit(0);
    });
    process.on('SIGINT', () => {
      logger.info('Shutting down...');
      process.exit(0);
    });
  } else {
    // TLS config
    const httpsOpts: { key?: string; cert?: string } = {};
    if (config.security.tlsKeyPath && config.security.tlsCertPath) {
      try {
        httpsOpts.key = readFileSync(config.security.tlsKeyPath, 'utf8');
        httpsOpts.cert = readFileSync(config.security.tlsCertPath, 'utf8');
        logger.info('TLS enabled');
      } catch (err: any) {
        logger.warn(`Failed to load TLS certificates: ${err.message}. Falling back to HTTP.`);
      }
    }

    const fastify = Fastify({ logger: false });

    if (httpsOpts.key && httpsOpts.cert) {
      // @ts-expect-error: Fastify v5 supports https via this property
      fastify.https = httpsOpts;
    }
    await fastify.register(cors, { origin: '*' });
    await fastify.register(rateLimit, {
      max: config.security.rateLimitMax,
      timeWindow: '1 minute',
    });

    let sseTransport: SSEServerTransport | null = null;

    fastify.get('/sse', async (request, reply) => {
      logger.info('Client initiated SSE connection.');
      sseTransport = new SSEServerTransport('/messages', reply.raw);
      await mcpServer.connect(sseTransport);
      return reply;
    });

    fastify.post('/messages', async (request, reply) => {
      if (!sseTransport) {
        return reply.status(400).send('Active SSE session not found. Connect to /sse first.');
      }
      try {
        await sseTransport.handlePostMessage(request.raw, reply.raw, request.body);
      } catch (err: any) {
        logger.error(`Error processing message: ${err.message}`);
        return reply.status(500).send(err.message);
      }
    });

    fastify.get('/health', async () => {
      return { status: 'ok', transport: 'http-sse' };
    });

    // Graceful shutdown
    const stop = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down...`);
      await mcpServer.close();
      await fastify.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));

    const proto = httpsOpts.key ? 'https' : 'http';
    await fastify.listen({ host: config.mcp.httpHost, port: config.mcp.httpPort });
    logger.info(
      `MCP Server running at ${proto}://${config.mcp.httpHost}:${config.mcp.httpPort}/sse`,
    );
  }
}

main().catch((err) => {
  logger.fatal(`Fatal error starting MCP Server: ${err.message}`, err);
  process.exit(1);
});
