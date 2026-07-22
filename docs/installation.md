# MCPShield Installation

## Prerequisites

- **Node.js** >= 22 (see `.nvmrc`)
- **pnpm** >= 9 (`npm install -g pnpm@11.9.0`)
- **Docker Desktop** (for Docker deployment)
- **LocalStack** or an AWS endpoint
- **AWS CLI v2** (optional but recommended)

## Quick Install

```bash
# Clone the repository
git clone https://github.com/akintunero/mcpshield.git
cd mcpshield

# Install dependencies
pnpm install

# Build all packages and apps
pnpm build
```

## Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your credentials. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` | AWS endpoint to scan |
| `LLM_PROVIDER` | `nim` | LLM backend (nim, ollama, gemini) |
| `NIM_API_KEY` | – | NVIDIA NIM API key |
| `SLACK_BOT_TOKEN` | – | Slack bot token |
| `API_KEY` | (empty) | REST API auth key. Clients send `Authorization: Bearer <key>`. Empty = no auth (dev) |
| `RATE_LIMIT_MAX` | `100` | Max requests/min per IP |
| `TLS_KEY_PATH` | – | TLS key file path (enables HTTPS) |
| `TLS_CERT_PATH` | – | TLS cert file path |
| `STATE_BACKUP_COUNT` | `5` | State file backups to retain |

## Run (Local Development)

```bash
# Terminal 1 — MCP Server (port 7801)
pnpm --filter @mcpshield/mcp-server dev

# Terminal 2 — API + Dashboard (port 7802)
pnpm --filter @mcpshield/api dev

# Terminal 3 (optional) — Slack Agent
pnpm --filter @mcpshield/agent dev
```

Open the dashboard at **http://localhost:7802**.

## Docker Deployment (workshop / LocalStack)

```bash
docker compose up --build
```

This starts:
- `localstack` (community) on port 4566 (auto-provisions demo resources)
- `mcp-server` on port 7801
- `api` on port 7802 (serves dashboard + REST API)
- `agent` (Slack bot daemon)

## Production (real AWS)

See [deployment.md](./deployment.md) and [iam-policy.md](./iam-policy.md).

```bash
export API_KEY=... MCP_API_KEY=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
docker compose -f docker-compose.prod.yml up --build -d
```

## Verify Installation

```bash
./scripts/e2e-smoke.sh

# Or manually:
curl http://localhost:7801/health
curl http://localhost:7802/health
curl http://localhost:7802/metrics
```
