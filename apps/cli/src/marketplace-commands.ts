import { LocalMarketplace, PluginSigning } from '@mcpshield/mcp-core';

const registryDir = process.env.MCPSHIELD_PLUGIN_DIR || './packages/plugins';
const marketplace = new LocalMarketplace(registryDir);

export async function cmdPluginList() {
  const plugins = await marketplace.listInstalled();
  if (plugins.length === 0) {
    console.log('No plugins installed.');
    return;
  }
  console.log('\nInstalled plugins:');
  console.log('─'.repeat(50));
  for (const p of plugins) {
    console.log(`  ${p.id} v${p.version} [${p.category}] — ${p.description || 'no description'}`);
  }
}

export async function cmdPluginSearch(query: string) {
  const result = await marketplace.search({ query });
  if (result.packages.length === 0) {
    console.log(`No plugins found matching "${query}".`);
    return;
  }
  console.log(`\nSearch results for "${query}":`);
  console.log('─'.repeat(50));
  for (const p of result.packages) {
    console.log(`  ${p.id} v${p.version} [${p.category}]`);
  }
}

export async function cmdPluginInstall(pluginId: string) {
  console.log(`Installing ${pluginId}...`);
  try {
    await marketplace.install(pluginId);
    console.log(`✅ Installed ${pluginId}`);
  } catch (e: any) {
    console.error(`❌ Failed to install ${pluginId}: ${e.message}`);
  }
}

export async function cmdPluginUninstall(pluginId: string) {
  console.log(`Uninstalling ${pluginId}...`);
  try {
    await marketplace.uninstall(pluginId);
    console.log(`✅ Uninstalled ${pluginId}`);
  } catch (e: any) {
    console.error(`❌ Failed to uninstall ${pluginId}: ${e.message}`);
  }
}

export async function cmdPluginInfo(pluginId: string) {
  const info = await marketplace.info(pluginId);
  if (!info) {
    console.log(`Plugin "${pluginId}" not found.`);
    return;
  }
  console.log(`\nPlugin: ${info.name} (${info.id})`);
  console.log(`  Version: ${info.version}`);
  console.log(`  Category: ${info.category}`);
  console.log(`  Capabilities: ${info.capabilities.join(', ')}`);
  console.log(`  Author: ${info.author || 'N/A'}`);
  console.log(`  License: ${info.license || 'MIT'}`);
}

export async function cmdPluginSign(pluginDir: string) {
  const keys = PluginSigning.generateKeyPair();
  PluginSigning.signPlugin(pluginDir, keys.privateKey);
  console.log(`✅ Signed plugin at ${pluginDir}`);
  console.log(`Public key:\n${keys.publicKey}`);
}

export async function cmdPluginVerify(pluginDir: string, publicKeyFile: string) {
  const { readFileSync } = await import('node:fs');
  const publicKey = readFileSync(publicKeyFile, 'utf8');
  const valid = PluginSigning.verifyPlugin(pluginDir, publicKey);
  console.log(valid ? '✅ Signature valid' : '❌ Signature INVALID');
}
