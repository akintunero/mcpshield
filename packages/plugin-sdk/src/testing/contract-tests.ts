import type { PluginDefinition, PluginContext, Finding } from '../types.js';
import { mock } from './index.js';

export interface ComplianceReport {
  passed: number;
  failed: number;
  warnings: number;
  checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; detail?: string }>;
}

let checkId = 0;
function pass(name: string): ComplianceReport['checks'][0] { return { name: `${++checkId}. ${name}`, status: 'pass' }; }
function fail(name: string, detail?: string): ComplianceReport['checks'][0] { return { name: `${++checkId}. ${name}`, status: 'fail', detail }; }
function warn(name: string, detail?: string): ComplianceReport['checks'][0] { return { name: `${++checkId}. ${name}`, status: 'warn', detail }; }

/**
 * Run the full plugin contract test suite against a plugin definition.
 * This is the ONLY function a plugin author needs to call in their test file.
 *
 * @example
 * ```typescript
 * import { describePlugin } from '@mcpshield/plugin-sdk/testing';
 * import myPlugin from '../src/index.js';
 *
 * const report = await describePlugin(myPlugin);
 * console.log(report);
 * // { passed: 12, failed: 0, checks: [...] }
 * ```
 */
export async function describePlugin(def: PluginDefinition): Promise<ComplianceReport> {
  const checks: ComplianceReport['checks'] = [];
  const ctx = mock.context();
  const { createPlugin } = await import('../create-plugin.js');
  const plugin = createPlugin(def);

  // 1. Manifest Tests
  checks.push(def.id ? pass('Plugin has an id') : fail('Plugin must have an id'));
  checks.push(def.apiVersion ? pass('Plugin has apiVersion') : fail('Plugin must have apiVersion'));
  checks.push(def.version ? pass('Plugin has version') : fail('Plugin must have version'));
  checks.push(Array.isArray(def.capabilities) ? pass('Plugin has capabilities array') : fail('Plugin must declare capabilities'));
  checks.push(def.capabilities.length > 0 ? pass(`Plugin declares ${def.capabilities.length} capabilities`) : warn('Plugin declares zero capabilities'));

  // 2. Lifecycle Tests
  try {
    await plugin.init(ctx);
    checks.push(pass('plugin.init() completed without error'));
  } catch (e: any) {
    checks.push(fail('plugin.init() threw an error', e.message));
  }

  // 3. Health Tests
  try {
    const health = await plugin.health();
    checks.push(pass('plugin.health() completed without error'));
    if (typeof health.reachable === 'boolean') checks.push(pass('health() returns reachable boolean'));
    else checks.push(warn('health() should return { reachable: boolean }'));
  } catch (e: any) {
    checks.push(fail('plugin.health() threw an error', e.message));
  }

  // 4. Capability Tests
  for (const cap of def.capabilities) {
    switch (cap) {
      case 'discover':
        try {
          const resources = await plugin.discover();
          checks.push(pass(`capability "discover" returned ${resources.length} resources`));
        } catch (e: any) {
          checks.push(fail(`capability "discover" failed`, e.message));
        }
        break;

      case 'scan':
        try {
          const findings = await plugin.scan();
          checks.push(pass(`capability "scan" returned ${findings.length} findings`));
          for (const f of findings) {
            if (!f.id) checks.push(fail('Finding missing id'));
            if (!f.title) checks.push(fail('Finding missing title'));
            if (!f.severity) checks.push(fail('Finding missing severity'));
          }
        } catch (e: any) {
          checks.push(fail(`capability "scan" failed`, e.message));
        }
        break;

      case 'verify':
        try {
          const result = await plugin.verify('test', 'test');
          checks.push(pass('capability "verify" completed'));
          if (typeof result.verified === 'boolean') checks.push(pass('verify() returns { verified: boolean }'));
        } catch (e: any) {
          checks.push(fail(`capability "verify" failed`, e.message));
        }
        break;

      case 'remediate':
        try {
          const finding: Finding = { id: 'test', title: 'Test', description: '', severity: 'low', resource: { type: 'test', id: 'test' } };
          const result = await plugin.remediate(finding);
          checks.push(pass('capability "remediate" completed'));
          if (typeof result.success === 'boolean') checks.push(pass('remediate() returns { success: boolean }'));
        } catch (e: any) {
          checks.push(warn(`capability "remediate" threw (may be expected)`, e.message));
        }
        break;
    }
  }

  // 5. Shutdown Tests
  try {
    await plugin.shutdown();
    checks.push(pass('plugin.shutdown() completed without error'));
  } catch (e: any) {
    checks.push(warn('plugin.shutdown() threw an error', e.message));
  }

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const warnings_num = checks.filter((c) => c.status === 'warn').length;

  return { passed, failed, warnings: warnings_num, checks };
}
