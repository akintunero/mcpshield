# ADR-002: Why LocalStack for Workshop

## Status

Accepted

## Context

MCPShield needs a realistic AWS environment for workshop participants to scan and remediate. Using real AWS accounts would be expensive, risky, and require participants to have AWS accounts.

## Decision

Use LocalStack as the mock AWS environment. LocalStack runs locally and emulates AWS APIs.

## Rationale

- **Zero Cost**: Free and open-source
- **Safety**: No risk of accidental cloud spend or data exposure
- **Local First**: Works offline, no AWS account required
- **Realistic**: Emulates 15+ AWS services with actual API responses
- **Workshop Friendly**: Participants can reset their environment instantly

## Alternatives Considered

- **Real AWS**: Expensive, risky, requires account setup, introduces cloud spend anxiety
- **AWS Sandbox**: Complex to set up, limited availability
- **Mock Library**: Wouldn't provide realistic API behavior

## Consequences

- Positive: Workshop participants can follow along without cloud accounts
- Positive: Environment can be destroyed and recreated instantly
- Neutral: Some AWS features are not fully emulated by LocalStack
- Negative: Docker Compose does not start LocalStack (participants run it separately)
