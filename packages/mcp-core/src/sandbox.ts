import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:sandbox');

export interface SandboxOptions {
  pluginId: string;
  entrypoint: string;
  timeoutMs: number;
  maxMemoryMb: number;
  pluginDir: string;
  stateDir: string;
}

export interface SandboxResult {
  success: boolean;
  data: any;
  duration: number;
  error?: string;
}

/**
 * Runs a plugin operation in an isolated worker thread.
 * Provides memory limits, timeouts, and crash isolation.
 * If a plugin crashes, it does NOT bring down the main process.
 */
export function runInSandbox(options: SandboxOptions, method: string, args: any[]): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const start = Date.now();

    const worker = new Worker(join(__dirname, 'sandbox-worker.js'), {
      workerData: {
        pluginId: options.pluginId,
        entrypoint: options.entrypoint,
        method,
        args,
        stateDir: options.stateDir,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: options.maxMemoryMb,
      },
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        success: false,
        data: null,
        duration: Date.now() - start,
        error: `Timed out after ${options.timeoutMs}ms`,
      });
    }, options.timeoutMs);

    worker.on('message', (msg) => {
      clearTimeout(timeout);
      resolve({
        success: true,
        data: msg,
        duration: Date.now() - start,
      });
    });

    worker.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        data: null,
        duration: Date.now() - start,
        error: err.message,
      });
    });

    worker.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({
          success: false,
          data: null,
          duration: Date.now() - start,
          error: `Worker exited with code ${code}`,
        });
      }
    });
  });
}
