import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getConfig } from '@mcpshield/config';
import type {
  Finding,
  ScanResult,
  Approval,
  RemediationResult,
  AuditEntry,
  ToolTrace,
  EvidenceRecord,
} from '@mcpshield/types';
import { createLogger } from '@mcpshield/logger';
import { shortId, nowIso } from '@mcpshield/shared';

const logger = createLogger('mcp-server:state');

// AES-256-GCM state encryption. Key derived from env var or disabled if unset.
const ENCRYPTION_KEY = process.env.MCPSHIELD_STATE_KEY || '';
const USE_ENCRYPTION = ENCRYPTION_KEY.length > 0;
const ALGORITHM = 'aes-256-gcm';
const KEY_BUFFER = USE_ENCRYPTION
  ? createHash('sha256').update(ENCRYPTION_KEY).digest()
  : null;

function encrypt(text: string): string {
  if (!KEY_BUFFER) return text;
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY_BUFFER, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encoded: string): string {
  if (!KEY_BUFFER) return encoded;
  const parts = encoded.split(':');
  if (parts.length !== 3) return encoded; // not encrypted
  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const encrypted = parts[2]!;
  const decipher = createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface McpState {
  lastScan: ScanResult | null;
  allFindings: Finding[];
  approvals: Record<string, Approval>;
  remediationResults: RemediationResult[];
  auditHistory: AuditEntry[];
  toolTraces: ToolTrace[];
  evidenceRecords: EvidenceRecord[];
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
 * Simple mutual-exclusion lock to prevent concurrent state file writes.
 * Unlike the old promise-chain approach, this ensures every write completes
 * before the next starts AND provides proper error isolation per operation.
 */
class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve();
      });
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

const stateMutex = new Mutex();

export async function loadState(): Promise<McpState> {
  if (cachedState) return cachedState;
  const path = getStateFilePath();
  try {
    const raw = await fs.readFile(path, 'utf8');
    const data = decrypt(raw);
    cachedState = JSON.parse(data) as McpState;
    cachedState.auditHistory ??= [];
    cachedState.toolTraces ??= [];
    cachedState.evidenceRecords ??= [];
    return cachedState;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.error(`Error loading state file: ${err.message}`);
    }
    cachedState = {
      lastScan: null,
      allFindings: [],
      approvals: {},
      remediationResults: [],
      auditHistory: [],
      toolTraces: [],
      evidenceRecords: [],
    };
    return cachedState;
  }
}

export async function saveState(state: McpState): Promise<void> {
  cachedState = state;
  await stateMutex.acquire();
  try {
    const config = getConfig();
    const path = getStateFilePath();
    const dir = config.mcp.stateDir;
    await fs.mkdir(dir, { recursive: true });
    const payload = JSON.stringify(state);
    await fs.writeFile(path, USE_ENCRYPTION ? encrypt(payload) : payload, 'utf8');
    await rotateBackups(dir, config.stateBackupCount);
  } catch (err: any) {
    logger.error(`Error writing state file: ${err.message}`);
  } finally {
    stateMutex.release();
  }
}

export async function recordAudit(
  state: McpState,
  action: string,
  summary: string,
  details: Record<string, unknown> = {},
  findingIds: string[] = [],
  duration?: number,
): Promise<McpState> {
  const entry: AuditEntry = {
    id: shortId('aud'),
    timestamp: nowIso(),
    action: action as any,
    summary,
    details,
    findingIds,
    duration,
  };
  state.auditHistory.push(entry);
  await saveState(state);
  return state;
}

export async function recordTrace(
  state: McpState,
  toolName: string,
  reason: string,
  input: Record<string, unknown>,
  result: Record<string, unknown>,
  success: boolean,
  duration: number,
  awsSdkOperation?: string,
  awsCliEquivalent?: string,
): Promise<McpState> {
  const trace: ToolTrace = {
    id: shortId('trc'),
    timestamp: nowIso(),
    toolName,
    reason,
    input,
    awsSdkOperation,
    awsCliEquivalent,
    result,
    success,
    duration,
  };
  state.toolTraces.push(trace);
  await saveState(state);
  return state;
}

export async function recordEvidence(
  state: McpState,
  findingId: string,
  catalogId: string,
  resourceId: string,
  severity: string,
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  verificationStatus: 'passed' | 'failed' | 'skipped',
  verificationMethod: string,
  awsCliCommand: string,
  awsSdkOperation: string,
): Promise<McpState> {
  const input = JSON.stringify({ beforeState, afterState, verificationStatus, awsCliCommand, awsSdkOperation });
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const evidenceHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const record: EvidenceRecord = {
    id: shortId('evd'),
    findingId,
    catalogId,
    resourceId,
    severity,
    status: verificationStatus === 'passed' ? 'resolved' : 'open',
    timestamp: nowIso(),
    beforeState,
    afterState,
    verificationStatus,
    verificationMethod,
    awsCliCommand,
    awsSdkOperation,
    evidenceHash,
  };
  state.evidenceRecords.push(record);
  await saveState(state);
  return state;
}
