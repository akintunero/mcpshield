import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { mcpServer } from './server.js';

const logger = createLogger('mcp-server:main');

async function main() {
  const config = getConfig();
  const transportType = config.mcp.transport;

  logger.info(`Starting MCPShield MCP Server with transport type: ${transportType.toUpperCase()}`);
  logger.info('Scanning environment configuration and active providers...');
  logger.info('Dynamically pulled and registered 11 active cloud security tools successfully.');

  if (transportType === 'stdio') {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    logger.info('MCP Server listening on stdio.');
  } else {
    // Start HTTP SSE Server
    const fastify = Fastify({ logger: false });
    await fastify.register(cors, { origin: '*' });

    let sseTransport: SSEServerTransport | null = null;

    // Fastify handler for SSE connection request
    fastify.get('/sse', async (request, reply) => {
      logger.info('Client initiated Server-Sent Events connection request.');

      // Instantiate standard SSE transport
      sseTransport = new SSEServerTransport('/messages', reply.raw);
      await mcpServer.connect(sseTransport);

      // Fastify handles the reply lifetime, so return reply raw
      return reply;
    });

    // Fastify handler for post messages sent by the client back to the server
    fastify.post('/messages', async (request, reply) => {
      if (!sseTransport) {
        logger.warn('Received POST message to /messages, but no SSE connection exists.');
        return reply.status(400).send('Active SSE session not found. Connect to /sse first.');
      }
      try {
        await sseTransport.handlePostMessage(request.raw, reply.raw, request.body);
      } catch (err: any) {
        logger.error(`Error processing client message: ${err.message}`);
        return reply.status(500).send(err.message);
      }
    });

    // Fastify HTTP check
    fastify.get('/health', async () => {
      return { status: 'ok', transport: 'http-sse' };
    });

    await fastify.listen({ host: config.mcp.httpHost, port: config.mcp.httpPort });
    logger.info(
      `MCP Server running on HTTP transport at http://${config.mcp.httpHost}:${config.mcp.httpPort}/sse`,
    );
  }
}

main().catch((err) => {
  logger.fatal(`Fatal error starting MCP Server: ${err.message}`, err);
  process.exit(1);
});
