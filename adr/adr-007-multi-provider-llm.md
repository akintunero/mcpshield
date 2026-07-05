# ADR-007: Why Multi-Provider LLM Abstraction

## Status

Accepted

## Context

MCPShield requires an LLM for natural language interaction and AI-assisted security analysis. Workshop participants may have access to different LLM providers, and the project should not be tied to a single vendor.

## Decision

Define an `LLMProvider` interface and implement adapters for multiple providers.

## Rationale

- **Flexibility**: Participants can use whatever LLM they have access to
- **Free Tiers**: Supports both paid (NVIDIA NIM) and free (Gemini, Ollama) options
- **Local Option**: Ollama enables fully offline operation
- **Vendor Independence**: Not locked into any single provider
- **Extensibility**: New providers can be added by implementing a simple interface

## Supported Providers

- **NVIDIA NIM**: Default, uses OpenAI-compatible API (`integrate.api.nvidia.com`)
- **Google Gemini**: Uses the Gemini API via OpenAI-compatible endpoint
- **Ollama**: Local LLM for fully offline operation
- **OpenAI-Compatible**: Generic endpoint for any OpenAI-compatible API

## Alternatives Considered

- **Single Provider**: Simpler but limits the audience
- **Custom Fine-Tuned Model**: Powerful but expensive and unnecessary
- **No AI Abstraction**: Would make provider switching a major refactor

## Consequences

- Positive: Participants can choose their preferred LLM provider
- Positive: The `OpenAICompatibleProvider` can be reused for any OpenAI-compatible endpoint
- Positive: NVIDIA NIM is the default as it's the cheapest option for the workshop
- Neutral: Each provider has slightly different API behaviors
