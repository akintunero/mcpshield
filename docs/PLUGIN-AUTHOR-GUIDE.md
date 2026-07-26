# Plugin Author Guide

## Writing a Plugin in Under 50 Lines

```typescript
import { createPlugin } from '@mcpshield/plugin-sdk';

export default createPlugin({
  apiVersion: 'v1',
  id: 'health-check',
  name: 'Simple Health Check',
  version: '1.0.0',
  category: 'monitoring',
  capabilities: ['scan'],

  async scan(ctx) {
    const response = await fetch('https://api.example.com/health');
    if (!response.ok) {
      return [{
        id: 'health-check/endpoint-down',
        title: 'Health endpoint unreachable',
        severity: 'critical',
        resource: { type: 'endpoint', id: 'api.example.com' },
      }];
    }
    return [];
  },
});
```

## Structure

```
my-plugin/
├── plugin.json         # metadata + capabilities
├── src/
│   └── index.ts        # default export from createPlugin()
├── dist/               # compiled JavaScript
└── package.json
```

## plugin.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "apiVersion": "v1",
  "version": "1.0.0",
  "category": "cloud",
  "capabilities": ["discover", "scan", "verify"]
}
```

## Installation

```bash
# Local development
cp -r my-plugin packages/plugins/my-plugin

# Production
npm install @mcpshield/my-plugin
mcpshield plugin install @mcpshield/my-plugin
```

## Categories

| Category | Examples |
|---|---|
| `cloud` | AWS, Azure, GCP, DigitalOcean |
| `containers` | Docker, Kubernetes, Nomad |
| `iac` | Terraform, OpenTofu, Pulumi |
| `code` | GitHub, GitLab, Bitbucket |
| `scanners` | Trivy, Semgrep, ZAP, Nuclei |
| `identity` | Entra ID, Okta, Keycloak |
| `reporting` | Markdown, HTML, SARIF, PDF |
| `compliance` | SOC2, PCI DSS, ISO 27001, CIS |
