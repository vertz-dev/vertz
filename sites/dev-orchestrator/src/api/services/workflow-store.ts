import type { WorkflowRun, WorkflowStore } from './workflows';

export function createInMemoryWorkflowStore(): WorkflowStore {
  const runs = new Map<string, WorkflowRun>();
  let counter = 0;

  return {
    create(input) {
      counter++;
      const id = `wf-${counter}`;
      const run: WorkflowRun = {
        id,
        issueNumber: input.issueNumber,
        repo: input.repo,
        status: 'running',
        currentStep: 'plan',
        steps: {},
        createdAt: new Date().toISOString(),
      };
      runs.set(id, run);
      return run;
    },

    get(id) {
      return runs.get(id) ?? null;
    },

    list() {
      return [...runs.values()];
    },

    update(id, data) {
      const run = runs.get(id);
      if (!run) return;
      runs.set(id, { ...run, ...data });
    },
  };
}
