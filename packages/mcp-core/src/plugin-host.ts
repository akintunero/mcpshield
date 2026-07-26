import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginContext, PluginLogger } from '@mcpshield/plugin-sdk';
import { PluginManifestSchema } from '@mcpshield/plugin-sdk';
import type { PluginManifest } from '@mcpshield/plugin-sdk';
import { PluginError } from '@mcpshield/plugin-sdk';
import { createLogger } from '@mcpshield/logger';
import { nowIso } from '@mcpshield/shared';
import type { McpEventBus } from './event-bus.js';
import { runInSandbox } from './sandbox.js';

interface HostedPlugin {
  id: string;
  manifest: PluginManifest;
  instance: any; // CreatedPlugin from createPlugin() or MCPPlugin
  startedAt: string;
  healthStatus: { reachable: boolean; lastChecked: string };
  errorCount: number;
  pid: number;
}

export interface HostConfig {
  pluginDir: string;
  stateDir: string;
  timeoutMs: number;
  maxRestarts: number;
}

/**
 * PluginHost is the runtime container for every plugin.
 * It handles loading, lifecycle, health checks, crash recovery,
 * resource limits, and log isolation.
 */
export class PluginHost {
  private plugins = new Map<string, HostedPlugin>();
  private readonly logger = createLogger('mcp-core:plugin-host');
  private eventBus?: McpEventBus;

  constructor(private config: HostConfig) {}

  setEventBus(bus: McpEventBus): void {
    this.eventBus = bus;
  }

  /** Load a plugin from a directory containing plugin.json. */
  async load(dir: string): Promise<HostedPlugin | null> {
    const manifestPath = join(dir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      this.logger.debug(`No plugin.json in ${dir}`);
      return null;
    }

    let rawManifest: any;
    try {
      rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (e: any) {
      this.logger.error(`Failed to parse ${manifestPath}: ${e.message}`);
      return null;
    }

    // Validate manifest
    const parsed = PluginManifestSchema.safeParse(rawManifest);
    if (!parsed.success) {
      this.logger.error(`Invalid manifest in ${dir}: ${parsed.error.message}`);
      return null;
    }
    const manifest = parsed.data;

    // Check API version
    if (manifest.apiVersion !== 'v1') {
      this.logger.error(`Plugin "${manifest.id}" uses unsupported API version: ${manifest.apiVersion}`);
      return null;
    }

    // Load the module
    const entrypoint = join(dir, 'dist/index.js');
    if (!existsSync(entrypoint)) {
      this.logger.error(`Plugin "${manifest.id}" entrypoint not found: ${entrypoint}`);
      return null;
    }

    let instance: any;
    try {
      const mod = await import(entrypoint);
      instance = mod.default;
      if (!instance) {
        this.logger.error(`Plugin "${manifest.id}" has no default export`);
        return null;
      }
    } catch (e: any) {
      this.logger.error(`Failed to import plugin "${manifest.id}": ${e.message}`);
      return null;
    }

    // Initialize
    const pluginLogger = this.createPluginLogger(manifest.id);
    const ctx: PluginContext = {
      pluginId: manifest.id,
      logger: pluginLogger,
      stateDir: join(this.config.stateDir, 'plugins', manifest.id),
      config: {},
      eventBus: {
        emit: (event) => this.eventBus?.emit({ ...event, pluginId: manifest.id, timestamp: nowIso() }),
      },
      abortSignal: new AbortController().signal,
    };

    try {
      const initResult = instance.init?.(ctx);
      if (initResult && typeof initResult.then === 'function') {
        await initResult;
      }
    } catch (e: any) {
      this.logger.error(`Plugin "${manifest.id}" init failed: ${e.message}`);
      return null;
    }

    const hosted: HostedPlugin = {
      id: manifest.id,
      manifest,
      instance,
      startedAt: nowIso(),
      healthStatus: { reachable: false, lastChecked: '' },
      errorCount: 0,
      pid: process.pid,
    };

    this.plugins.set(manifest.id, hosted);
    this.logger.info(`Loaded plugin: ${manifest.id} v${manifest.version} (${manifest.capabilities.length} capabilities)`);

    this.eventBus?.emit({
      type: 'plugin.registered',
      timestamp: nowIso(),
      pluginId: manifest.id,
      data: { version: manifest.version, capabilities: manifest.capabilities },
    });

    return hosted;
  }

  /** Load all plugins from a root directory. */
  async loadAll(pluginRoot: string): Promise<HostedPlugin[]> {
    const { readdirSync } = await import('node:fs');
    const loaded: HostedPlugin[] = [];

    if (!existsSync(pluginRoot)) {
      this.logger.warn(`Plugin root not found: ${pluginRoot}`);
      return loaded;
    }

    for (const entry of readdirSync(pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      const dir = join(pluginRoot, entry.name);
      if (!existsSync(join(dir, 'plugin.json'))) continue;
      const plugin = await this.load(dir);
      if (plugin) loaded.push(plugin);
    }

    return loaded;
  }

  /** Run a health check on a specific plugin. */
  async health(pluginId: string): Promise<{ reachable: boolean; identity?: string }> {
    const hosted = this.plugins.get(pluginId);
    if (!hosted) return { reachable: false };

    try {
      const result = await this.invokeWithTimeout(hosted.instance, 'health', []);
      hosted.healthStatus = { reachable: true, lastChecked: nowIso() };
      hosted.errorCount = 0;
      return { reachable: true, ...(result || {}) };
    } catch (e: any) {
      hosted.healthStatus = { reachable: false, lastChecked: nowIso() };
      hosted.errorCount++;
      this.logger.error(`Health check failed for "${pluginId}": ${e.message}`);
      return { reachable: false };
    }
  }

  /** Check health of all plugins. */
  async healthAll(): Promise<Record<string, { reachable: boolean; identity?: string }>> {
    const results: Record<string, { reachable: boolean; identity?: string }> = {};
    for (const id of this.plugins.keys()) {
      results[id] = await this.health(id);
    }
    return results;
  }

  /** Invoke a capability on a plugin. */
  async invoke(pluginId: string, capability: string, ...args: any[]): Promise<any> {
    const hosted = this.plugins.get(pluginId);
    if (!hosted) throw new PluginError(`Plugin "${pluginId}" not loaded`);

    return this.invokeWithTimeout(hosted.instance, capability, args);
  }

  /** Get a loaded plugin by ID. */
  get(pluginId: string): HostedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /** All loaded plugins. */
  getAll(): HostedPlugin[] {
    return [...this.plugins.values()];
  }

  /** Gracefully shut down all plugins. */
  async shutdownAll(): Promise<void> {
    for (const [id, hosted] of this.plugins) {
      try {
        await hosted.instance.shutdown?.();
        this.logger.info(`Plugin "${id}" shut down`);
      } catch (e: any) {
        this.logger.error(`Error shutting down "${id}": ${e.message}`);
      }
    }
    this.plugins.clear();
  }

  private createPluginLogger(pluginId: string): PluginLogger {
    return {
      info: (msg) => this.logger.info(`[${pluginId}] ${msg}`),
      warn: (msg) => this.logger.warn(`[${pluginId}] ${msg}`),
      error: (msg) => this.logger.error(`[${pluginId}] ${msg}`),
      debug: (msg) => this.logger.debug(`[${pluginId}] ${msg}`),
    };
  }

  private async invokeWithTimeout(instance: any, method: string, args: any[]): Promise<any> {
    const handler = instance[method] || instance.capabilities?.[method];
    if (!handler) return undefined;

    const timeout = this.config.timeoutMs || 300_000;

    // Use sandboxed worker thread for plugin execution
    const hosted = this.plugins.get(instance.id || 'unknown');
    if (!hosted) {
      // Fallback: in-process execution (used during loading)
      const promise = typeof handler === 'function' ? handler(...args) : handler;
      return Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Capability "${method}" timed out after ${timeout}ms`)), timeout),
        ),
      ]);
    }

    const sandboxResult = await runInSandbox({
      pluginId: hosted.id,
      entrypoint: join(this.config.pluginDir, hosted.id, hosted.manifest.entrypoint),
      timeoutMs: timeout,
      maxMemoryMb: 256,
      pluginDir: this.config.pluginDir,
      stateDir: this.config.stateDir,
    }, method, args);

    if (!sandboxResult.success) {
      throw new Error(sandboxResult.error || 'Unknown sandbox error');
    }

    return sandboxResult.data;
  }
}
