# MCP Server

The MCP (Model Context Protocol) server exposes cloud security tools that the AI agent can call. It acts as a security boundary — the AI Agent never communicates directly with AWS.

## Architecture

```
AI Agent → MCP Client → MCP Server → AWS SDK → LocalStack
```

The MCP Server:

1. Receives tool calls from the AI Agent
2. Validates inputs with Zod schemas
3. Executes AWS SDK operations
4. Scans, analyzes, and remediates security findings
5. Persists state to disk

## Transport

Two transport modes are supported:

### HTTP/SSE (default for Docker)

```
MCP_TRANSPORT=http
MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_PORT=7801
```

The server exposes SSE on `/sse` and receives messages on `/messages`.

### Stdio (default for local development)

```bash
MCP_TRANSPORT=stdio npx tsx apps/mcp-server/src/index.ts
```

## MCP Tools

| Tool | Description |
|---|---|
| `scan_environment` | Scan AWS resources and detect vulnerabilities |
| `list_findings` | List all detected security findings |
| `describe_finding` | Get detailed information about a specific finding |
| `security_score` | Calculate current security posture score |
| `generate_report` | Generate an executive security assessment report |
| `generate_cli_fix` | Generate AWS CLI commands to fix a finding |
| `generate_terraform_fix` | Generate Terraform HCL to fix a finding |
| `approve_remediation` | Approve a pending remediation action |
| `execute_remediation` | Execute approved remediation against LocalStack |
| `rescan_environment` | Re-scan to verify remediations |
| `health` | Check server and LocalStack connectivity |

## Tool Schema Example

Each tool has a Zod schema for input validation. For example, `list_findings`:

```typescript
const ListFindingsInputSchema = z.object({
  severity: SeveritySchema.optional(),
});
```

## Error Handling

All tools return structured JSON responses. Errors include a descriptive message and are logged via Pino.
