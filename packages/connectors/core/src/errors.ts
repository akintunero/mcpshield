export class ConnectorError extends Error {
  constructor(message: string, public readonly code: string = 'CONNECTOR_ERROR') {
    super(message);
    this.name = 'ConnectorError';
  }
}

export class AuthError extends ConnectorError {
  constructor(provider: string, detail?: string) {
    super(`Authentication failed for ${provider}${detail ? `: ${detail}` : ''}`, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends ConnectorError {
  constructor(type: string, id: string) {
    super(`Resource not found: ${type}/${id}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends ConnectorError {
  constructor(public readonly retryAfter: number) {
    super(`Rate limited, retry after ${retryAfter}s`, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends ConnectorError {
  constructor(operation: string, ms: number) {
    super(`Operation "${operation}" timed out after ${ms}ms`, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}
