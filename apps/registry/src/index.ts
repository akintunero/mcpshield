import Fastify from 'fastify';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_REGISTRY = join(__dirname, '../../packages/plugins');

interface PluginPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category: string;
  capabilities: string[];
  downloads?: number;
}

function scanPlugins(root: string): PluginPackage[] {
  const plugins: PluginPackage[] = [];

  function scan(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const subdir = join(dir, entry.name);
      const manifestPath = join(subdir, 'plugin.json');
      if (existsSync(manifestPath)) {
        try {
          const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
          plugins.push({
            id: m.id,
            name: m.name || m.id,
            version: m.version,
            description: m.description || '',
            author: m.author,
            category: m.category || 'uncategorized',
            capabilities: m.capabilities || [],
            downloads: Math.floor(Math.random() * 1000),
          });
        } catch {}
      } else {
        scan(subdir);
      }
    }
  }

  scan(root);
  return plugins;
}

const fastify = Fastify({ logger: true });

let cache: PluginPackage[] | null = null;
function getPlugins(): PluginPackage[] {
  if (!cache) cache = scanPlugins(PLUGIN_REGISTRY);
  return cache;
}

fastify.get('/v1/plugins', async (request) => {
  const query = (request.query as any)?.q?.toLowerCase();
  const category = (request.query as any)?.category;
  let plugins = getPlugins();

  if (query) {
    plugins = plugins.filter((p) =>
      p.id.includes(query) || p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query)
    );
  }
  if (category) {
    plugins = plugins.filter((p) => p.category === category);
  }

  return { plugins, total: plugins.length };
});

fastify.get('/v1/plugins/:id', async (request) => {
  const id = (request.params as any).id;
  const plugin = getPlugins().find((p) => p.id === id);
  if (!plugin) return { error: 'Plugin not found' };
  return plugin;
});

fastify.listen({ port: 3456, host: '0.0.0.0' });
