import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { URL } from 'url';

const logger = createLogger('api:mcp-client');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createMcpClient(): Promise<Client> {
  const config = getConfig();
  const client = new Client(
    {
      name: 'mcpshield-api-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  let transport;
  if (config.mcp.transport === 'stdio') {
    const mcpServerPath = join(__dirname, '../../mcp-server/dist/index.js');
    logger.info(`Initializing MCP Client via Stdio transport targeting: ${mcpServerPath}`);
    transport = new StdioClientTransport({
      command: 'node',
      args: [mcpServerPath],
      env: { ...process.env, MCP_TRANSPORT: 'stdio' },
    });
  } else {
    const sseUrl = new URL(config.mcp.serverUrl);
    if (sseUrl.pathname === '/mcp' || sseUrl.pathname === '/') {
      sseUrl.pathname = '/sse';
    }
    logger.info(`Initializing MCP Client via HTTP SSE transport targeting: ${sseUrl.toString()}`);
    const headers: Record<string, string> = {};
    if (config.security.mcpApiKey) {
      headers.Authorization = `Bearer ${config.security.mcpApiKey}`;
    }
    transport = new SSEClientTransport(sseUrl, {
      requestInit: { headers },
    });
  }

  await client.connect(transport);
  logger.info('MCP Client successfully connected to the MCP Server.');
  return client;
}
