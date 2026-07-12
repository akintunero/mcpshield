# n8n Workflow Automation

MCPShield includes pre-built n8n workflows for automating security operations. These are optional — all core features work without n8n.

## Setup

n8n starts automatically with Docker Compose:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    ports:
      - "5678:5678"
```

Access the n8n UI at `http://localhost:5678`.

Default credentials: `admin` / `mcpshield`.

## Import Workflows

1. Open n8n at `http://localhost:5678`
2. Go to **Workflows** → **Import from File**
3. Select `labs/n8n_workflows.json`

## Available Workflows

| Workflow | Trigger | Description |
|---|---|---|
| Security Scan | Manual | Triggers a full environment scan via MCP |
| Finding Explanation | Webhook | Explains a specific finding with AI context |
| Approval Workflow | Webhook | Routes remediation for human approval |
| Remediation | Webhook | Executes approved remediation |
| Executive Report | Schedule | Generates periodic security reports |
| Slack Notifications | Webhook | Sends formatted alerts to Slack |
