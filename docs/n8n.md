# n8n Workflow Automation

MCPShield includes optional n8n workflow definitions for automating security operations. **n8n is not started by docker compose** — core features work without it.

## Setup (optional)

Run n8n yourself, for example:

```bash
docker run -d --name mcpshield-n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=change-me \
  docker.n8n.io/n8nio/n8n:latest
```

Access the UI at `http://localhost:5678`.

## Import Workflows

1. Open n8n
2. **Workflows** → **Import from File**
3. Select `labs/n8n_workflows.json` (if present in your checkout)

## Available Workflows

| Workflow | Trigger | Description |
|---|---|---|
| Security Scan | Manual | Triggers a full environment scan via API/MCP |
| Finding Explanation | Webhook | Explains a specific finding with AI context |
| Approval Workflow | Webhook | Routes remediation for human approval |
| Remediation | Webhook | Executes approved remediation |
| Executive Report | Schedule | Generates periodic security reports |
| Slack Notifications | Webhook | Sends formatted alerts to Slack |

Point webhooks at the MCPShield API (`http://host:7802`) with `Authorization: Bearer <API_KEY>` when auth is enabled.
