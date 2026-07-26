# Troubleshooting

## Docker Daemon Not Running

**Symptom:** `docker info` fails with "Cannot connect to the Docker daemon"

**Resolution:** Start Docker Desktop from your Applications folder or system tray. On Linux: `sudo systemctl start docker`.

## LocalStack Unavailable

**Symptom:** Bootstrap script fails with "LocalStack is not reachable"

**Resolution:**
```bash
# Check if LocalStack is running
curl http://localhost:4566/_localstack/health

# Start LocalStack
localstack start -d

# Check for port conflicts
lsof -i :4566
```

## Port Conflicts

**Symptom:** Docker Compose fails with "port is already allocated"

**Resolution:** Check which service is using the port and stop it:
```bash
lsof -i :7801
kill -9 <PID>
```

## Slack Connection Timeout

**Symptom:** Agent logs show "Socket Mode connection failed"

**Resolution:**
1. Verify app token starts with `xapp-` (not `xoxb-`)
2. Verify Socket Mode is enabled in Slack App settings
3. Verify all required bot token scopes are added
4. Reinstall the app to workspace

## LLM Provider Authentication Error

**Symptom:** Agent fails with "401 Unauthorized" or "Authentication failed"

**Resolution:**
1. Verify API key in `.env`
2. Check the provider dashboard for active quotas
3. Switch to a different provider:
   ```bash
   LLM_PROVIDER=ollama
   OLLAMA_MODEL=llama3.1
   ```

## Node Version Mismatch

**Symptom:** Build fails with syntax errors

**Resolution:** Use Node.js 22+:
```bash
node --version  # Should be >=22
nvm use 22      # If using nvm
```

## pnpm Issues

**Symptom:** Install fails or "ERR_PNPM_LOCKFILE_MISSING"

**Resolution:**
```bash
pnpm install --frozen-lockfile  # If lockfile exists
pnpm install                     # To regenerate lockfile
```

## Build Failures

**Symptom:** TypeScript compilation errors

**Resolution:**
```bash
pnpm clean      # Remove all dist/ directories
pnpm install    # Reinstall dependencies
pnpm build      # Rebuild
```

## Missing Environment Variables

**Symptom:** Server starts but commands fail with config errors

**Resolution:** Ensure `.env` has all required variables. See `.env.example` for the complete list.

## n8n Startup Failure

**Symptom:** n8n container exits immediately

**Resolution:**
```bash
docker compose logs n8n
# Common fix: remove n8n data volume
docker compose down -v
docker compose up -d
```
