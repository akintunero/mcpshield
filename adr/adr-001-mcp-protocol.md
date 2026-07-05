# ADR-001: Why Model Context Protocol

## Status

Accepted

## Context

MCPShield needs a standardized way for an AI agent to interact with cloud security tools. The agent must be able to scan environments, detect vulnerabilities, generate remediations, and execute fixes — all through a controlled, auditable interface.

## Decision

Use the Model Context Protocol (MCP) as the communication protocol between the AI agent and the security tooling layer.

## Rationale

- **Standardization**: MCP is an open protocol (similar to LSP) that provides a standard interface for AI tool calling
- **Security Boundary**: The protocol enforces a clear separation between the AI and the underlying systems — the AI never directly calls AWS APIs
- **Tool Discovery**: MCP's `list_tools` capability allows the AI to discover available tools at runtime
- **Type Safety**: Tool inputs and outputs are defined with JSON Schema, enabling validation
- **Future-Proof**: Adding new tools or providers doesn't require changing the protocol

## Alternatives Considered

- **Direct Function Calling**: Simple but tightly couples the AI to specific implementations and provides no security boundary
- **Custom REST API**: Would work but lacks standardization and tool discovery
- **gRPC**: More complex and less suitable for the workshop audience

## Consequences

- Positive: Clean separation of concerns, standardized tool interface, auditable
- Positive: Workshop participants learn an emerging industry standard
- Neutral: Requires running an MCP server alongside the agent
