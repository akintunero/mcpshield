import { createInterface } from 'node:readline';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function createInteractivePrompts(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, def?: string) => new Promise<string>((r) => rl.question(`${q}${def ? ` (${def})` : ''}: `, r));

  console.log('\nMCPShield Plugin Creator\n');

  const name = await ask('Plugin name', 'my-plugin');
  const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const category = await ask('Category (cloud, containers, iac, code, scanners, identity, compliance, reporting)', 'cloud');
  const capabilities = await ask('Capabilities (comma-separated: discover, scan, verify, remediate)', 'discover,scan');
  const description = await ask('Short description');
  const author = await ask('Author');
  const repo = await ask('Repository URL');

  const caps = capabilities.split(',').map((s) => s.trim()).filter(Boolean);
  const dir = join(process.cwd(), id);
  mkdirSync(join(dir, 'src'), { recursive: true });

  // plugin.json
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify({
    id, name, apiVersion: 'v1', version: '0.1.0',
    author, description: description || `${name} plugin`,
    license: 'MIT', category,
    capabilities: caps,
    homepage: repo || '',
    repository: repo || '',
  }, null, 2));

  // src/index.ts
  const handlerImpl = caps.map((c) => {
    if (c === 'scan') return `  async scan(ctx) {\n    ctx.logger.info('Scanning...');\n    return [];\n  }`;
    if (c === 'discover') return `  async discover(ctx) {\n    ctx.logger.info('Discovering...');\n    return [];\n  }`;
    if (c === 'verify') return `  async verify(ctx, catalogId, resourceId) {\n    return { verified: true, details: {} };\n  }`;
    if (c === 'remediate') return `  async remediate(ctx, finding) {\n    return { success: true, message: 'Fixed' };\n  }`;
    return '';
  }).filter(Boolean).join(',\n');

  writeFileSync(join(dir, 'src/index.ts'), `import { createPlugin } from '@mcpshield/plugin-sdk';\n\nexport default createPlugin({\n  apiVersion: 'v1',\n  id: '${id}',\n  name: '${name}',\n  version: '0.1.0',\n  category: '${category}',\n  capabilities: ${JSON.stringify(caps)},\n${handlerImpl}\n});\n`);

  // package.json
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@mcpshield/${id}`, version: '0.1.0', private: true, type: 'module',
    main: './dist/index.js', types: './dist/index.d.ts',
    scripts: { build: 'tsc', test: 'vitest run' },
    dependencies: { '@mcpshield/plugin-sdk': 'latest' },
  }, null, 2));

  // tsconfig.json
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
      outDir: './dist', rootDir: './src', strict: true, esModuleInterop: true,
      skipLibCheck: true, declaration: true, resolveJsonModule: true,
    },
    include: ['src'],
  }, null, 2));

  // README.md
  writeFileSync(join(dir, 'README.md'), `# ${name}\n\n${description || `${name} plugin for MCPShield`}\n\n## Capabilities\n\n${caps.map((c) => `- ${c}`).join('\n')}\n\n## License\n\nMIT\n`);

  // Tests
  writeFileSync(join(dir, 'src/index.test.ts'), `import { describePlugin } from '@mcpshield/plugin-sdk/testing';\nimport plugin from './index.js';\n\ndescribe('${id}', () => {\n  it('passes contract tests', async () => {\n    const report = await describePlugin(plugin);\n    expect(report.failed).toBe(0);\n  });\n});\n`);

  rl.close();
  console.log(`\n✅ Plugin created at ${dir}\n`);
  console.log('Next steps:');
  console.log(`  cd ${id}`);
  console.log('  pnpm install');
  console.log('  pnpm build');
  console.log('  pnpm test\n');
}
