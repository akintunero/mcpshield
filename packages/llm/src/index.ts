import { getConfig, requireLLM } from '@mcpshield/config';
import type {
  LLMResponse,
  LLMProvider,
  LLMCompletionRequest,
  LLMProviderName,
} from '@mcpshield/types';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('llm');

class OpenAICompatibleProvider implements LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(name: LLMProviderName, model: string, baseUrl: string, apiKey: string) {
    this.name = name;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content || '',
        ...(m.toolCalls
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }
          : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
      temperature: request.temperature ?? 0.1,
      max_tokens: request.maxTokens ?? 1024,
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          }
        : {}),
    };

    logger.debug(`Calling OpenAI-compatible endpoint [${this.name}] for model [${this.model}]`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error(`LLM call failed with status ${res.status}: ${errorText}`);
      throw new Error(`LLM provider [${this.name}] error: ${errorText}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls =
      message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })) || [];

    return {
      content: message?.content || '',
      toolCalls,
      finishReason: choice?.finish_reason,
    };
  }
}

class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;

  constructor(model: string, baseUrl: string) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async complete(request: LLMCompletionRequest): Promise<LLMResponse> {
    const url = `${this.baseUrl}/api/chat`;
    const body = {
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content || '',
        ...(m.toolCalls
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              })),
            }
          : {}),
      })),
      stream: false,
      options: {
        temperature: request.temperature ?? 0.1,
      },
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          }
        : {}),
    };

    logger.debug(`Calling Ollama chat endpoint for model [${this.model}]`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error(`Ollama call failed with status ${res.status}: ${errorText}`);
      throw new Error(`Ollama error: ${errorText}`);
    }

    const data = (await res.json()) as any;
    const message = data.message;

    const toolCalls =
      message?.tool_calls?.map((tc: any) => ({
        id: tc.id || `tc_${Math.random().toString(36).slice(2, 10)}`,
        name: tc.function.name,
        arguments:
          typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments,
      })) || [];

    return {
      content: message?.content || '',
      toolCalls,
      finishReason: data.done ? 'stop' : undefined,
    };
  }
}

export function getLlmProvider(): LLMProvider {
  const config = getConfig();
  const llmConfig = requireLLM(config);

  switch (llmConfig.provider) {
    case 'nim':
      return new OpenAICompatibleProvider(
        'nim',
        llmConfig.nim.model,
        llmConfig.nim.baseUrl,
        llmConfig.nim.apiKey!,
      );

    case 'openai-compatible':
      return new OpenAICompatibleProvider(
        'openai-compatible',
        llmConfig.openai.model,
        llmConfig.openai.baseUrl,
        llmConfig.openai.apiKey!,
      );

    case 'gemini':
      return new OpenAICompatibleProvider(
        'gemini',
        llmConfig.gemini.model,
        'https://generativetool.googleapis.com/v1beta/openai/v1',
        llmConfig.gemini.apiKey!,
      );

    case 'ollama':
      return new OllamaProvider(llmConfig.ollama.model, llmConfig.ollama.baseUrl);

    default:
      throw new Error(`Unsupported LLM provider: ${llmConfig.provider}`);
  }
}
