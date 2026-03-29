import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '@mcpshield/config';
import type { Finding, ScanResult, Approval, RemediationResult } from '@mcpshield/types';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-server:state');

export interface McpState {
  lastScan: ScanResult | null;
  allFindings: Finding[];
  approvals: Record<string, Approval>;
  remediationResults: RemediationResult[];
}

let cachedState: McpState | null = null;

function getStateFilePath(): string {
  const config = getConfig();
  return join(config.mcp.stateDir, 'state.json');
}

/**
 * Loads state from the local disk. Initializes default state if it does not exist.
 */
export async function loadState(): Promise<McpState> {
  if (cachedState) return cachedState;

  const path = getStateFilePath();
  try {
    const data = await fs.readFile(path, 'utf8');
    cachedState = JSON.parse(data) as McpState;
    return cachedState;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.error(`Error loading state file: ${err.message}`);
    }
    // Initialize default state
    cachedState = {
      lastScan: null,
      allFindings: [],
      approvals: {},
      remediationResults: [],
    };
    return cachedState;
  }
}

/**
 * Commits the current state to the local disk.
 */
export async function saveState(state: McpState): Promise<void> {
  cachedState = state;
  const path = getStateFilePath();
  const dir = getConfig().mcp.stateDir;
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path, JSON.stringify(state, null, 2), 'utf8');
  } catch (err: any) {
    logger.error(`Error writing state file: ${err.message}`);
  }
}
