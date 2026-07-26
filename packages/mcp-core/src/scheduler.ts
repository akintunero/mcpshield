import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:scheduler');

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: string;
  lastDuration?: number;
}

/**
 * Simple cron-like scheduler for periodic tasks.
 * Supports: every N minutes/hours, or specific times.
 * Expression format: "every Xm" | "every Xh" | "daily@HH:MM"
 */
export class Scheduler {
  private tasks: ScheduledTask[] = [];
  private intervals: NodeJS.Timeout[] = [];

  register(task: ScheduledTask): void {
    this.tasks.push(task);
    logger.info(`Scheduled task "${task.name}": ${task.cronExpression}`);
  }

  start(): void {
    for (const task of this.tasks) {
      if (!task.enabled) continue;
      const ms = parseCron(task.cronExpression);
      if (ms <= 0) {
        logger.warn(`Invalid cron expression for "${task.name}": ${task.cronExpression}`);
        continue;
      }
      const interval = setInterval(async () => {
        const start = Date.now();
        logger.info(`Running scheduled task: ${task.name}`);
        try {
          await task.handler();
          task.lastRun = new Date().toISOString();
          task.lastDuration = Date.now() - start;
          logger.info(`Scheduled task "${task.name}" completed in ${task.lastDuration}ms`);
        } catch (e: any) {
          logger.error(`Scheduled task "${task.name}" failed: ${e.message}`);
        }
      }, ms);
      this.intervals.push(interval);
    }
  }

  stop(): void {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }

  getTasks(): ScheduledTask[] {
    return this.tasks;
  }
}

function parseCron(expr: string): number {
  const everyMatch = expr.match(/^every\s+(\d+)\s*(m|h|s)$/i);
  if (everyMatch) {
    const num = parseInt(everyMatch[1]!, 10);
    const unit = everyMatch[2]!.toLowerCase();
    if (unit === 's') return num * 1000;
    if (unit === 'm') return num * 60 * 1000;
    if (unit === 'h') return num * 60 * 60 * 1000;
  }
  return 0;
}
