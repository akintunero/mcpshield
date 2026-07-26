import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MCPPlugin, PluginContext, PluginManifest, Finding } from '@mcpshield/plugin-sdk';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:plugin-registry');

export class PluginRegistry {
  private plugins = new Map<string, MCPPlugin>();

  /** Register a plugin that was imported directly. */
  register(plugin: MCPPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logger.warn(`Plugin "${plugin.id}" already registered, skipping duplicate`);
      return;
    }
    this.plugins.set(plugin.id, plugin);
    logger.info(`Registered plugin: ${plugin.id} v${plugin.manifest.version}`);
  }

  /** Load a plugin from a directory containing plugin.json. */
  async loadFromDir(dir: string, context: PluginContext): Promise<MCPPlugin | null> {
    const manifestPath = join(dir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      logger.debug(`No plugin.json found in ${dir}`);
      return null;
    }

    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (e: any) {
      logger.error(`Failed to parse plugin.json in ${dir}: ${e.message}`);
      return null;
    }

    try {
      const mod = await import(join(dir, manifest.entrypoint));
      const PluginClass = mod.default;
      if (!PluginClass) {
        logger.error(`Plugin ${manifest.id} has no default export`);
        return null;
      }
      const plugin = new PluginClass() as MCPPlugin;
      (plugin as any).manifest = manifest;

      await plugin.init(context);
      this.register(plugin);
      logger.info(`Loaded plugin: ${manifest.id} v${manifest.version}`);
      return plugin;
    } catch (e: any) {
      logger.error(`Failed to load plugin ${manifest.id}: ${e.message}`);
      return null;
    }
  }

  /** Load all plugins from an array of directories. */
  async loadAll(dirs: string[], context: PluginContext): Promise<MCPPlugin[]> {
    const loaded: MCPPlugin[] = [];
    for (const dir of dirs) {
      const plugin = await this.loadFromDir(dir, context);
      if (plugin) loaded.push(plugin);
    }
    return loaded;
  }

  get(id: string): MCPPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): MCPPlugin[] {
    return [...this.plugins.values()];
  }

  /** Run scan() on all plugins and merge results. */
  async scanAll(options?: Record<string, unknown>): Promise<Finding[]> {
    const results = await Promise.all(
      this.getAll().map(p => p.scan(options).catch(e => {
        logger.error(`Plugin ${p.id} scan failed: ${e.message}`);
        return [] as Finding[];
      }))
    );
    return results.flat();
  }

  async shutdownAll(): Promise<void> {
    for (const p of this.getAll()) {
      try { await p.shutdown?.(); } catch {}
    }
  }
}
