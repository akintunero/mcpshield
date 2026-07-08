# MCPShield Installation

## Prerequisites

- **Node.js** >= 22 (see `.nvmrc`)
- **pnpm** >= 9 (`npm install -g pnpm@11.9.0`)
- **Docker Desktop** (for running MCPShield containers)
- **LocalStack** (installed locally, not started by Docker Compose)
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

Edit `.env` with your Slack credentials and LLM provider API key. See [.env.example](../.env.example) for all available options.

## Docker Deployment

```bash
docker compose up --build
```

This starts:
- `mcp-server` on port 7801
- `api` on port 7802 (serves dashboard + REST API)
- `agent` (Slack bot daemon)
- `n8n` on port 5678 (optional workflow automation)

## Verify Installation

```bash
# Check MCP Server health
curl http://localhost:7801/health

# Check API health
curl http://localhost:7802/health
```
