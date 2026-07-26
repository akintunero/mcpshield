import type { PluginDefinition, PluginContext, CapabilityHandlers } from './types.js';
import type { PluginManifest } from './schemas/manifest.js';
import { PluginManifestSchema } from './schemas/manifest.js';
import { VersionCompatibility } from './lifecycle/compatibility.js';
import { PluginError } from './errors/index.js';

export interface CreatedPlugin {
  readonly id: string;
  readonly manifest: PluginManifest;
  readonly capabilities: CapabilityHandlers;

  init(context: PluginContext): Promise<void>;
  health(): Promise<{ reachable: boolean; identity?: string; location?: string; message?: string }>;
  discover(): Promise<unknown[]>;
  scan(): Promise<import('./types.js').Finding[]>;
  verify(catalogId: string, resourceId: string): Promise<import('./types.js').VerificationResult>;
  remediate(finding: any): Promise<import('./types.js').RemediationResult>;
  explain(finding: any): Promise<string>;
  shutdown(): Promise<void>;
}

/**
 * Creates a fully-featured plugin from a definition object.
 *
 * The plugin author writes only the business logic (discover, scan, verify, etc.)
 * and everything else is auto-generated: manifest validation, logging, events,
 * error handling, metrics, lifecycle, compatibility checking.
 *
 * @example
 * ```typescript
 * export default createPlugin({
 *   apiVersion: 'v1',
 *   id: 'cloud-aws',
 *   name: 'AWS Cloud',
 *   version: '1.0.0',
 *   category: 'cloud',
 *   capabilities: ['discover', 'scan', 'verify', 'remediate'],
 *   async scan(ctx) {
 *     ctx.logger.info('Scanning AWS...');
 *     // ... scan logic
 *     return findings;
 *   },
 *   // ... other handlers
 * });
 * ```
 */
export function createPlugin(def: PluginDefinition): CreatedPlugin {
  // 1. Validate definition
  if (!def.id || !def.version || !Array.isArray(def.capabilities)) {
    throw new PluginError('Invalid plugin definition: id, version, and capabilities are required');
  }

  // 2. Build manifest
  const manifest: PluginManifest = {
    id: def.id,
    name: def.name || def.id,
    apiVersion: def.apiVersion,
    version: def.version,
    category: def.category || 'uncategorized',
    description: def.description || '',
    author: def.author || '',
    license: 'MIT',
    entrypoint: './dist/index.js',
    capabilities: def.capabilities,
  };

  // Validate manifest against schema
  try {
    PluginManifestSchema.parse(manifest);
  } catch (e: any) {
    throw new PluginError(`Manifest validation failed: ${e.message}`);
  }

  // 3. Check API version compatibility
  if (!VersionCompatibility.isSupported(def.apiVersion)) {
    throw new PluginError(
      `Plugin "${def.id}" uses API version "${def.apiVersion}" which is not supported. ` +
      `Supported versions: ${VersionCompatibility.supportedVersions().join(', ')}`
    );
  }

  // 4. Build capability handlers from provided methods
  const handlers: CapabilityHandlers = {
    discover: def.discover?.bind(def),
    scan: def.scan?.bind(def),
    verify: def.verify?.bind(def),
    remediate: def.remediate?.bind(def),
    health: def.health?.bind(def),
    explain: def.explain?.bind(def),
  };

  let ctx: PluginContext;

  return {
    id: def.id,
    manifest,
    capabilities: handlers,

    async init(context: PluginContext) {
      ctx = context;
      ctx.logger.info(`Plugin "${def.id}" v${def.version} initialized`);
    },

    async health() {
      const start = Date.now();
      try {
        if (!handlers.health) {
          return { reachable: true, identity: def.id };
        }
        const result = await withTimeout(handlers.health(ctx!), 10_000);
        ctx?.logger.debug(`Health check completed in ${Date.now() - start}ms`);
        return result;
      } catch (e: any) {
        ctx?.logger.error(`Health check failed: ${e.message}`);
        return { reachable: false, message: e.message };
      }
    },

    async discover() {
      if (!handlers.discover) return [];
      return instrument(ctx, 'discover', () => handlers.discover!(ctx!));
    },

    async scan() {
      if (!handlers.scan) return [];
      return instrument(ctx, 'scan', () => handlers.scan!(ctx!));
    },

    async verify(catalogId: string, resourceId: string) {
      if (!handlers.verify) {
        return { verified: false, details: { error: 'verify not supported' } };
      }
      return instrument(ctx, 'verify', () => handlers.verify!(ctx!, catalogId, resourceId));
    },

    async remediate(finding: any) {
      if (!handlers.remediate) {
        return { success: false, message: 'remediate not supported' };
      }
      return instrument(ctx, 'remediate', () => handlers.remediate!(ctx!, finding));
    },

    async explain(finding: any) {
      if (!handlers.explain) return 'No explanation provided';
      return instrument(ctx, 'explain', () => handlers.explain!(ctx!, finding));
    },

    async shutdown() {
      ctx?.logger.info(`Plugin "${def.id}" shutting down`);
    },
  };
}

/** Wraps a handler with logging, timing, error handling, and event emission. */
async function instrument<T>(
  ctx: PluginContext | undefined,
  capability: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  ctx?.logger.debug(`Running capability: ${capability}`);

  ctx?.eventBus.emit({
    type: `capability.${capability}.started`,
    timestamp: new Date().toISOString(),
    pluginId: ctx?.pluginId,
    data: {},
  });

  try {
    const result = await withTimeout(fn(), 300_000); // 5 min max per capability
    const duration = Date.now() - start;

    ctx?.logger.debug(`Capability "${capability}" completed in ${duration}ms`);

    ctx?.eventBus.emit({
      type: `capability.${capability}.completed`,
      timestamp: new Date().toISOString(),
      pluginId: ctx?.pluginId,
      data: { duration },
    });

    return result;
  } catch (e: any) {
    const duration = Date.now() - start;

    ctx?.logger.error(`Capability "${capability}" failed after ${duration}ms: ${e.message}`);

    ctx?.eventBus.emit({
      type: `capability.${capability}.failed`,
      timestamp: new Date().toISOString(),
      pluginId: ctx?.pluginId,
      data: { duration, error: e.message },
    });

    throw e;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ]);
}
