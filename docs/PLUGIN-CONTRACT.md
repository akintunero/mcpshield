# Plugin Contract

Every MCPShield plugin MUST pass the contract test suite.

## Running Contract Tests

```typescript
import { describePlugin } from '@mcpshield/plugin-sdk/testing';
import myPlugin from '../src/index.js';

const report = await describePlugin(myPlugin);
// { passed: 12, failed: 0, warnings: 0, checks: [...] }
```

## What Is Tested

| Check | Description |
|---|---|
| `id` | Plugin must have a unique identifier |
| `apiVersion` | Must declare `v1` |
| `capabilities` | Must declare at least one capability |
| `init()` | Must not throw |
| `health()` | Must return `{ reachable: boolean }` |
| `scan()` | Must return `Finding[]` |
| `verify()` | Must return `{ verified: boolean }` |
| `remediate()` | Must return `{ success: boolean }` |
| `shutdown()` | Must not throw |

## Finding Format

```typescript
interface Finding {
  id: string;              // unique: "plugin-name/type/resource"
  catalogId?: string;      // optional catalog reference
  title: string;           // human-readable
  severity: 'critical' | 'high' | 'medium' | 'low';
  resource: {
    type: string;          // "bucket", "user", "pod"
    id: string;            // resource identifier
    location?: string;     // region/zone/cluster
  };
  remediation?: {
    summary: string;
    cli?: string;
    terraform?: string;
  };
  evidence?: Record<string, unknown>;
  riskScore?: number;
}
```
