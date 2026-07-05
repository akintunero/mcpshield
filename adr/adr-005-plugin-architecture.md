# ADR-005: Why Plugin-Based Provider Architecture

## Status

Accepted

## Context

MCPShield currently supports AWS through LocalStack. Making it a general-purpose cloud security platform requires supporting multiple providers (Azure, GCP, Kubernetes, GitHub, etc.) without changing the core MCP tools or AI agent.

## Decision

Define a `CloudProvider` interface that all providers implement. The MCP server and AI agent interact only through this interface.

## Rationale

- **Extensibility**: New providers can be added as packages without modifying core code
- **Separation of Concerns**: Provider-specific logic is isolated from the MCP tool layer
- **Testability**: Providers can be mocked or swapped for testing
- **Workshop Scope**: The workshop only implements AWS, but the architecture supports future expansion
- **Registry Pattern**: Providers register themselves, enabling runtime discovery

## Alternatives Considered

- **Monolithic Scanner**: Simple but impossible to extend without modifying core code
- **Adapters per Tool**: Would require changes to every MCP tool when adding a provider
- **Provider-Specific MCP Servers**: Complex deployment, harder to manage

## Consequences

- Positive: New providers can be added as packages (`packages/providers/*`)
- Positive: MCP tools don't need to change when providers are added
- Positive: Provider interface is small and focused (scan, remediate, health)
- Neutral: Existing AWS code needs refactoring to implement the interface
