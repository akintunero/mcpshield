import { describe, it, expect } from 'vitest';

describe('aws-tools package', () => {
  it('exports required symbols', async () => {
    const mod = await import('./index.js');
    expect(mod.scanEnvironment).toBeDefined();
    expect(mod.executeRemediationAction).toBeDefined();
    expect(mod.s3Client).toBeDefined();
    expect(mod.iamClient).toBeDefined();
    expect(mod.ec2Client).toBeDefined();
  });
});
