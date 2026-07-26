export { createPlugin, type CreatedPlugin } from './create-plugin.js';
export type { PluginDefinition, CapabilityHandlers, PluginContext, PluginLogger } from './types.js';
export { PluginManifestSchema, type PluginManifest } from './schemas/manifest.js';
export { PluginError, ConfigError, ConnectionError, TimeoutError } from './errors/index.js';
export { VersionCompatibility } from './lifecycle/compatibility.js';
export * from './v1-compat.js';
