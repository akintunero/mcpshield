import { describe, it, expect, beforeAll } from 'vitest';

const shouldSkip = process.env.SKIP_E2E === 'true' || !process.env.CI;
beforeAll(() => {
  if (shouldSkip) {
    console.log('Skipping E2E tests — set CI=true or start docker compose');
  }
});

const API = process.env.API_URL || 'http://localhost:7802';
const API_KEY = process.env.API_KEY || '';
const headers: Record<string, string> = { 'Content-Type': 'application/json' };
if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  const body = await res.text();
  try { return { status: res.status, data: JSON.parse(body) }; }
  catch { return { status: res.status, data: body }; }
}

const testOrSkip = shouldSkip ? describe.skip : describe;

testOrSkip('MCPShield Smoke Tests', () => {

  it('health endpoint returns ok', async () => {
    const { status, data } = await api('/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('catalog returns 24 entries', async () => {
    const { status, data } = await api('/api/catalog');
    expect(status).toBe(200);
    expect(data.total).toBe(24);
  });

  it('scan detects vulnerabilities', async () => {
    const { status, data } = await api('/api/scan', { method: 'POST' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const lastScan = data.lastScan;
    expect(lastScan.resourcesScanned).toBeGreaterThan(0);
  });

  it('state returns findings and score', async () => {
    const { status, data } = await api('/api/state');
    expect(status).toBe(200);
    expect(data.score).toBeDefined();
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.findings.length).toBeGreaterThan(0);
  });
});
