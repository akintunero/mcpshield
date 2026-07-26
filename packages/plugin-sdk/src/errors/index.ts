export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginError';
  }
}

export class ConfigError extends PluginError {
  constructor(pluginId: string, field: string) {
    super(`Plugin "${pluginId}" missing required config: ${field}`);
    this.name = 'ConfigError';
  }
}

export class ConnectionError extends PluginError {
  constructor(pluginId: string, target: string, cause?: string) {
    super(`Plugin "${pluginId}" cannot connect to ${target}${cause ? `: ${cause}` : ''}`);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends PluginError {
  constructor(pluginId: string, capability: string, ms: number) {
    super(`Plugin "${pluginId}" capability "${capability}" timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}
