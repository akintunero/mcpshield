import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { LLMProviderNameSchema } from '@mcpshield/types';

let dotenvLoaded = false;

/** Load `.env` once (idempotent). Real env vars always win over `.env`. */
export function ensureDotenv(): void {
  if (!dotenvLoaded) {
    loadDotenv();
    dotenvLoaded = true;
  }
}

const port = (fallback: number) => z.coerce.number().int().min(1).max(65535).default(fallback);

/** Raw environment schema. Secrets are optional here; guards enforce per app. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // AWS / LocalStack
  LOCALSTACK_ENDPOINT: z.string().url().default('http://localhost:4566'),
  CLOUD_ENDPOINT: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().default('test'),
  AWS_SECRET_ACCESS_KEY: z.string().default('test'),
  AWS_DEFAULT_REGION: z.string().default('us-east-1'),

  // MCP server
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('http'),
  MCP_HTTP_HOST: z.string().default('0.0.0.0'),
  MCP_HTTP_PORT: port(7801),
  MCP_SERVER_URL: z.string().url().default('http://localhost:7801/mcp'),
  MCPSHIELD_STATE_DIR: z.string().default('./.mcpshield-state'),

  // API + dashboard
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: port(7802),
  API_BASE_URL: z.string().url().default('http://localhost:7802'),
  DASHBOARD_HOST: z.string().default('0.0.0.0'),
  DASHBOARD_PORT: port(7803),

  // Slack (optional at load; required by the agent)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_ALLOWED_CHANNEL: z.string().optional(),

  // LLM provider abstraction
  LLM_PROVIDER: LLMProviderNameSchema.default('nim'),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(1024),

  NIM_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NIM_API_KEY: z.string().optional(),
  NIM_MODEL: z.string().default('meta/llama-3.1-70b-instruct'),

  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1'),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Security
  API_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  TLS_KEY_PATH: z.string().optional(),
  TLS_CERT_PATH: z.string().optional(),

  // State management
  STATE_BACKUP_COUNT: z.coerce.number().int().min(0).default(5),

  // n8n
  N8N_PORT: port(5678),
});

export type Env = z.infer<typeof EnvSchema>;

/** Structured, grouped application configuration. */
export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  logLevel: Env['LOG_LEVEL'];
  aws: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
  mcp: {
    transport: 'stdio' | 'http';
    httpHost: string;
    httpPort: number;
    serverUrl: string;
    stateDir: string;
  };
  api: { host: string; port: number; baseUrl: string };
  dashboard: { host: string; port: number };
  slack: {
    botToken?: string;
    appToken?: string;
    signingSecret?: string;
    allowedChannel?: string;
  };
  llm: {
    provider: Env['LLM_PROVIDER'];
    temperature: number;
    maxTokens: number;
    nim: { baseUrl: string; apiKey?: string; model: string };
    ollama: { baseUrl: string; model: string };
    gemini: { apiKey?: string; model: string };
    openai: { baseUrl: string; apiKey?: string; model: string };
  };
  security: {
    apiKey?: string;
    rateLimitMax: number;
    tlsKeyPath?: string;
    tlsCertPath?: string;
  };
  stateBackupCount: number;
  n8n: { port: number };
}

/** Error thrown when the environment fails validation. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function shape(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    aws: {
      endpoint: (() => {
        let endpoint = env.LOCALSTACK_ENDPOINT;
        if (env.CLOUD_ENDPOINT) {
          endpoint = env.CLOUD_ENDPOINT;
          if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
            endpoint = 'http://' + endpoint;
          }
        }
        return endpoint;
      })(),
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_DEFAULT_REGION,
    },
    mcp: {
      transport: env.MCP_TRANSPORT,
      httpHost: env.MCP_HTTP_HOST,
      httpPort: env.MCP_HTTP_PORT,
      serverUrl: env.MCP_SERVER_URL,
      stateDir: env.MCPSHIELD_STATE_DIR,
    },
    api: { host: env.API_HOST, port: env.API_PORT, baseUrl: env.API_BASE_URL },
    dashboard: { host: env.DASHBOARD_HOST, port: env.DASHBOARD_PORT },
    slack: {
      botToken: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN,
      signingSecret: env.SLACK_SIGNING_SECRET,
      allowedChannel: env.SLACK_ALLOWED_CHANNEL,
    },
    llm: {
      provider: env.LLM_PROVIDER,
      temperature: env.LLM_TEMPERATURE,
      maxTokens: env.LLM_MAX_TOKENS,
      nim: { baseUrl: env.NIM_BASE_URL, apiKey: env.NIM_API_KEY, model: env.NIM_MODEL },
      ollama: { baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL },
      gemini: { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
      openai: {
        baseUrl: env.OPENAI_BASE_URL,
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
      },
    },
    security: {
      apiKey: env.API_KEY,
      rateLimitMax: env.RATE_LIMIT_MAX,
      tlsKeyPath: env.TLS_KEY_PATH,
      tlsCertPath: env.TLS_CERT_PATH,
    },
    stateBackupCount: env.STATE_BACKUP_COUNT,
    n8n: { port: env.N8N_PORT },
  };
}

/**
 * Parse and validate configuration from a source (defaults to `process.env`).
 * Loads `.env` first. Throws {@link ConfigError} with a readable message on
 * invalid input (fail fast).
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  ensureDotenv();
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid MCPShield configuration:\n${details}`);
  }
  return shape(parsed.data);
}

let cached: AppConfig | undefined;

/** Lazily-loaded, cached singleton configuration. */
export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

/** Reset the cached config (primarily for tests). */
export function resetConfigCache(): void {
  cached = undefined;
  dotenvLoaded = false;
}

/** Ensure Slack credentials are present; throws {@link ConfigError} otherwise. */
export function requireSlack(
  config: AppConfig,
): Required<Pick<AppConfig['slack'], 'botToken' | 'appToken'>> & AppConfig['slack'] {
  const missing: string[] = [];
  if (!config.slack.botToken) missing.push('SLACK_BOT_TOKEN');
  if (!config.slack.appToken) missing.push('SLACK_APP_TOKEN');
  if (missing.length > 0) {
    throw new ConfigError(
      `Slack configuration missing: ${missing.join(', ')}. See .env.example and docs/slack.md.`,
    );
  }
  return config.slack as Required<Pick<AppConfig['slack'], 'botToken' | 'appToken'>> &
    AppConfig['slack'];
}

/** Ensure the selected LLM provider has the credentials it needs. */
export function requireLLM(config: AppConfig): AppConfig['llm'] {
  const { provider, nim, gemini, openai } = config.llm;
  if (provider === 'nim' && !nim.apiKey) {
    throw new ConfigError('LLM_PROVIDER=nim requires NIM_API_KEY.');
  }
  if (provider === 'gemini' && !gemini.apiKey) {
    throw new ConfigError('LLM_PROVIDER=gemini requires GEMINI_API_KEY.');
  }
  if (provider === 'openai-compatible' && !openai.apiKey) {
    throw new ConfigError('LLM_PROVIDER=openai-compatible requires OPENAI_API_KEY.');
  }
  return config.llm;
}
