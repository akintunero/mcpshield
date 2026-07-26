/**
 * MarketplaceService — interfaces for plugin discovery and installation.
 * 
 * The backend can be swapped from local filesystem to registry.mcpshield.dev
 * without changing the CLI. Just implement these interfaces.
 */

export interface PluginPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category: string;
  capabilities: string[];
  repository?: string;
  homepage?: string;
  license: string;
  downloads?: number;
  rating?: number;
  installed?: boolean;
  hasUpdate?: boolean;
}

export interface MarketplaceSearchOptions {
  query?: string;
  category?: string;
  capability?: string;
  page?: number;
  pageSize?: number;
}

export interface MarketplaceSearchResult {
  packages: PluginPackage[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MarketplaceService {
  /** Search available plugins. */
  search(options: MarketplaceSearchOptions): Promise<MarketplaceSearchResult>;

  /** Get details for a specific plugin. */
  info(pluginId: string): Promise<PluginPackage | null>;

  /** Install a plugin into the local plugins directory. */
  install(pluginId: string, version?: string): Promise<void>;

  /** Uninstall a plugin. */
  uninstall(pluginId: string): Promise<void>;

  /** Check for available upgrades. */
  checkUpgrades(): Promise<Array<{ id: string; current: string; latest: string }>>;

  /** Upgrade a plugin to the latest version. */
  upgrade(pluginId: string): Promise<void>;

  /** List locally installed plugins. */
  listInstalled(): Promise<PluginPackage[]>;

  /** Validate a local plugin directory. */
  doctor(pluginDir: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
}
