import { EventEmitter } from 'node:events';
import { nowIso } from '@mcpshield/shared';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:event-bus');

export interface McpEvent {
  type: string;
  timestamp: string;
  pluginId?: string;
  data: Record<string, unknown>;
}

export interface McpEventBus {
  readonly totalEvents: number;
  emit(event: McpEvent): void;
  on(type: string, handler: (event: McpEvent) => void): void;
  off(type: string, handler: (event: McpEvent) => void): void;
}

export function createEventBus(): McpEventBus {
  const emitter = new EventEmitter();
  let totalEvents = 0;

  return {
    get totalEvents() { return totalEvents; },

    emit(event: McpEvent): void {
      totalEvents++;
      logger.debug(`Event: ${event.type}${event.pluginId ? ` [${event.pluginId}]` : ''}`);
      emitter.emit(event.type, event);
    },

    on(type: string, handler: (event: McpEvent) => void): void {
      emitter.on(type, handler);
    },

    off(type: string, handler: (event: McpEvent) => void): void {
      emitter.off(type, handler);
    },
  };
}
