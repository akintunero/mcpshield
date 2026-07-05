# ADR-004: Why Human-in-the-Loop Approval

## Status

Accepted

## Context

MCPShield can execute remediation actions against a cloud environment. Allowing an AI to autonomously make changes introduces significant risk. The workshop must demonstrate responsible AI security practices.

## Decision

Require explicit human approval before any write operation is executed.

## Rationale

- **Safety**: Prevents unintended or malicious changes
- **Education**: Demonstrates responsible AI agent design patterns
- **Audit Trail**: Creates a clear record of who approved what
- **Trust**: Users are more likely to adopt AI-assisted security when they remain in control
- **Workshop Value**: The approval workflow is itself a learning objective

## Alternatives Considered

- **Full Autonomy**: Faster but dangerous and irresponsible for production use
- **Pre-Approved Rules**: Would work for known-safe operations but reduces the learning value
- **No Approval**: Simple but undermines the workshop's security messaging

## Consequences

- Positive: Demonstrates safe AI agent design
- Positive: Adds a valuable workshop module on approval workflows
- Neutral: Adds one extra step to the remediation flow
