import { watch } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@mcpshield/logger';
import type { PluginHost } from './plugin-host.js';

const logger = createLogger('mcp-core:hot-reload');

/**
 * Watches plugin directories for changes and triggers reloads.
 * During development, a plugin author edits their plugin and sees
 * changes reflected in < 2 seconds without restarting MCPShield.
 */
export function enableHotReload(host: PluginHost, pluginRoot: string): void {
  for (const plugin of host.getAll()) {
    const pluginDir = join(pluginRoot, plugin.id);
    let debounceTimer: NodeJS.Timeout | undefined;

    try {
      watch(pluginDir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          logger.info(`Plugin "${plugin.id}" changed (${filename}). Reloading...`);
          try {
            // Clear require cache
            const resolved = require.resolve(join(pluginDir, plugin.manifest.entrypoint));
            delete require.cache[resolved];
            // Reload plugin
            const freshMod = await import(join(pluginDir, plugin.manifest.entrypoint));
            const freshPlugin = freshMod.default;
            if (freshPlugin) {
              (plugin as any).instance = freshPlugin;
              logger.info(`Plugin "${plugin.id}" reloaded successfully`);
            }
          } catch (e: any) {
            logger.error(`Failed to reload plugin "${plugin.id}": ${e.message}`);
          }
        }, 500);
      });
      logger.info(`Hot-reload enabled for plugin: ${plugin.id}`);
    } catch (e: any) {
      logger.warn(`Could not watch plugin "${plugin.id}": ${e.message}`);
    }
  }
}
