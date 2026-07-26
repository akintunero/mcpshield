# Workflow Engine

The Workflow Engine executes multi-plugin security workflows as DAGs.

## How It Works

```
User: "Scan production"
        │
        ▼
TaskPlanner
        │  Queries PluginHost for capabilities
        │  Builds dependency graph
        ▼
WorkflowEngine
        │  Creates DAG of WorkflowNodes
        │  Resolves topological order
        ▼
Execution Loop
        │  Runs ready nodes in parallel
        │  Waits for dependencies
        ▼
Merge Results
```

## Example: Full Security Scan

```
    discover                    ← parallel across all plugins
       │
    scan                        ← parallel across all plugins
       │
    ┌──┴──┐
    │     │
 verify  report
    │
remediate (if approved)
    │
 verify
    │
 evidence
```

## Dependency Resolution

```typescript
const engine = new WorkflowEngine(host, eventBus);

const workflow = engine.createWorkflow('Full Scan', [
  { capability: 'discover' },   // all plugins
  { capability: 'scan' },       // all plugins
  { capability: 'verify' },     // all plugins
  { capability: 'remediate' },  // all plugins
]);

const report = await engine.execute(workflow.id);
console.log(report);
// {
//   completedNodes: 12,
//   failedNodes: 0,
//   duration: 45600,
//   results: {
//     'cloud-aws/scan': [...findings],
//     'kubernetes/scan': [...findings],
//     ...
//   }
// }
```

## Capability Negotiation

The planner checks each plugin's declared capabilities at runtime.
If no plugin supports `remediate`, that phase is skipped automatically.
