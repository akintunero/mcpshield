# 1.0.0 (2026-07-26)


### Bug Fixes

* **dashboard:** compact layout, floating chat widget, fix tab alignment ([54becb9](https://github.com/akintunero/mcpshield/commit/54becb936e146378221b2c6e922070662fbb1417))
* e2e tests skip by default in CI — require MCPSHIELD_E2E=true ([fc1d86a](https://github.com/akintunero/mcpshield/commit/fc1d86ada2c27688ef0150118f9947ba68451a90))
* remove explicit pnpm version from CI workflows — use packageManager field ([a4c274c](https://github.com/akintunero/mcpshield/commit/a4c274cfc9a8c01644c034d65e1044ed09b65db9))
* resolve CI lint and format errors ([c89976e](https://github.com/akintunero/mcpshield/commit/c89976ee4112ad150903023adf4ca07cb90e5bf1))


### Features

* add LocalStack with auto-provisioning for 57+ demo vulnerabilities ([eb7b326](https://github.com/akintunero/mcpshield/commit/eb7b326c575ccf0106586dd92f2c05f43adfb2f3))
* **agent:** add ELI5 and quiz learning modules ([628001a](https://github.com/akintunero/mcpshield/commit/628001af04f25c161e49e3b80aa7ef6796f218d7))
* **agent:** add entry point and demo mode ([370c52f](https://github.com/akintunero/mcpshield/commit/370c52f1acb5f3f21d3a591d5f624afb560411bb))
* **agent:** add LLM providers (OpenAI-compatible, Ollama) ([f548a8e](https://github.com/akintunero/mcpshield/commit/f548a8ed3ec4fca07f9b979872cd20dbb8fc5d26))
* **agent:** add MCP client with HTTP SSE and stdio transport ([16b7291](https://github.com/akintunero/mcpshield/commit/16b72919d8895d5dbdbe76dfdfe7d1a20ac6397b))
* **agent:** add Slack bot with 15+ commands ([58f1e00](https://github.com/akintunero/mcpshield/commit/58f1e00c641e3ba843ebf66b1d0f1076d7bbc6e7))
* **api:** add Fastify REST API with health, state, endpoints ([8e8ac41](https://github.com/akintunero/mcpshield/commit/8e8ac412aab6eaa9e463c2b7ffea7ab52eca4d7c))
* **api:** add MCP client for server communication ([cc589b3](https://github.com/akintunero/mcpshield/commit/cc589b3434a70300ce539871f89be0788a62a0ef))
* **aws-cli-generator:** add AWS CLI remediation command generator ([d7c7459](https://github.com/akintunero/mcpshield/commit/d7c74591632687adf63921f6f675c4dfe88b355c))
* **aws-tools:** add AWS SDK client initialization and multi-service scanner ([d3c2710](https://github.com/akintunero/mcpshield/commit/d3c2710412a63f37340781eb94dd652ebe4539e2))
* **aws-tools:** add package exports and smoke test ([fb94153](https://github.com/akintunero/mcpshield/commit/fb941533ed000b4f625987cb9e52a70ef8771a1b))
* **aws-tools:** add remediation action executor for all services ([5715d60](https://github.com/akintunero/mcpshield/commit/5715d6019f95ad446f4133acfebda436dfc36626))
* **config:** add Zod-validated environment config loader ([271a118](https://github.com/akintunero/mcpshield/commit/271a118903a4441721230abb2cbd8291f5bfe251))
* **dashboard:** add web dashboard (HTML, CSS, JS) ([f45efda](https://github.com/akintunero/mcpshield/commit/f45efda33a829e4e69a6770800a99feaefa8856c))
* **finding-engine:** add finding catalog with 21 entries and registry ([8ba7969](https://github.com/akintunero/mcpshield/commit/8ba7969506bc943b9bdc7d2b9004a239fadc2425))
* **llm:** extract shared LLM provider adapters into package ([a639896](https://github.com/akintunero/mcpshield/commit/a639896432aef3ff93c51c35174c215362704cc8))
* **logger:** add structured Pino logger with secret redaction ([cb0f8a5](https://github.com/akintunero/mcpshield/commit/cb0f8a5b715524ca60e81ef806f266f58d24363c))
* **mcp-server:** add MCP server with 11 security tools and state persistence ([f082582](https://github.com/akintunero/mcpshield/commit/f0825820d16f3ad8a7348d632bc46c1a2ebe2513))
* production hardening - API auth, rate limiting, TLS, graceful shutdown, metrics, state backups ([5748034](https://github.com/akintunero/mcpshield/commit/5748034c9a8c5fbbaae8abdf6d5c83ef2fa053ce))
* production hardening, multi-session MCP, auth, CORS, dashboard bearer, IAM docs ([360e250](https://github.com/akintunero/mcpshield/commit/360e250bbb84e87b76afec4ff733ad0628b946f7))
* **report-generator:** add executive Markdown report generator ([ba3b927](https://github.com/akintunero/mcpshield/commit/ba3b9271796553af32113f1de98b1f7a2ee51971))
* **scoring-engine:** add security scoring 0-100 with A-F grading ([6147f98](https://github.com/akintunero/mcpshield/commit/6147f98cfe895575864bfe422cd12edce7b36046))
* **security-engine:** add 21 security rules for all AWS services ([ac8db23](https://github.com/akintunero/mcpshield/commit/ac8db2399673e2afa1d45c4871d153274f5f283a))
* **security-engine:** add engine orchestrator with MITRE and CIS mappings ([b6a338b](https://github.com/akintunero/mcpshield/commit/b6a338befc37ce9c47b1e20c817f7cd1246548b5))
* **shared:** add shared utilities (ID generation, Result, retry) ([cad903e](https://github.com/akintunero/mcpshield/commit/cad903e73ec5b30393a8e2f34410b42a9ce18930))
* **terraform-generator:** add Terraform HCL remediation generator ([9893b11](https://github.com/akintunero/mcpshield/commit/9893b1156700eca40d2b1e777e6a2c04e132a9fb))
* **types:** add core domain types and Zod schemas ([9771267](https://github.com/akintunero/mcpshield/commit/9771267f38786196a06c88c1c8fe5ff34dce808f))
* v1.0.0 production readiness ([47bf1e2](https://github.com/akintunero/mcpshield/commit/47bf1e26047806879eb5c39f1a47068f99300166))

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
