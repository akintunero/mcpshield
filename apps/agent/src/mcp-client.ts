import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { URL } from 'url';

const logger = createLogger('agent:mcp-client');

/**
 * Instantiates and connects an MCP Client to the local MCP Server.
 * Supports both stdio (spawning server process) and HTTP SSE transports.
 */
export async function createMcpClient(): Promise<Client> {
  const config = getConfig();
  const client = new Client(
    {
      name: 'mcpshield-agent-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  let transport;
  if (config.mcp.transport === 'stdio') {
    logger.info('Initializing MCP Client via Stdio transport (spawning node subprocess)...');
    transport = new StdioClientTransport({
      command: 'node',
      args: ['../../mcp-server/dist/index.js'],
      env: { ...process.env, MCP_TRANSPORT: 'stdio' },
    });
  } else {
    // Resolve HTTP SSE Endpoint
    const sseUrl = new URL(config.mcp.serverUrl);
    // Standardize to the Fastify /sse connection endpoint
    if (sseUrl.pathname === '/mcp' || sseUrl.pathname === '/') {
      sseUrl.pathname = '/sse';
    }
    logger.info(`Initializing MCP Client via HTTP SSE transport targeting: ${sseUrl.toString()}`);
    transport = new SSEClientTransport(sseUrl);
  }

  await client.connect(transport);
  logger.info('MCP Client successfully connected to the MCP Server.');
  return client;
}
