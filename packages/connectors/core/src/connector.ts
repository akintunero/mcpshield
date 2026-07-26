/**
 * Connector — the abstract interface every vendor SDK adapter implements.
 * Stateless, reusable, plugin-agnostic.
 */
export interface ConnectorConfig {
  id: string;
  displayName: string;
  version: string;
  auth?: ConnectorAuth;
  endpoint?: string;
  region?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface ConnectorAuth {
  type: 'api-key' | 'oauth2' | 'aws-iam' | 'azure-cli' | 'gcp-adc' | 'kubeconfig';
  credentials?: Record<string, string>;
}

export interface ConnectorHealth {
  reachable: boolean;
  identity?: string;
  latency: number;
  version?: string;
  error?: string;
}

export interface ConnectorResource {
  id: string;
  name: string;
  type: string;
  service: string;
  region?: string;
  tags: Record<string, string>;
  properties: Record<string, unknown>;
  createdAt?: string;
}

export interface ListResourcesOptions {
  service?: string;
  region?: string;
  tags?: Record<string, string>;
  maxResults?: number;
  nextToken?: string;
}

export interface ListResourcesResult {
  resources: ConnectorResource[];
  nextToken?: string;
}

export interface Connector {
  readonly id: string;
  readonly displayName: string;

  /** Establish connection. Must be called before any other method. */
  connect(config: ConnectorConfig): Promise<void>;

  /** Gracefully tear down connection. */
  disconnect(): Promise<void>;

  /** Check connectivity to the vendor API. */
  health(): Promise<ConnectorHealth>;

  /** Execute a raw API call through the connector. */
  execute<T>(operation: string, params?: Record<string, unknown>): Promise<T>;

  /** List resources by type, with optional filtering and pagination. */
  listResources(type: string, options?: ListResourcesOptions): Promise<ListResourcesResult>;

  /** Get a single resource by ID. */
  getResource(type: string, id: string): Promise<ConnectorResource | null>;

  /** Apply tags to a resource. */
  tagResource(type: string, id: string, tags: Record<string, string>): Promise<void>;
}
