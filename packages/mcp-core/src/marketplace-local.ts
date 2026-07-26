import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { MarketplaceService, PluginPackage, MarketplaceSearchOptions, MarketplaceSearchResult } from './marketplace-service.js';
import { PluginSigning } from './plugin-signing.js';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:marketplace');

export class LocalMarketplace implements MarketplaceService {
  constructor(private registryDir: string) {}

  async search(options: MarketplaceSearchOptions): Promise<MarketplaceSearchResult> {
    const all = await this.listInstalled();
    let filtered = all;

    if (options.query) {
      const q = options.query.toLowerCase();
      filtered = filtered.filter((p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    if (options.category) {
      filtered = filtered.filter((p) => p.category === options.category);
    }
    if (options.capability) {
      filtered = filtered.filter((p) => p.capabilities.includes(options.capability!));
    }

    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return { packages: paged, total: filtered.length, page, pageSize };
  }

  async info(pluginId: string): Promise<PluginPackage | null> {
    const all = await this.listInstalled();
    return all.find((p) => p.id === pluginId) || null;
  }

  async install(pluginId: string, version?: string, publicKey?: string): Promise<void> {
    const srcDir = join(this.registryDir, pluginId);
    if (!existsSync(srcDir)) {
      throw new Error(`Plugin "${pluginId}" not found in registry at ${srcDir}`);
    }

    // Verify plugin signature before installation
    if (publicKey) {
      const valid = PluginSigning.verifyPlugin(srcDir, publicKey);
      if (!valid) {
        throw new Error(`Plugin "${pluginId}" signature verification FAILED. Installation blocked.`);
      }
      logger.info(`Plugin "${pluginId}" signature verified`);
    } else {
      logger.warn(`Installing "${pluginId}" WITHOUT signature verification. Set MCP_PLUGIN_PUBLIC_KEY to enforce.`);
    }

    const destDir = join(this.registryDir, '..', '..', 'plugins', pluginId);
    mkdirSync(destDir, { recursive: true });
    copyRecursiveSync(srcDir, destDir);
    logger.info(`Installed plugin: ${pluginId}`);
  }

  async uninstall(pluginId: string): Promise<void> {
    const dir = join(this.registryDir, '..', '..', 'plugins', pluginId);
    if (!existsSync(dir)) {
      throw new Error(`Plugin "${pluginId}" is not installed`);
    }
    rmSync(dir, { recursive: true, force: true });
    logger.info(`Uninstalled plugin: ${pluginId}`);
  }

  async checkUpgrades(): Promise<Array<{ id: string; current: string; latest: string }>> {
    const installed = await this.listInstalled();
    const updates: Array<{ id: string; current: string; latest: string }> = [];
    for (const pkg of installed) {
      const local = await this.info(pkg.id);
      if (local && local.version !== pkg.version) {
        updates.push({ id: pkg.id, current: pkg.version, latest: local.version });
      }
    }
    return updates;
  }

  async upgrade(pluginId: string): Promise<void> {
    await this.uninstall(pluginId);
    await this.install(pluginId);
  }

  async listInstalled(): Promise<PluginPackage[]> {
    const pluginsDir = join(this.registryDir, '..', '..', 'plugins');
    if (!existsSync(pluginsDir)) return [];

    const packages: PluginPackage[] = [];
    for (const dir of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const pluginJson = join(pluginsDir, dir.name, 'plugin.json');
      if (!existsSync(pluginJson)) continue;
      try {
        const manifest = JSON.parse(readFileSync(pluginJson, 'utf8'));
        packages.push({
          id: manifest.id,
          name: manifest.name || manifest.id,
          version: manifest.version,
          description: manifest.description || '',
          author: manifest.author,
          category: manifest.category || 'uncategorized',
          capabilities: manifest.capabilities || [],
          license: manifest.license,
          installed: true,
        });
      } catch {}
    }
    return packages;
  }

  async doctor(pluginDir: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const manifestPath = join(pluginDir, 'plugin.json');
    if (!existsSync(manifestPath)) {
      errors.push('plugin.json not found');
      return { valid: false, errors, warnings };
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (!manifest.id) errors.push('manifest missing "id"');
      if (!manifest.version) errors.push('manifest missing "version"');
      if (!manifest.capabilities?.length) warnings.push('manifest declares zero capabilities');
      if (!existsSync(join(pluginDir, manifest.entrypoint || 'dist/index.js'))) {
        warnings.push(`entrypoint "${manifest.entrypoint || 'dist/index.js'}" not found`);
      }
    } catch (e: any) {
      errors.push(`Invalid plugin.json: ${e.message}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

function copyRecursiveSync(src: string, dest: string): void {
  const entries = readdirSync(src, { withFileTypes: true });
  mkdirSync(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}
