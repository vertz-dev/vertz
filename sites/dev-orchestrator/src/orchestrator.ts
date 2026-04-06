/**
 * Orchestrator setup — wires agents, workflow, store, and LLM adapter.
 *
 * Separated from server.ts because @vertz/agents imports (sqliteStore,
 * createAgentRunner, createMinimaxAdapter) include native dependencies
 * that block the vtz dev server V8 isolate.
 */
import { createServer } from '@vertz/server';
import {
  createAgentRunner,
  createMinimaxAdapter,
  sqliteStore,
} from '@vertz/agents';
import type { AgentDefinition, AgentStore, WorkflowDefinition } from '@vertz/agents';
import type { ServiceDefinition } from '@vertz/server';
import type { SandboxClient } from './lib/sandbox-client';
import type { GitHubClient } from './lib/github-client';
import { createPlannerAgent } from './agents/planner';
import { createReviewerAgent } from './agents/reviewer';
import { createImplementerAgent } from './agents/implementer';
import { createCiMonitorAgent } from './agents/ci-monitor';
import { createFeatureWorkflow } from './workflows/feature';
import { createDashboardService, type AgentInfo } from './api/services/dashboard';
import { createWorkflowService } from './api/services/workflows';
import { createInMemoryWorkflowStore } from './api/services/workflow-store';

export interface OrchestratorOptions {
  readonly storePath?: string;
}

export interface Orchestrator {
  readonly agents: readonly AgentDefinition<any, any, any>[];
  readonly workflow: WorkflowDefinition;
  readonly agentRunner: (...args: any[]) => Promise<any>;
  readonly store: AgentStore;
}

export function createOrchestrator(
  sandbox: SandboxClient,
  github: GitHubClient,
  options?: OrchestratorOptions,
): Orchestrator {
  const agents = [
    createPlannerAgent(sandbox, github),
    createReviewerAgent(sandbox),
    createImplementerAgent(sandbox),
    createCiMonitorAgent(sandbox, github),
  ];

  const workflow = createFeatureWorkflow(sandbox, github);

  const store = sqliteStore({ path: options?.storePath ?? '.vertz/data/orchestrator.db' });

  const agentRunner = createAgentRunner(agents, {
    createAdapter: (opts) => createMinimaxAdapter(opts),
    store,
  });

  return { agents, workflow, agentRunner, store };
}

export function createApp(sandbox: SandboxClient, github: GitHubClient) {
  const { agents, agentRunner } = createOrchestrator(sandbox, github);

  const agentInfos: AgentInfo[] = agents.map((a) => ({
    name: a.name,
    description: a.description ?? '',
    model: 'MiniMax-M1',
  }));

  const workflowStore = createInMemoryWorkflowStore();

  return createServer({
    agents: [...agents],
    agentRunner,
    services: [
      createDashboardService(agentInfos),
      createWorkflowService(workflowStore),
    ] as ServiceDefinition[],
  });
}
