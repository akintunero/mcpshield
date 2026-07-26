# Deployment Guide

## Docker Compose (Development)

```bash
cp .env.example .env
# Edit .env with your tokens
docker compose up -d
```

## Docker Compose (Production against real AWS)

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
export MCP_API_KEY=your-mcp-api-key
export API_KEY=your-api-key

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## Kubernetes (Helm)

```bash
# Install
helm upgrade --install mcpshield ./deploy/charts/mcpshield \
  --set secrets.mcpApiKey=your-key \
  --set secrets.apiKey=your-key \
  --set ingress.enabled=true \
  --set ingress.host=mcpshield.example.com

# Uninstall
helm uninstall mcpshield
```

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MCP_API_KEY` | Yes | Auth token for MCP server |
| `API_KEY` | Yes | Auth token for REST API |
| `SLACK_BOT_TOKEN` | For Slack | Slack bot token |
| `SLACK_APP_TOKEN` | For Slack | Slack app-level token |
| `LLM_PROVIDER` | For AI | `nim`, `ollama`, `gemini`, or `openai-compatible` |
| `NIM_API_KEY` | For NIM | NVIDIA NIM API key |
| `AWS_ACCESS_KEY_ID` | For AWS | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | For AWS | AWS secret key |

## Health Checks

All services expose `/health`:

- MCP Server: `http://localhost:7801/health`
- API: `http://localhost:7802/health`

## Persistent Storage

State is stored at `MCPSHIELD_STATE_DIR` (default: `./.mcpshield-state`).
In production, mount a persistent volume at this path.
