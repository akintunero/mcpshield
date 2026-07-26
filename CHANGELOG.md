# Changelog

## [1.0.0] — 2026-07-26

### Added

- Plugin SDK v1 with `createPlugin()` API
- Worker thread sandboxing for plugins
- Ed25519 plugin signing and verification
- Plugin contract testing via `describePlugin()`
- Plugin marketplace service (local filesystem)
- CLI tool: `mcpshield create-plugin`, `doctor`, `plugin install/search/list`
- Workflow Engine with DAG-based execution
- EventBus for platform event publishing
- PluginHost with lifecycle management and crash recovery
- Connectors architecture (AWS SDK adapter)
- GitHub, Docker, and Markdown Reporter reference plugins
- RBAC with 4 roles (viewer, auditor, operator, admin)
- Multi-account scanning via STS AssumeRole
- Scheduled scan capability
- Audit log export (JSON, Syslog, Splunk HEC)
- Webhook notifications
- Input validation on all MCP tool arguments
- Rate limiting per API key
- CI/CD pipeline (GitHub Actions)
- E2E test suite
- Helm chart for Kubernetes deployment
- Deployment guide for production

### Changed

- Consolidated `@mcpshield/sdk` into `@mcpshield/plugin-sdk`
- `ResourceRef` and `ResourceSnapshot` types now provider-agnostic
- `state.json` writes now use Mutex locking for concurrent safety

### Removed

- `@mcpshield/sdk` package (migrate to `@mcpshield/plugin-sdk`)

### Security

- Plugin execution isolated in worker threads with memory limits
- Input validation and path traversal prevention
- Plugin signature verification
- Rate limiting per API key
- MCP server authentication required
