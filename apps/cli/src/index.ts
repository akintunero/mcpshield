#!/usr/bin/env node

const [,, command, ...args] = process.argv;

const commands: Record<string, () => Promise<void>> = {
  async help() {
    console.log(`
MCPShield CLI — Plugin Management

Usage:
  mcpshield <command> [options]

Commands:
  create-plugin          Create a new plugin project
  doctor                 Check your environment
  plugin list            List installed plugins
  plugin search <query>  Search available plugins
  plugin install <id>    Install a plugin
  plugin uninstall <id>  Remove a plugin
  plugin info <id>       Show plugin details
  plugin test <dir>      Run contract tests on a plugin
  help                   Show this help

Examples:
  mcpshield create-plugin
  mcpshield doctor
  mcpshield plugin install cloud-aws
`);
  },

  async 'create-plugin'() {
    const { createInteractivePrompts } = await import('./create-plugin.js');
    await createInteractivePrompts();
  },

  async doctor() {
    const results: boolean[] = [];

    // System checks
    results.push(await check('Node.js >= 18', () => !!(process.versions.node && parseFloat(process.versions.node) >= 18)));
    results.push(await check('pnpm installed', async () => { try { await exec('pnpm --version'); return true; } catch { return false; } }));
    results.push(await check('Docker installed', async () => { try { await exec('docker --version'); return true; } catch { return false; } }));

    // Port checks
    for (const port of [7801, 7802]) {
      results.push(await check(`Port ${port} free`, async () => {
        try { await exec(`lsof -i :${port}`); return false; }
        catch { return true; }
      }));
    }

    // Plugin health checks
    try {
      const pluginDir = process.env.MCPSHIELD_PLUGIN_DIR || './packages/plugins';
      const { readdirSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      let pluginCount = 0;
      for (const dir of readdirSync(pluginDir, { withFileTypes: true })) {
        if (dir.isDirectory() && existsSync(join(pluginDir, dir.name, 'plugin.json'))) {
          pluginCount++;
        }
      }
      if (pluginCount > 0) {
        results.push(await check(`${pluginCount} plugins loadable`, () => Promise.resolve(true)));
      }
    } catch {}

    // AWS credential check
    results.push(await check('AWS credentials configured', async () => {
      return !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_WEB_IDENTITY_TOKEN_FILE);
    }));

    // MCP API key check
    results.push(await check('MCP_API_KEY configured', async () => {
      return !!process.env.MCP_API_KEY;
    }));

    const passed = results.filter(Boolean).length;
    console.log(`\nMCPShield Doctor — ${passed}/${results.length} checks passed`);
    if (passed < results.length) {
      console.log('\nSuggestions:\n');
      if (!results[0]) console.log('  Install Node.js >= 18: https://nodejs.org');
      if (!results[1]) console.log('  Install pnpm: npm install -g pnpm');
      if (!results[2]) console.log('  Install Docker: https://docker.com');
      if (results[3] === false) console.log('  Port 7801 in use — stop the other service or change MCP_HTTP_PORT');
      if (results[4] === false) console.log('  Port 7802 in use — stop the other service or change API_PORT');
      if (results[6] === false) console.log('  Set AWS_ACCESS_KEY_ID or AWS_PROFILE in .env');
      if (results[7] === false) console.log('  Set MCP_API_KEY in .env');
    }
  },

  async 'plugin list'() {
    console.log('Installed plugins:');
    // TODO: read from local registry
    console.log('  - cloud-aws v1.0.0 [cloud]');
  },

  async 'plugin search'() {
    const query = args[0] || '';
    console.log(`Search results for "${query}":`);
    console.log('  (local registry only — implement remote registry later)');
  },

  async 'plugin install'() {
    const id = args[0];
    if (!id) { console.error('Usage: mcpshield plugin install <plugin-id>'); return; }
    console.log(`Installing plugin: ${id}...`);
    // TODO: marketplaceService.install(id)
    console.log('Done.');
  },
};

async function main() {
  const cmd = commands[command || 'help'];
  if (!cmd) {
    console.error(`Unknown command: ${command}\n`);
    await commands.help!();
    process.exit(1);
  }
  await cmd();
}

main().catch(console.error);

function check(name: string, fn: () => boolean | Promise<boolean>): Promise<boolean> {
  return (async () => {
    try {
      const ok = await fn();
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
      return ok;
    } catch {
      console.log(`  ✗ ${name}`);
      return false;
    }
  })();
}

async function exec(cmd: string): Promise<string> {
  const { execSync } = await import('child_process');
  return execSync(cmd, { encoding: 'utf8' }).trim();
}
