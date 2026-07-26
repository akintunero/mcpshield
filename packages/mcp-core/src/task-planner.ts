import type { Finding, MCPPlugin } from '@mcpshield/plugin-sdk';
import type { CapabilityRouter } from './capability-router.js';
import type { PluginRegistry } from './plugin-registry.js';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:task-planner');

export interface TaskStep {
  id: string;
  pluginId: string;
  verb: string;
  resourceType: string;
  params: Record<string, unknown>;
}

export interface TaskPlan {
  steps: TaskStep[];
}

export class TaskPlanner {
  constructor(
    private registry: PluginRegistry,
    private router: CapabilityRouter,
  ) {}

  /** Decompose a high-level intent into capability requests. */
  planIntent(intent: string): TaskPlan {
    const steps: TaskStep[] = [];
    const intentLower = intent.toLowerCase();

    // Map intent keywords to resource types
    if (intentLower.includes('infra') || intentLower.includes('cloud') || intentLower === 'scan all') {
      // Scan every plugin
      for (const plugin of this.registry.getAll()) {
        for (const cap of plugin.capabilities()) {
          if (cap.verb === 'scan') {
            steps.push({
              id: `${plugin.id}/${cap.id}`,
              pluginId: plugin.id,
              verb: 'scan',
              resourceType: cap.resourceType,
              params: {},
            });
          }
        }
      }
    } else if (intentLower.includes('aws') || intentLower.includes('s3') || intentLower.includes('iam')) {
      // Scan cloud-aws plugin
      const plugin = this.registry.get('cloud-aws');
      if (plugin) {
        for (const cap of plugin.capabilities()) {
          if (cap.verb === 'scan' && (!intentLower.includes('s3') || cap.resourceType.includes('s3'))) {
            steps.push({ id: `${plugin.id}/${cap.id}`, pluginId: plugin.id, verb: 'scan', resourceType: cap.resourceType, params: {} });
          }
        }
      }
    }

    logger.info(`Planned ${steps.length} steps for intent: "${intent}"`);
    return { steps };
  }

  /** Execute a task step through the correct plugin. */
  async executeStep(step: TaskStep): Promise<Finding[]> {
    const plugin = this.registry.get(step.pluginId);
    if (!plugin) {
      logger.error(`Plugin "${step.pluginId}" not found for step ${step.id}`);
      return [];
    }

    if (step.verb === 'scan') {
      return plugin.scan(step.params);
    }

    logger.warn(`Unknown verb "${step.verb}" for step ${step.id}`);
    return [];
  }

  /** Execute a full plan and merge results. */
  async executePlan(plan: TaskPlan): Promise<Finding[]> {
    const results = await Promise.all(
      plan.steps.map(step => this.executeStep(step).catch(e => {
        logger.error(`Step ${step.id} failed: ${e.message}`);
        return [] as Finding[];
      }))
    );
    return results.flat();
  }
}
