# ADR-006: Why Declarative Rules Engine

## Status

Accepted

## Context

MCPShield's security rules were initially implemented as hardcoded TypeScript functions (e.g., `checkPublicS3Bucket()`). Adding or modifying rules requires code changes, rebuilds, and redeployment.

## Decision

Use a declarative rules engine where rules are defined in YAML files and loaded dynamically at runtime.

## Rationale

- **Extensibility**: New rules can be added as YAML files without code changes
- **Readability**: Non-developers can understand and write rules in YAML
- **Dynamic Loading**: Rules can be loaded from directories, databases, or external sources
- **Framework Mapping**: Declarative format easily supports CIS, NIST, OWASP, and MITRE mappings
- **Versioning**: Rule sets have versions, enabling gradual rollouts

## Alternatives Considered

- **Hardcoded Functions**: Simple but requires code changes for every rule modification
- **Database-Driven**: More complex than needed; YAML is simpler for the workshop
- **Policy-as-Code (Rego)**: Powerful but adds a steep learning curve

## Consequences

- Positive: Rules are human-readable YAML files
- Positive: The `RuleEngine` class evaluates conditions against resource snapshots
- Positive: Backward-compatible — existing hardcoded rules still work
- Neutral: Complex conditions require the `any_of` / `all_of` operators
