# Deployment

## Modes

| Mode | Command | Target |
|------|---------|--------|
| Local / workshop | `docker compose up --build` | LocalStack community + apps |
| Production (single host) | `docker compose -f docker-compose.prod.yml up --build -d` | Real AWS |

## Local workshop

```bash
cp .env.example .env
# Fill Slack + LLM keys as needed
docker compose up --build
```

- Dashboard: http://localhost:7802  
- MCP health: http://localhost:7801/health  
- LocalStack: http://localhost:4566/_localstack/health  

Local compose uses **LocalStack community** (no `LOCALSTACK_AUTH_TOKEN`).  
`NODE_ENV=development` so `API_KEY` / `MCP_API_KEY` are optional.

## Production (real AWS)

```bash
export API_KEY="$(openssl rand -hex 32)"
export MCP_API_KEY="$(openssl rand -hex 32)"
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1
export CORS_ORIGINS=https://dashboard.example.com

# In .env: Slack + LLM secrets, leave LOCALSTACK_ENDPOINT empty
docker compose -f docker-compose.prod.yml up --build -d
```

Production **requires** `API_KEY` and `MCP_API_KEY`.

### TLS

Terminate TLS at a reverse proxy (Caddy, nginx, Traefik) in front of port `7802`.  
In-app `TLS_KEY_PATH` / `TLS_CERT_PATH` are optional fallbacks only.

### Networking

- Expose **only** `7802` (API + dashboard) publicly (via proxy).
- Keep **7801** (MCP) on the private Docker network — never public.
- Agent uses Slack Socket Mode (outbound only).

### State

State is a JSON file on the shared `mcpshield-state` volume.  
**Single-replica only** — do not scale `mcp-server` or `api` above 1 replica without a shared store.

### Auth

| Secret | Used by |
|--------|---------|
| `API_KEY` | REST `/api/*` — dashboard prompts and stores in `localStorage` |
| `MCP_API_KEY` | MCP `/sse` and `/messages` — agent + api clients |

### IAM

See [iam-policy.md](./iam-policy.md).

## Smoke test

```bash
./scripts/e2e-smoke.sh
```

## n8n

n8n is **optional** and **not** started by compose. Run separately if needed — see [n8n.md](./n8n.md).
