import { z } from 'zod';

/** Supported LLM provider identifiers. */
export const LLMProviderNameSchema = z.enum(['nim', 'ollama', 'gemini', 'openai-compatible']);
export type LLMProviderName = z.infer<typeof LLMProviderNameSchema>;

/** Conversation roles understood by the provider abstraction. */
export const LLMRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type LLMRole = z.infer<typeof LLMRoleSchema>;

/** A tool call requested by the model. */
export const LLMToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
});
export type LLMToolCall = z.infer<typeof LLMToolCallSchema>;

/** A single message in an LLM conversation. */
export const LLMMessageSchema = z.object({
  role: LLMRoleSchema,
  content: z.string().default(''),
  /** Present on assistant messages that request tool calls. */
  toolCalls: z.array(LLMToolCallSchema).optional(),
  /** Present on tool-result messages, referencing the originating call. */
  toolCallId: z.string().optional(),
  /** Optional message/author name (e.g. the tool name for tool results). */
  name: z.string().optional(),
});
export type LLMMessage = z.infer<typeof LLMMessageSchema>;

/** A tool definition advertised to the model (JSON-schema parameters). */
export const LLMToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
});
export type LLMToolDefinition = z.infer<typeof LLMToolDefinitionSchema>;

/** A normalized completion response from any provider. */
export const LLMResponseSchema = z.object({
  content: z.string().default(''),
  toolCalls: z.array(LLMToolCallSchema).default([]),
  finishReason: z.string().optional(),
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

/** A completion request passed to a provider adapter. */
export interface LLMCompletionRequest {
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * The provider abstraction implemented by every LLM adapter (NIM, Ollama,
 * Gemini, OpenAI-compatible). Adapters normalize provider-specific payloads
 * to/from these shapes.
 */
export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  complete(request: LLMCompletionRequest): Promise<LLMResponse>;
}
