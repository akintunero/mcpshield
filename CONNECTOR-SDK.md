# Connector SDK

Connectors translate vendor SDKs into a consistent interface. Plugins use
connectors — they never import AWS, Azure, or Kubernetes SDKs directly.

## Architecture

```
Plugin
  │
  ├── Connector (consistent interface)
  │     │
  │     ├── AWS SDK
  │     ├── Azure SDK
  │     ├── K8s API
  │     └── GitHub API
  │
  ├── Retry handler
  ├── Pagination handler
  ├── Rate limiter
  └── Auth provider
```

## Interface

```typescript
interface Connector {
  connect(config: ConnectorConfig): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<ConnectorHealth>;
  execute<T>(operation: string, params?: object): Promise<T>;
  listResources(type: string, options?: ListOptions): Promise<ListResult>;
  getResource(type: string, id: string): Promise<Resource | null>;
}
```

## Built-in Handlers

Connectors come with reusable handlers:

- `createRetryHandler()` — exponential backoff, jitter
- `createPaginationHandler()` — token-based pagination
- `createRateLimiter()` — configurable requests/sec
- `AuthError`, `NotFoundError`, `RateLimitError`, `TimeoutError`

## Example: AWS Connector

```typescript
const connector = new AwsConnector();
await connector.connect({
  region: 'us-east-1',
  auth: { type: 'aws-iam', credentials: { accessKeyId, secretAccessKey } },
});

const buckets = await connector.listResources('s3:bucket');
const iamUsers = await connector.listResources('iam:user');
await connector.disconnect();
```
