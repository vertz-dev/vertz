/**
 * Dev Orchestrator — API server entry point.
 *
 * Runs locally via `vtz dev`. The dev server auto-discovers this at
 * src/api/server.ts and wires it as the API handler for /api/* routes.
 */
import { createServer } from '@vertz/server';
import type { ServiceDefinition } from '@vertz/server';
import { createDashboardService, type AgentInfo } from './services/dashboard';
import { createWorkflowService } from './services/workflows';
import { createInMemoryWorkflowStore } from './services/workflow-store';

const workflowStore = createInMemoryWorkflowStore();

const agents: AgentInfo[] = [
  { name: 'planner', description: 'Reads a GitHub issue and produces a design doc', model: 'MiniMax-M2.7' },
  { name: 'reviewer', description: 'Adversarially reviews design docs and code', model: 'MiniMax-M2.7' },
  { name: 'implementer', description: 'Implements features using strict TDD', model: 'MiniMax-M2.7' },
  { name: 'ci-monitor', description: 'Monitors GitHub CI status and diagnoses failures', model: 'MiniMax-M2.7' },
];

const app = createServer({
  basePath: '/api',
  services: [
    createDashboardService(agents),
    createWorkflowService(workflowStore),
  ] as ServiceDefinition[],
});

export default app;

if (import.meta.main) {
  app.listen(3000).then((handle) => {
    console.log(`Dev Orchestrator running at http://localhost:${handle.port}/api`);
  });
}
