# ADR-003: Why Slack as the Interface

## Status

Accepted

## Context

MCPShield needs a user interface that is accessible, familiar, and works without building a custom frontend. The interface should support natural language interaction with the AI security analyst.

## Decision

Use Slack as the primary user interface through a Socket Mode bot.

## Rationale

- **Familiarity**: Most developers and security professionals already use Slack
- **Natural Language**: Slack's chat interface supports conversational interaction
- **Socket Mode**: No public-facing webhooks or ports required — ideal for local workshops
- **Rich Formatting**: Supports markdown, code blocks, and attachments
- **Event-Driven**: Bot responds to mentions in real-time
- **No Frontend Development**: The dashboard is a supplementary option, not required

## Alternatives Considered

- **Custom Web UI**: Requires significant frontend development and hosting
- **CLI-only**: Less engaging for workshop format
- **Discord/Teams**: Less familiar to the target developer audience

## Consequences

- Positive: Instant familiarity for participants
- Positive: Socket Mode means no deployment complexity
- Neutral: Requires a Slack workspace and app creation
