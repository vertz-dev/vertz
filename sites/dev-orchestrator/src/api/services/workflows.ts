import { service, rules } from '@vertz/server';
import { s } from '@vertz/schema';
import type { WorkflowExecutor } from '../../lib/workflow-executor';

export type WorkflowStatus =
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StepRunDetail {
  readonly status: string;
  readonly output?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly iterations?: number;
  readonly duration?: number;
  readonly errorMessage?: string;
  readonly errorReason?: string;
  readonly lastToolCall?: string;
}

export interface WorkflowArtifact {
  readonly path: string;
  readonly content: string;
  readonly type: string;
  readonly step: string;
}

export interface WorkflowRun {
  readonly id: string;
  readonly issueNumber: number;
  readonly repo: string;
  readonly status: WorkflowStatus;
  readonly currentStep: string;
  readonly steps: Record<string, StepRunDetail>;
  readonly artifacts: readonly WorkflowArtifact[];
  readonly createdAt: string;
}

export interface WorkflowStore {
  create(input: { issueNumber: number; repo: string }): WorkflowRun;
  get(id: string): WorkflowRun | null;
  list(): WorkflowRun[];
  update(id: string, data: Partial<WorkflowRun>): void;
}

const stepRunDetailSchema = s.object({
  status: s.string(),
  output: s.string().optional(),
  startedAt: s.string().optional(),
  completedAt: s.string().optional(),
  iterations: s.number().optional(),
  duration: s.number().optional(),
  errorMessage: s.string().optional(),
  errorReason: s.string().optional(),
  lastToolCall: s.string().optional(),
});

const artifactSchema = s.object({
  path: s.string(),
  content: s.string(),
  type: s.string(),
  step: s.string(),
});

const workflowRunSchema = s.object({
  id: s.string(),
  issueNumber: s.number(),
  repo: s.string(),
  status: s.enum([
    'running',
    'waiting-approval',
    'completed',
    'failed',
    'cancelled',
  ]),
  currentStep: s.string(),
  steps: s.record(stepRunDetailSchema),
  artifacts: s.array(artifactSchema),
  createdAt: s.string(),
});

export interface WorkflowServiceOptions {
  executor?: WorkflowExecutor;
}

export function createWorkflowService(store: WorkflowStore, options?: WorkflowServiceOptions) {
  const executor = options?.executor;
  return service('workflows', {
    access: {
      start: rules.public,
      get: rules.public,
      list: rules.public,
      approve: rules.public,
      cancel: rules.public,
      retry: rules.public,
      stepDetail: rules.public,
      artifacts: rules.public,
    },
    actions: {
      start: {
        method: 'POST',
        body: s.object({
          issueNumber: s.number(),
          repo: s.string(),
        }),
        response: workflowRunSchema,
        async handler(input: { issueNumber: number; repo: string }) {
          const run = store.create(input);
          if (executor) {
            // Fire-and-forget: start workflow execution in background
            executor.start(run).catch(() => {
              // Error already recorded in store by executor
            });
          }
          return run;
        },
      },

      get: {
        method: 'POST',
        body: s.object({ id: s.string() }),
        response: workflowRunSchema.nullable(),
        async handler(input: { id: string }) {
          return store.get(input.id);
        },
      },

      list: {
        method: 'POST',
        body: s.object({
          status: s.enum(['all', 'running', 'completed', 'failed', 'cancelled']).optional(),
          page: s.number().optional(),
          pageSize: s.number().optional(),
        }).optional(),
        response: s.object({
          runs: s.array(workflowRunSchema),
          total: s.number(),
          page: s.number(),
          pageSize: s.number(),
        }),
        async handler(input: { status?: string; page?: number; pageSize?: number } | undefined) {
          let runs = store.list();
          const statusFilter = input?.status ?? 'all';
          if (statusFilter !== 'all') {
            runs = runs.filter((r) => r.status === statusFilter);
          }
          const total = runs.length;
          const pageSize = input?.pageSize ?? 20;
          const page = input?.page ?? 1;
          const start = (page - 1) * pageSize;
          const paginated = runs.slice(start, start + pageSize);
          return { runs: paginated, total, page, pageSize };
        },
      },

      approve: {
        method: 'POST',
        body: s.object({ id: s.string() }),
        response: s.object({ approved: s.boolean() }),
        async handler(input: { id: string }) {
          const run = store.get(input.id);
          if (!run || run.status !== 'waiting-approval') {
            return { approved: false };
          }
          if (executor) {
            // Fire-and-forget: resume workflow execution in background
            executor.approve(input.id).catch(() => {
              // Error already recorded in store by executor
            });
          } else {
            store.update(input.id, {
              status: 'running',
              currentStep: 'implement',
            });
          }
          return { approved: true };
        },
      },

      cancel: {
        method: 'POST',
        body: s.object({ id: s.string() }),
        response: s.object({ cancelled: s.boolean() }),
        async handler(input: { id: string }) {
          const run = store.get(input.id);
          if (!run || (run.status !== 'running' && run.status !== 'waiting-approval')) {
            return { cancelled: false };
          }
          store.update(input.id, { status: 'cancelled' });
          return { cancelled: true };
        },
      },

      retry: {
        method: 'POST',
        body: s.object({ id: s.string() }),
        response: workflowRunSchema.nullable(),
        async handler(input: { id: string }) {
          const run = store.get(input.id);
          if (!run || (run.status !== 'failed' && run.status !== 'cancelled')) {
            return null;
          }
          const newRun = store.create({ issueNumber: run.issueNumber, repo: run.repo });
          if (executor) {
            executor.start(newRun).catch(() => {});
          }
          return newRun;
        },
      },

      stepDetail: {
        method: 'POST',
        body: s.object({ runId: s.string(), step: s.string() }),
        response: stepRunDetailSchema.nullable(),
        async handler(input: { runId: string; step: string }) {
          const run = store.get(input.runId);
          if (!run) return null;
          return run.steps[input.step] ?? null;
        },
      },

      artifacts: {
        method: 'POST',
        body: s.object({ runId: s.string() }),
        response: s.object({ artifacts: s.array(artifactSchema) }),
        async handler(input: { runId: string }) {
          const run = store.get(input.runId);
          if (!run) return { artifacts: [] };
          return { artifacts: [...run.artifacts] };
        },
      },
    },
  });
}
