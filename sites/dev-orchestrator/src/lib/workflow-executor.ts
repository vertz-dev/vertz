import { runWorkflow } from '@vertz/agents';
import type {
  AdapterFactory,
  LLMAdapter,
  StepProgressEvent,
  StepResult,
  ToolProvider,
  WorkflowDefinition,
} from '@vertz/agents';
import type { StepRunDetail, WorkflowRun, WorkflowStore } from '../api/services/workflows';
import type { ProgressEmitter } from './progress-emitter';

export interface WorkflowExecutor {
  start(run: WorkflowRun): Promise<void>;
  approve(runId: string): Promise<void>;
}

export interface WorkflowExecutorOptions {
  /** Optional adapter factory for per-agent tool awareness. */
  readonly createAdapter?: AdapterFactory;
  /** Runtime tool implementations injected into every agent run. */
  readonly tools?: ToolProvider;
  /** Optional progress emitter for step events. */
  readonly emitter?: ProgressEmitter;
}

/** Build rich step details from step results + progress events. */
function buildStepDetails(
  stepResults: Record<string, StepResult>,
  events: readonly StepProgressEvent[],
): Record<string, StepRunDetail> {
  const steps: Record<string, StepRunDetail> = {};
  for (const [name, stepResult] of Object.entries(stepResults)) {
    const started = events.find((e) => e.step === name && e.type === 'step-started');
    const ended = events.find(
      (e) => e.step === name && (e.type === 'step-completed' || e.type === 'step-failed'),
    );
    const duration =
      started && ended ? ended.timestamp - started.timestamp : undefined;

    steps[name] = {
      status: stepResult.status,
      output: stepResult.response,
      startedAt: started ? new Date(started.timestamp).toISOString() : undefined,
      completedAt: ended ? new Date(ended.timestamp).toISOString() : undefined,
      iterations: stepResult.iterations,
      duration,
    };
  }
  return steps;
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
          onStepProgress: options?.emitter
            ? (event) => options.emitter!.emit(run.id, event)
            : undefined,
        });

        const events = options?.emitter?.snapshot(run.id) ?? [];
        const steps = buildStepDetails(result.stepResults, events);

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
          onStepProgress: options?.emitter
            ? (event) => options.emitter!.emit(runId, event)
            : undefined,
        });

        const events = options?.emitter?.snapshot(runId) ?? [];
        const steps: Record<string, StepRunDetail> = {
          ...run.steps,
          ...buildStepDetails(result.stepResults, events),
        };

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
