import { runWorkflow } from '@vertz/agents';
import type { AdapterFactory, LLMAdapter, ToolProvider, WorkflowDefinition, StepResult } from '@vertz/agents';
import type { WorkflowRun, WorkflowStore } from '../api/services/workflows';

export interface WorkflowExecutor {
  start(run: WorkflowRun): Promise<void>;
  approve(runId: string): Promise<void>;
}

export interface WorkflowExecutorOptions {
  /** Optional adapter factory for per-agent tool awareness. */
  readonly createAdapter?: AdapterFactory;
  /** Runtime tool implementations injected into every agent run. */
  readonly tools?: ToolProvider;
}

export function createWorkflowExecutor(
  workflowDef: WorkflowDefinition,
  store: WorkflowStore,
  llm: LLMAdapter,
  options?: WorkflowExecutorOptions,
): WorkflowExecutor {
  // Track step results for resumption after approval
  const pendingResults = new Map<string, Record<string, StepResult>>();

  return {
    async start(run: WorkflowRun) {
      try {
        const result = await runWorkflow(workflowDef, {
          input: { issueNumber: run.issueNumber, repo: run.repo },
          llm,
          createAdapter: options?.createAdapter,
          tools: options?.tools,
        });

        const steps: Record<string, { status: string; output?: string }> = {};
        for (const [name, stepResult] of Object.entries(result.stepResults)) {
          steps[name] = {
            status: stepResult.status,
            output: stepResult.response,
          };
        }

        if (result.status === 'pending' && result.pendingStep) {
          pendingResults.set(run.id, result.stepResults);
          store.update(run.id, {
            status: 'waiting-approval',
            currentStep: result.pendingStep,
            steps,
          });
        } else if (result.status === 'complete') {
          store.update(run.id, {
            status: 'completed',
            currentStep: 'done',
            steps,
          });
        } else {
          store.update(run.id, {
            status: 'failed',
            currentStep: result.failedStep ?? 'unknown',
            steps,
          });
        }
      } catch {
        store.update(run.id, {
          status: 'failed',
          currentStep: 'error',
        });
      }
    },

    async approve(runId: string) {
      const run = store.get(runId);
      if (!run) {
        throw new Error(`Workflow run "${runId}" not found`);
      }
      if (run.status !== 'waiting-approval') {
        throw new Error(`Workflow run "${runId}" is not waiting for approval`);
      }

      const previousResults = pendingResults.get(runId);
      pendingResults.delete(runId);

      store.update(runId, { status: 'running' });

      try {
        const result = await runWorkflow(workflowDef, {
          input: { issueNumber: run.issueNumber, repo: run.repo },
          llm,
          createAdapter: options?.createAdapter,
          tools: options?.tools,
          resumeAfter: run.currentStep,
          previousResults,
        });

        const steps: Record<string, { status: string; output?: string }> = {
          ...run.steps,
        };
        for (const [name, stepResult] of Object.entries(result.stepResults)) {
          steps[name] = {
            status: stepResult.status,
            output: stepResult.response,
          };
        }

        if (result.status === 'complete') {
          store.update(runId, {
            status: 'completed',
            currentStep: 'done',
            steps,
          });
        } else if (result.status === 'pending' && result.pendingStep) {
          pendingResults.set(runId, result.stepResults);
          store.update(runId, {
            status: 'waiting-approval',
            currentStep: result.pendingStep,
            steps,
          });
        } else {
          store.update(runId, {
            status: 'failed',
            currentStep: result.failedStep ?? 'unknown',
            steps,
          });
        }
      } catch {
        store.update(runId, {
          status: 'failed',
          currentStep: 'error',
        });
      }
    },
  };
}
