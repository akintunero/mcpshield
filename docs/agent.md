# AI Security Analyst Agent

The agent is the AI-powered security analyst that orchestrates the entire workflow.

## Architecture

```
Slack → Agent (LLM + MCP Client) → MCP Server → LocalStack
```

The agent:

1. Listens for `@Shield` mentions in Slack
2. Routes commands to the appropriate MCP tools
3. Uses an LLM for reasoning on complex queries
4. Formats responses professionally

## Slack Commands

| Command | Action |
|---|---|
| `@Shield scan environment` | Perform a full security scan |
| `@Shield show findings` | List all security findings |
| `@Shield show critical` | Filter findings by severity |
| `@Shield explain finding <id>` | Get detailed explanation |
| `@Shield generate terraform finding <id>` | Generate Terraform fix |
| `@Shield generate aws-cli finding <id>` | Generate AWS CLI fix |
| `@Shield fix finding <id>` | Request remediation approval |
| `@Shield fix all critical` | Request approval for all critical |
| `@Shield approve` | Approve pending remediation |
| `@Shield rescan` | Re-scan environment |
| `@Shield security score` | Show current posture score |
| `@Shield generate report` | Generate executive report |

## LLM Provider Abstraction

The agent supports multiple LLM providers:

- **NVIDIA NIM** (default) — `LLM_PROVIDER=nim`
- **Ollama** (local) — `LLM_PROVIDER=ollama`
- **Google Gemini** — `LLM_PROVIDER=gemini`
- **OpenAI-compatible** — `LLM_PROVIDER=openai-compatible`

## Human-in-the-Loop

The agent NEVER executes write operations directly. Remediations require:

1. **Explain** — Finding is presented with risk
2. **Recommend** — Remediation code is generated
3. **Approve** — Human types `@Shield approve`
4. **Execute** — Remediation runs against LocalStack
5. **Verify** — Re-scan confirms the fix
