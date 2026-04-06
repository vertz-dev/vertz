import { service, rules } from '@vertz/server';
import { s } from '@vertz/schema';

export type WorkflowStatus =
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed';

export interface WorkflowRun {
  readonly id: string;
  readonly issueNumber: number;
  readonly repo: string;
  readonly status: WorkflowStatus;
  readonly currentStep: string;
  readonly steps: Record<string, { status: string; output?: string }>;
  readonly createdAt: string;
}

export interface WorkflowStore {
  create(input: { issueNumber: number; repo: string }): WorkflowRun;
  get(id: string): WorkflowRun | null;
  list(): WorkflowRun[];
  update(id: string, data: Partial<WorkflowRun>): void;
}

const workflowStepSchema = s.object({
  status: s.string(),
  output: s.string().optional(),
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
  ]),
  currentStep: s.string(),
  steps: s.record(workflowStepSchema),
  createdAt: s.string(),
});

export function createWorkflowService(store: WorkflowStore) {
  return service('workflows', {
    access: {
      start: rules.public,
      get: rules.public,
      list: rules.public,
      approve: rules.public,
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
          return store.create(input);
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
        method: 'GET',
        response: s.object({
          runs: s.array(workflowRunSchema),
        }),
        async handler() {
          return { runs: store.list() };
        },
      },

      approve: {
        method: 'POST',
        body: s.object({ id: s.string() }),
        response: s.object({ approved: s.boolean() }),
        async handler(input: { id: string }) {
          const run = store.get(input.id);
          if (!run) {
            return { approved: false };
          }
          store.update(input.id, {
            status: 'running',
            currentStep: 'implement',
          });
          return { approved: true };
        },
      },
    },
  });
}
