# API Stability and Deprecation Policy

**Effective:** v1.0.0

## Stable APIs

These APIs will not break within the v1.x major version series.

| API | Package | Status |
|---|---|---|
| `createPlugin()` | `@mcpshield/plugin-sdk` | ✅ Stable |
| `PluginDefinition` | `@mcpshield/plugin-sdk` | ✅ Stable |
| `PluginContext` | `@mcpshield/plugin-sdk` | ✅ Stable |
| `Finding` | `@mcpshield/plugin-sdk` | ✅ Stable |
| `VerificationResult` | `@mcpshield/plugin-sdk` | ✅ Stable |
| `RemediationResult` | `@mcpshield/plugin-sdk` | ✅ Stable |
| `describePlugin()` | `@mcpshield/plugin-sdk/testing` | ✅ Stable |
| `plugin.json` manifest | `plugin.json` | ✅ Stable |
| `MCPPlugin` (legacy) | `@mcpshield/plugin-sdk` (v1-compat) | ⚠️ Deprecated (v2 removal) |
| `@mcpshield/sdk` | — | 🚫 Removed in v1.0. Use `@mcpshield/plugin-sdk` |

## Experimental APIs

These may change in minor versions. Use with caution.

| API | Package | Status |
|---|---|---|
| `WorkflowEngine` | `@mcpshield/mcp-core` | 🧪 Experimental |
| `TaskPlanner` | `@mcpshield/mcp-core` | 🧪 Experimental |
| `MarketplaceService` | `@mcpshield/mcp-core` | 🧪 Experimental |
| `PluginHost` | `@mcpshield/mcp-core` | 🧪 Experimental |

## Deprecation Process

1. **Deprecation notice** — Marked as deprecated in doc comments + changelog
2. **Grace period** — Available for 2 minor versions (e.g., v1.2 → removed in v1.4)
3. **Removal** — Breaking change in the next MAJOR version

## Version Scheme

Follows [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (v1→v2): Breaking API changes
- **MINOR** (v1.0→v1.1): New features, backward-compatible
- **PATCH** (v1.0.0→v1.0.1): Bug fixes, no API changes

## Changelog

All notable changes are documented in [CHANGELOG.md](./CHANGELOG.md),
generated automatically from conventional commits.
