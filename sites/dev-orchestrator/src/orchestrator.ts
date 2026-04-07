/**
 * Orchestrator setup — wires providers, workflow, store, and LLM adapter.
 *
 * Agents and workflows are static imports — only tool providers need runtime
 * dependencies (sandbox, github). This is the DI composition root.
 */
import { createServer } from '@vertz/server';
import {
  createAgentRunner,
  createMinimaxAdapter,
  sqliteStore,
} from '@vertz/agents';
import type { AgentStore, ToolProvider, WorkflowDefinition } from '@vertz/agents';
import type { AgentRunnerFn, ServiceDefinition } from '@vertz/server';
import type { SandboxClient } from './lib/sandbox-client';
import type { GitHubClient } from './lib/github-client';
import { plannerAgent } from './agents/planner';
import { reviewerAgent } from './agents/reviewer';
import { implementerAgent } from './agents/implementer';
import { ciMonitorAgent } from './agents/ci-monitor';
import { featureWorkflow } from './workflows/feature';
import { createSandboxProvider } from './tools/sandbox-tools';
import { createGitHubProvider } from './tools/github';
import { createBuildProvider } from './tools/build';
import { createGitProvider } from './tools/git';
import { createDashboardService, type AgentInfo } from './api/services/dashboard';
import { createWorkflowService } from './api/services/workflows';
import { createInMemoryWorkflowStore } from './api/services/workflow-store';

export interface OrchestratorOptions {
  readonly storePath?: string;
}

export interface Orchestrator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agents have varying generic params
  readonly agents: readonly any[];
  readonly workflow: WorkflowDefinition;
  readonly agentRunner: AgentRunnerFn;
  readonly store: AgentStore;
  readonly tools: ToolProvider;
}

export function createOrchestrator(
  sandbox: SandboxClient,
  github: GitHubClient,
  options?: OrchestratorOptions,
): Orchestrator {
  const agents = [plannerAgent, reviewerAgent, implementerAgent, ciMonitorAgent];

  // Compose all tool providers into a single flat record
  const tools: ToolProvider = {
    ...createSandboxProvider(sandbox),
    ...createGitHubProvider(github),
    ...createBuildProvider(sandbox),
    ...createGitProvider(sandbox),
  };

  const store = sqliteStore({ path: options?.storePath ?? '.vertz/data/orchestrator.db' });

  const agentRunner = createAgentRunner(agents, {
    createAdapter: (opts) => createMinimaxAdapter(opts),
    store,
    tools,
  });

  return { agents, workflow: featureWorkflow, agentRunner, store, tools };
}

export function createApp(sandbox: SandboxClient, github: GitHubClient) {
  const { agents, agentRunner } = createOrchestrator(sandbox, github);

  const agentInfos: AgentInfo[] = agents.map((a) => ({
    name: a.name,
    description: a.description ?? '',
    model: 'MiniMax-M2.7',
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
