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
import { plannerAgent } from '../agents/planner';
import { reviewerAgent } from '../agents/reviewer';
import { implementerAgent } from '../agents/implementer';
import { ciMonitorAgent } from '../agents/ci-monitor';
import { publisherAgent } from '../agents/publisher';
import { featureWorkflow } from '../workflows/feature';
import { createAgentRegistry } from './services/agents';
import { createDashboardService, type AgentInfo } from './services/dashboard';
import { extractDefinitionDetail, extractStepSummaries } from './services/definitions';
import { createInMemoryWorkflowStore } from './services/workflow-store';
import { handleWorkflowStream } from './services/workflow-stream';
import { createWorkflowService } from './services/workflows';

const workflowStore = createInMemoryWorkflowStore();
const progressEmitter = createProgressEmitter();

// Agent registry wraps static definitions with mutable prompt overrides
const agentRegistry = createAgentRegistry([
  plannerAgent,
  reviewerAgent,
  implementerAgent,
  ciMonitorAgent,
  publisherAgent,
]);

// Dashboard still uses simple AgentInfo for backward compatibility
const agents: AgentInfo[] = agentRegistry.list().map((a) => ({
  name: a.name,
  description: a.description,
  model: a.model,
}));

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

    // Agents API
    if (url.pathname === '/api/agents/list' && request.method === 'POST') {
      return jsonResponse({ agents: agentRegistry.list() });
    }
    if (url.pathname === '/api/agents/get' && request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).name !== 'string') {
        return jsonResponse({ error: 'Missing or invalid "name" field' }, 400);
      }
      const detail = agentRegistry.get((body as { name: string }).name);
      if (!detail) return jsonResponse({ error: 'Agent not found' }, 404);
      return jsonResponse(detail);
    }
    if (url.pathname === '/api/agents/updatePrompt' && request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const b = body as Record<string, unknown>;
      if (!b || typeof b !== 'object' || typeof b.name !== 'string' || typeof b.prompt !== 'string') {
        return jsonResponse({ error: 'Missing "name" or "prompt" field' }, 400);
      }
      const success = agentRegistry.updatePrompt(b.name as string, b.prompt as string);
      if (!success) return jsonResponse({ error: 'Agent not found' }, 404);
      return jsonResponse({ success: true });
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
