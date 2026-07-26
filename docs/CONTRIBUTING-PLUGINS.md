# Contributing Plugins

## Process

1. Run `mcpshield create-plugin`
2. Implement capability handlers
3. Run `mcpshield plugin test .` to verify contract
4. Submit PR to `packages/plugins/<category>/<name>/`

## File Structure

```
plugins/cloud/my-cloud/
├── plugin.json          # metadata + capabilities
├── package.json         # npm dependencies
├── tsconfig.json
├── src/
│   ├── index.ts         # default export from createPlugin()
│   └── index.test.ts    # contract tests
└── README.md
```

## Convention

| Rule | Reason |
|---|---|
| Plugin ID must be `kebab-case` | Used in MCP tool naming |
| All capabilities must have tests | `describePlugin()` enforces this |
| No direct vendor SDK imports | Use Connectors package |
| Plugin must not access filesystem | Except through `ctx.stateDir` |
| Plugin must not spawn processes | Except through Connector abstractions |

## Best Practices

- Use `ctx.logger` for all logging — it's namespaced per plugin
- Use `ctx.eventBus` to emit events — core subscribes automatically
- Handle `ctx.abortSignal` for graceful cancellation
- Return empty arrays instead of throwing for missing resources
- Set `riskScore` (0-100) on findings for proper severity ranking
