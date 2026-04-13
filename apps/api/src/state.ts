import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '@mcpshield/config';

export interface ApiState {
  lastScan: any | null;
  allFindings: any[];
  approvals: Record<string, any>;
  remediationResults: any[];
}

/**
 * Read state from the MCP server's state file.
 * The API is a read-only consumer — it never writes to the shared state file
 * to avoid collisions with the MCP server process.
 */
export async function readState(): Promise<ApiState> {
  const config = getConfig();
  const filePath = join(config.mcp.stateDir, 'state.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data) as ApiState;
  } catch {
    return {
      lastScan: null,
      allFindings: [],
      approvals: {},
      remediationResults: [],
    };
  }
}
