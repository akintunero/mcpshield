# Contributing to MCPShield

Thank you for your interest in contributing! This project was built for **Build with AI OAU 2026** and aims to be a high-quality, production-grade open-source cloud security tool.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/akintunero/mcpshield.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Install deps: `pnpm install`
5. Build: `pnpm build`
6. Run checks: `pnpm check`

## Development Workflow

- All code is TypeScript with strict mode enabled
- Use `pnpm` as the package manager (never npm or yarn)
- Run `pnpm check` before committing (typecheck + lint + format + test)
- Write tests for new functionality
- Follow the existing code style (Prettier will auto-format)

## Code Standards

- **Strict TypeScript** — no `any` where avoidable, `noUncheckedIndexedAccess` is enabled
- **Zod validation** — all MCP tool inputs and public APIs must have Zod schemas
- **Clean Architecture** — packages are domain-focused, apps are composition
- **SOLID principles** — single responsibility, dependency injection via imports

## Project Structure

```
apps/          # Runnable applications (agent, mcp-server, api, dashboard)
packages/      # Reusable libraries (aws-tools, security-engine, etc.)
docs/          # Documentation
labs/          # Workshop labs
scripts/       # Bootstrap and provisioning
```

## Adding a Security Rule

1. Add the rule function in `packages/security-engine/src/rules.ts`
2. Add the catalog entry in `packages/finding-engine/src/catalog.ts`
3. Write tests in `packages/security-engine/src/engine.test.ts`
4. Add remediation mapping in `apps/mcp-server/src/server.ts` (if applicable)

## Commit Messages

Use conventional commits format: `type(scope): description`

Examples:
- `feat(scanner): add VPC flow log analysis`
- `fix(agent): handle empty findings gracefully`
- `docs(readme): update architecture diagram`

## Pull Request Process

1. Ensure `pnpm check` passes
2. Update documentation if needed
3. Add tests for new functionality
4. Open a PR against `main` with a clear description

## Questions?

Open an issue or reach out to the maintainers. We welcome contributions of all sizes!
