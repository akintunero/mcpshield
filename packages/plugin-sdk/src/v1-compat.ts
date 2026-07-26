/**
 * Backward-compatibility re-exports for consumers of the old @mcpshield/sdk.
 * These types match the original MCPPlugin interface used by the legacy
 * plugin-registry, capability-router, and task-planner in mcp-core.
 *
 * @deprecated Use createPlugin() and PluginDefinition instead.
 */

import type { PluginContext, PluginLogger, Finding, VerificationResult, RemediationResult, HealthStatus } from './types.js';
import type { PluginManifest } from './schemas/manifest.js';

/** @deprecated Use createPlugin() instead. */
export interface MCPPlugin {
  readonly id: string;
  readonly manifest: PluginManifest;
  init(context: PluginContext): Promise<void>;
  capabilities(): Capability[];
  health(): Promise<HealthStatus>;
  discover(options?: Record<string, unknown>): Promise<Resource[]>;
  scan(options?: Record<string, unknown>): Promise<Finding[]>;
  remediate(finding: Finding): Promise<RemediationResult>;
  verify(catalogId: string, resourceId: string): Promise<VerificationResult>;
  explain(finding: Finding): Promise<string>;
  shutdown?(): Promise<void>;
}

/** @deprecated Use CapabilityHandlers or the capabilities array in PluginDefinition. */
export interface Capability {
  id: string;
  name: string;
  verb: 'scan' | 'remediate' | 'verify' | 'explain' | 'discover';
  resourceType: string;
  estimatedDuration?: string;
}

/** @deprecated Use the Resource type from PluginContext instead. */
export interface Resource {
  provider: string;
  service: string;
  type: string;
  id: string;
  nativeRef?: string;
  location?: string;
  attributes: Record<string, unknown>;
  tags: Record<string, string>;
}

/** @deprecated Direct event type references. */
export type EventType = string;
export interface McpEvent { type: string; timestamp: string; pluginId?: string; data: Record<string, unknown>; }
export interface EventBus { emit(event: McpEvent): void; on(type: string, handler: (event: McpEvent) => void): void; off(type: string, handler: (event: McpEvent) => void): void; }

export type { PluginContext, PluginLogger, PluginManifest, Finding, VerificationResult, RemediationResult, HealthStatus };
