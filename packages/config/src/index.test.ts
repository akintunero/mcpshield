import { describe, it, expect } from 'vitest';
import { loadConfig, requireSlack, requireLLM, ConfigError } from './index.js';

const BASE: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LOCALSTACK_ENDPOINT: 'http://localhost:4566',
};

describe('loadConfig', () => {
  it('applies sensible defaults', () => {
    const cfg = loadConfig(BASE);
    expect(cfg.aws.region).toBe('us-east-1');
    expect(cfg.mcp.transport).toBe('http');
    expect(cfg.mcp.httpPort).toBe(7801);
    expect(cfg.llm.provider).toBe('nim');
    expect(cfg.llm.nim.baseUrl).toContain('nvidia');
  });

  it('coerces numeric ports', () => {
    const cfg = loadConfig({ ...BASE, API_PORT: '9090' });
    expect(cfg.api.port).toBe(9090);
  });

  it('throws ConfigError on invalid endpoint', () => {
    expect(() => loadConfig({ ...BASE, LOCALSTACK_ENDPOINT: 'not-a-url' })).toThrow(ConfigError);
  });

  it('rejects invalid provider values', () => {
    expect(() => loadConfig({ ...BASE, LLM_PROVIDER: 'bogus' })).toThrow(ConfigError);
  });
});

describe('guards', () => {
  it('requireSlack throws when tokens are missing', () => {
    const cfg = loadConfig(BASE);
    expect(() => requireSlack(cfg)).toThrow(/SLACK_BOT_TOKEN/);
  });

  it('requireSlack passes when tokens are present', () => {
    const cfg = loadConfig({ ...BASE, SLACK_BOT_TOKEN: 'xoxb-x', SLACK_APP_TOKEN: 'xapp-x' });
    expect(() => requireSlack(cfg)).not.toThrow();
  });

  it('requireLLM enforces NIM key for the default provider', () => {
    const cfg = loadConfig(BASE);
    expect(() => requireLLM(cfg)).toThrow(/NIM_API_KEY/);
  });

  it('requireLLM passes for ollama without a key', () => {
    const cfg = loadConfig({ ...BASE, LLM_PROVIDER: 'ollama' });
    expect(() => requireLLM(cfg)).not.toThrow();
  });
});
