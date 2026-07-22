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

async function rotateBackups(dir: string, maxBackups: number): Promise<void> {
  if (maxBackups <= 0) return;
  try {
    const backupPath = join(dir, 'state.json');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(backupPath, join(dir, `state-${ts}.bak`));
    const files = (await fs.readdir(dir))
      .filter((f) => f.startsWith('state-') && f.endsWith('.bak'))
      .sort()
      .reverse();
    for (const old of files.slice(maxBackups)) {
      await fs.unlink(join(dir, old));
    }
  } catch {}
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

/** Serialize writes so concurrent MCP sessions do not clobber state.json. */
let writeChain: Promise<void> = Promise.resolve();

/**
 * Commits the current state to the local disk with backup rotation.
 * Single-host only — not multi-replica safe (use a shared store for HA).
 */
export async function saveState(state: McpState): Promise<void> {
  cachedState = state;
  const run = async () => {
    const config = getConfig();
    const path = getStateFilePath();
    const dir = config.mcp.stateDir;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path, JSON.stringify(state, null, 2), 'utf8');
      await rotateBackups(dir, config.stateBackupCount);
    } catch (err: any) {
      logger.error(`Error writing state file: ${err.message}`);
    }
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
}
