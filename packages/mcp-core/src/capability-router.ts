import type { Capability, MCPPlugin } from '@mcpshield/plugin-sdk';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:capability-router');

interface CapabilityEntry {
  plugin: MCPPlugin;
  capability: Capability;
}

export class CapabilityRouter {
  private byId = new Map<string, CapabilityEntry>();
  private byResourceType = new Map<string, CapabilityEntry[]>();

  /** Register all capabilities from a plugin. */
  registerPlugin(plugin: MCPPlugin): void {
    for (const cap of plugin.capabilities()) {
      const entry: CapabilityEntry = { plugin, capability: cap };
      this.byId.set(cap.id, entry);

      const existing = this.byResourceType.get(cap.resourceType) || [];
      existing.push(entry);
      this.byResourceType.set(cap.resourceType, existing);

      logger.debug(`  Capability: ${cap.verb} ${cap.resourceType} → ${plugin.id}`);
    }
  }

  /** Find the plugin that handles a specific capability ID. */
  resolve(capabilityId: string): CapabilityEntry | undefined {
    return this.byId.get(capabilityId);
  }

  /** Find plugins that can handle a given resource type. */
  findByResourceType(resourceType: string): CapabilityEntry[] {
    return this.byResourceType.get(resourceType) || [];
  }

  /** Find a plugin that can perform a verb on a resource type. */
  resolveByVerb(verb: string, resourceType: string): CapabilityEntry | undefined {
    const entries = this.byResourceType.get(resourceType) || [];
    return entries.find(e => e.capability.verb === verb);
  }

  /** All registered capability IDs. */
  get allCapabilityIds(): string[] {
    return [...this.byId.keys()];
  }

  /** Count of registered capabilities. */
  get size(): number {
    return this.byId.size;
  }
}
