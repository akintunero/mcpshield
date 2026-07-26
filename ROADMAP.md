# MCPShield Roadmap

## Platform (Current — Stable)

- [x] Plugin SDK v1 (`createPlugin()` API)
- [x] PluginHost (load, start, stop, health, crash recovery)
- [x] Workflow Engine (DAG-based execution)
- [x] EventBus (typed pub/sub)
- [x] Capability Router + Negotiation
- [x] Task Planner
- [x] Connectors Core Interface
- [x] Connector AWS SDK Adapter
- [x] Plugin Contract Testing (`describePlugin()`)
- [x] CLI (create-plugin, doctor, plugin management)
- [x] MarketplaceService Interfaces
- [x] AWS Reference Plugin (`cloud-aws`)
- [x] Security scoring engine
- [x] Audit history + Evidence engine
- [x] Dashboard + REST API
- [x] Slack bot agent

## Plugins (Next — Community Contributions)

| Plugin | Status | Priority |
|---|---|---|
| Cloud Azure | 🎯 Open for contribution | High |
| Cloud GCP | 🎯 Open for contribution | High |
| Kubernetes | 🎯 Open for contribution | High |
| Docker | 🎯 Open for contribution | Medium |
| Terraform | 🎯 Open for contribution | Medium |
| GitHub | 🎯 Open for contribution | Medium |
| GitLab | 🎯 Open for contribution | Low |
| Trivy Scanner | 🎯 Open for contribution | Medium |
| Semgrep | 🎯 Open for contribution | Low |
| Markdown Reports | 🎯 Open for contribution | Medium |
| HTML Reports | 🎯 Open for contribution | Medium |
| CIS Compliance | 🎯 Open for contribution | Medium |
| SOC2 Compliance | 🎯 Open for contribution | Low |

## Connectors

| Connector | Status |
|---|---|
| AWS SDK | ✅ Complete |
| Kubernetes API | 🎯 Skeleton ready, needs implementation |
| GitHub API | 🎯 Skeleton ready, needs implementation |
| Docker API | 🎯 Needs implementation |
| Terraform CLI | 🎯 Needs implementation |
| Azure SDK | 🎯 Needs implementation |
| GCP SDK | 🎯 Needs implementation |

## Marketplace (Future)

- [ ] Remote plugin registry (registry.mcpshield.dev)
- [ ] Plugin publishing workflow
- [ ] Version compatibility checking
- [ ] Plugin signing + verification
- [ ] Telemetry (opt-in usage stats)

## Workflow Engine (Future)

- [ ] Visual workflow editor
- [ ] Scheduled workflows (cron-based)
- [ ] Webhook-triggered workflows
- [ ] Parallel multi-account scanning
- [ ] AI-assisted workflow planning

## Enterprise (Future)

- [ ] SSO / SAML / OIDC integration
- [ ] RBAC for approval workflows
- [ ] Audit log export (SIEM)
- [ ] SLA tracking for remediation
- [ ] Custom compliance frameworks
- [ ] On-premise plugin registry

## Community

- [ ] GitHub Discussions for plugin development
- [ ] Plugin showcase page
- [ ] Weekly community calls
- [ ] Contributor ladder (user → plugin author → core contributor)
- [ ] Hackathons (focus: new connectors and plugins)
