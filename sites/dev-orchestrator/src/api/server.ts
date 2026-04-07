/**
 * Dev Orchestrator — API server entry point.
 *
 * Runs locally via `vtz dev`. The dev server auto-discovers this at
 * src/api/server.ts and wires it as the API handler for /api/* routes.
 */
import { createServer } from '@vertz/server';
import type { WorkflowDefinition } from '@vertz/agents';
import type { ServiceDefinition } from '@vertz/server';
import { createProgressEmitter } from '../lib/progress-emitter';
import { featureWorkflow } from '../workflows/feature';
import { createDashboardService, type AgentInfo } from './services/dashboard';
import { extractDefinitionDetail, extractStepSummaries } from './services/definitions';
import { createInMemoryWorkflowStore } from './services/workflow-store';
import { handleWorkflowStream } from './services/workflow-stream';
import { createWorkflowService } from './services/workflows';

const workflowStore = createInMemoryWorkflowStore();
const progressEmitter = createProgressEmitter();

const agents: AgentInfo[] = [
  { name: 'planner', description: 'Reads a GitHub issue and produces a design doc', model: 'MiniMax-M2.7' },
  { name: 'reviewer', description: 'Adversarially reviews design docs and code', model: 'MiniMax-M2.7' },
  { name: 'implementer', description: 'Implements features using strict TDD', model: 'MiniMax-M2.7' },
  { name: 'ci-monitor', description: 'Monitors GitHub CI status and diagnoses failures', model: 'MiniMax-M2.7' },
];

// Registry of workflow definitions for the definitions API
const workflowRegistry = new Map<string, WorkflowDefinition>([
  [featureWorkflow.name, featureWorkflow],
]);

const innerApp = createServer({
  basePath: '/api',
  services: [
    createDashboardService(agents),
    createWorkflowService(workflowStore),
  ] as ServiceDefinition[],
});

// Custom route patterns
const SSE_ROUTE = /^\/api\/workflows\/([^/]+)\/stream$/;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleDefinitionsList(): Response {
  const definitions = [...workflowRegistry.values()].map((wf) => ({
    name: wf.name,
    steps: extractStepSummaries(wf),
  }));
  return jsonResponse({ definitions });
}

function handleDefinitionsGet(body: { name: string }): Response {
  const wf = workflowRegistry.get(body.name);
  if (!wf) return jsonResponse({ error: 'Definition not found' }, 404);
  return jsonResponse(extractDefinitionDetail(wf));
}

const app = {
  handler: async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    // SSE streaming
    const sseMatch = SSE_ROUTE.exec(url.pathname);
    if (sseMatch && request.method === 'GET') {
      return handleWorkflowStream(sseMatch[1], workflowStore, progressEmitter);
    }

    // Definitions API
    if (url.pathname === '/api/definitions/list' && request.method === 'POST') {
      return handleDefinitionsList();
    }
    if (url.pathname === '/api/definitions/get' && request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).name !== 'string') {
        return jsonResponse({ error: 'Missing or invalid "name" field' }, 400);
      }
      return handleDefinitionsGet(body as { name: string });
    }

    return innerApp.handler(request);
  },
  listen: innerApp.listen.bind(innerApp),
  router: innerApp.router,
};

export default app;

if (import.meta.main) {
  app.listen(3000).then((handle) => {
    console.log(`Dev Orchestrator running at http://localhost:${handle.port}/api`);
  });
}
