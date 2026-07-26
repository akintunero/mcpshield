import { createLogger } from '@mcpshield/logger';
import { nowIso } from '@mcpshield/shared';
import type { PluginHost } from './plugin-host.js';
import type { McpEventBus } from './event-bus.js';

/**
 * A single step in a workflow execution graph.
 */
export interface WorkflowNode {
  id: string;
  pluginId: string;
  capability: string;
  args: any[];
  dependsOn: string[];  // node IDs that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

/**
 * A workflow is a DAG of nodes.
 * Nodes with no dependencies run in parallel.
 */
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  createdAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface WorkflowReport {
  workflowId: string;
  name: string;
  status: string;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  duration: number;
  results: Record<string, any>;
}

/**
 * WorkflowEngine creates and executes DAG-based workflows.
 * It resolves capabilities via PluginHost, determines execution order,
 * runs independent tasks in parallel, and handles failures gracefully.
 */
export class WorkflowEngine {
  private readonly logger = createLogger('mcp-core:workflow-engine');
  private workflows = new Map<string, Workflow>();

  constructor(
    private host: PluginHost,
    private eventBus?: McpEventBus,
  ) {}

  /**
   * Create a workflow from capability requests.
   * Scans all plugins and builds a DAG based on declared capabilities.
   */
  createWorkflow(name: string, requests: Array<{ capability: string; pluginId?: string }>): Workflow {
    const nodes: WorkflowNode[] = [];

    for (const req of requests) {
      if (req.pluginId) {
        // Specific plugin requested
        const plugin = this.host.get(req.pluginId);
        if (!plugin) {
          this.logger.warn(`Plugin "${req.pluginId}" not found, skipping`);
          continue;
        }
        if (!plugin.manifest.capabilities.includes(req.capability)) {
          this.logger.warn(`Plugin "${req.pluginId}" doesn't support "${req.capability}", skipping`);
          continue;
        }
        nodes.push({
          id: `${req.pluginId}/${req.capability}`,
          pluginId: req.pluginId,
          capability: req.capability,
          args: [],
          dependsOn: [],
          status: 'pending',
        });
      } else {
        // Find ALL plugins that support this capability
        for (const plugin of this.host.getAll()) {
          if (plugin.manifest.capabilities.includes(req.capability)) {
            nodes.push({
              id: `${plugin.id}/${req.capability}`,
              pluginId: plugin.id,
              capability: req.capability,
              args: [],
              dependsOn: [],
              status: 'pending',
            });
          }
        }
      }
    }

    // Build dependency chain: scan → verify, remediate → verify
    for (let i = 0; i < nodes.length; i++) {
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        // If node j is a scan-type, and node i is a remediate-type,
        // then j must complete before i
        if (nodes[i]!.capability === 'remediate' && nodes[j]!.capability === 'scan') {
          nodes[i]!.dependsOn.push(nodes[j]!.id);
        }
        if (nodes[i]!.capability === 'verify' && nodes[j]!.capability === 'remediate') {
          nodes[i]!.dependsOn.push(nodes[j]!.id);
        }
      }
    }

    const workflow: Workflow = {
      id: `wf-${Date.now()}`,
      name,
      nodes,
      createdAt: nowIso(),
      status: 'pending',
    };

    this.workflows.set(workflow.id, workflow);
    this.logger.info(`Created workflow "${name}" with ${nodes.length} nodes`);
    return workflow;
  }

  /** Execute a workflow, respecting dependency order. */
  async execute(workflowId: string): Promise<WorkflowReport> {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`Workflow "${workflowId}" not found`);

    wf.status = 'running';
    const startTime = Date.now();

    // Topological execution: run nodes with all deps satisfied in parallel
    const completed = new Set<string>();
    const failed = new Set<string>();
    const skipped = new Set<string>();

    while (completed.size + failed.size + skipped.size < wf.nodes.length) {
      // Find nodes ready to execute
      const ready = wf.nodes.filter((n) => {
        if (n.status !== 'pending') return false;
        return n.dependsOn.every((dep) => completed.has(dep) || skipped.has(dep));
      });

      if (ready.length === 0 && completed.size + failed.size + skipped.size < wf.nodes.length) {
        // Deadlock or all remaining nodes depend on failed nodes
        for (const n of wf.nodes) {
          if (n.status === 'pending') {
            n.status = 'skipped';
            skipped.add(n.id);
            n.error = 'dependency failed';
          }
        }
        break;
      }

      // Execute ready nodes in parallel
      await Promise.all(
        ready.map(async (node) => {
          node.status = 'running';
          node.startedAt = nowIso();

          try {
            const result = await this.host.invoke(node.pluginId, node.capability, ...node.args);
            node.status = 'completed';
            node.result = result;
            node.completedAt = nowIso();
            node.duration = Date.now() - startTime;
            completed.add(node.id);

            this.eventBus?.emit({
              type: `capability.${node.capability}.completed` as any,
              timestamp: nowIso(),
              pluginId: node.pluginId,
              data: { workflowId, duration: node.duration },
            });
          } catch (e: any) {
            node.status = 'failed';
            node.error = e.message;
            node.completedAt = nowIso();
            failed.add(node.id);

            this.eventBus?.emit({
              type: `capability.${node.capability}.failed` as any,
              timestamp: nowIso(),
              pluginId: node.pluginId,
              data: { workflowId, error: e.message },
            });
          }
        }),
      );
    }

    wf.status = failed.size > 0 ? 'failed' : 'completed';
    const duration = Date.now() - startTime;

    this.logger.info(
      `Workflow "${wf.name}" completed: ${completed.size} completed, ${failed.size} failed, ${skipped.size} skipped in ${duration}ms`,
    );

    return this.report(wf, duration);
  }

  /** Generate a report from a completed workflow. */
  private report(wf: Workflow, duration: number): WorkflowReport {
    return {
      workflowId: wf.id,
      name: wf.name,
      status: wf.status,
      totalNodes: wf.nodes.length,
      completedNodes: wf.nodes.filter((n) => n.status === 'completed').length,
      failedNodes: wf.nodes.filter((n) => n.status === 'failed').length,
      skippedNodes: wf.nodes.filter((n) => n.status === 'skipped').length,
      duration,
      results: Object.fromEntries(
        wf.nodes.filter((n) => n.status === 'completed').map((n) => [n.id, n.result]),
      ),
    };
  }

  /** Get a stored workflow. */
  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }
}
