import type { PluginManifest } from './schemas/manifest.js';

export interface PluginContext {
  pluginId: string;
  logger: PluginLogger;
  stateDir: string;
  config: Record<string, unknown>;
  eventBus: EventBus;
  abortSignal: AbortSignal;
}

export interface PluginLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface EventBus {
  emit(event: { type: string; timestamp: string; pluginId?: string; data: Record<string, unknown> }): void;
}

export interface CapabilityHandlers {
  discover?(ctx: PluginContext): Promise<unknown[]>;
  scan?(ctx: PluginContext): Promise<Finding[]>;
  verify?(ctx: PluginContext, catalogId: string, resourceId: string): Promise<VerificationResult>;
  remediate?(ctx: PluginContext, finding: Finding): Promise<RemediationResult>;
  health?(ctx: PluginContext): Promise<HealthStatus>;
  explain?(ctx: PluginContext, finding: Finding): Promise<string>;
}

export interface Finding {
  id: string;
  catalogId?: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resource: { type: string; id: string; location?: string };
  remediation?: { summary: string; cli?: string; terraform?: string };
  evidence?: Record<string, unknown>;
  riskScore?: number;
}

export interface VerificationResult {
  verified: boolean;
  details: Record<string, unknown>;
  verificationCommand?: string;
  expectedBefore?: string;
  expectedAfter?: string;
}

export interface RemediationResult {
  success: boolean;
  message: string;
}

export interface HealthStatus {
  reachable: boolean;
  identity?: string;
  location?: string;
  message?: string;
}

export interface PluginDefinition {
  apiVersion: 'v1';
  id: string;
  name: string;
  version: string;
  category: string;
  description?: string;
  author?: string;
  capabilities: string[];
  discover?(ctx: PluginContext): Promise<unknown[]>;
  scan?(ctx: PluginContext): Promise<Finding[]>;
  verify?(ctx: PluginContext, catalogId: string, resourceId: string): Promise<VerificationResult>;
  remediate?(ctx: PluginContext, finding: Finding): Promise<RemediationResult>;
  health?(ctx: PluginContext): Promise<HealthStatus>;
  explain?(ctx: PluginContext, finding: Finding): Promise<string>;
  /** Generic handler for any capability not covered above. */
  [capability: string]: ((ctx: PluginContext, ...args: any[]) => Promise<any>) | string | string[] | undefined;
}
