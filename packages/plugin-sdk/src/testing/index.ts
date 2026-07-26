import type { PluginContext, PluginLogger, EventBus, Finding, VerificationResult, RemediationResult } from '../types.js';

/** Creates a mock PluginContext for testing. */
export function mockContext(overrides?: Partial<PluginContext>): PluginContext {
  const logs: string[] = [];
  return {
    pluginId: 'test-plugin',
    logger: mockLogger(logs),
    stateDir: '/tmp/mcpshield-test',
    config: {},
    eventBus: mockEventBus(),
    abortSignal: new AbortController().signal,
    ...overrides,
    _logs: logs,
  } as PluginContext & { _logs: string[] };
}

export function mockLogger(logs: string[] = []): PluginLogger {
  return {
    info: (msg) => logs.push(`[INFO] ${msg}`),
    warn: (msg) => logs.push(`[WARN] ${msg}`),
    error: (msg) => logs.push(`[ERROR] ${msg}`),
    debug: (msg) => logs.push(`[DEBUG] ${msg}`),
  };
}

export function mockEventBus(): EventBus {
  const emitted: any[] = [];
  const bus: EventBus & { emitted: any[] } = {
    emitted,
    emit: (event) => { emitted.push(event); },
  };
  return bus;
}

export function mockFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: 'test-finding',
    title: 'Test Finding',
    description: 'A test finding for unit tests',
    severity: 'medium',
    resource: { type: 'test-resource', id: 'resource-1' },
    ...overrides,
  };
}

export const mock = {
  context: mockContext,
  logger: mockLogger,
  eventBus: mockEventBus,
  finding: mockFinding,
};
