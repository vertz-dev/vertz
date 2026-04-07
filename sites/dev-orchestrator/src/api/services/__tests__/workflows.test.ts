import { describe, expect, it } from 'bun:test';
import { createWorkflowService, type WorkflowStore } from '../workflows';

function stubStore(): WorkflowStore {
  const runs = new Map<string, any>();
  return {
    create(input) {
      const id = `wf-${runs.size + 1}`;
      const run = {
        id,
        issueNumber: input.issueNumber,
        repo: input.repo,
        status: 'running' as const,
        currentStep: 'plan',
        steps: {},
        artifacts: [],
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
      if (run) Object.assign(run, data);
    },
  };
}

describe('Feature: Workflow service', () => {
  describe('Given a workflow service with a store', () => {
    const store = stubStore();
    const svc = createWorkflowService(store);

    it('Then has kind "service" and name "workflows"', () => {
      expect(svc.kind).toBe('service');
      expect(svc.name).toBe('workflows');
    });

    it('Then has start, get, list, and approve actions', () => {
      expect(svc.actions.start).toBeDefined();
      expect(svc.actions.get).toBeDefined();
      expect(svc.actions.list).toBeDefined();
      expect(svc.actions.approve).toBeDefined();
      expect(svc.actions.get.method).toBe('POST');
      expect(svc.actions.get.path).toBeUndefined();
      expect(svc.actions.approve.path).toBeUndefined();
    });

    it('Then start creates a workflow run', async () => {
      const result = await svc.actions.start.handler(
        { issueNumber: 42, repo: 'vertz-dev/vertz' },
        {} as any,
      );
      expect(result.id).toBe('wf-1');
      expect(result.status).toBe('running');
    });

    it('Then get returns a workflow run by id', async () => {
      const result = await svc.actions.get.handler(
        { id: 'wf-1' },
        {} as any,
      );
      expect(result).toBeTruthy();
      expect(result!.issueNumber).toBe(42);
    });

    it('Then list returns all workflow runs', async () => {
      const result = await svc.actions.list.handler(
        undefined as unknown,
        {} as any,
      );
      expect(result.runs).toHaveLength(1);
      expect(result.runs[0].id).toBe('wf-1');
    });

    it('Then approve updates the workflow status', async () => {
      store.update('wf-1', { currentStep: 'human-approval', status: 'waiting-approval' });
      const result = await svc.actions.approve.handler(
        { id: 'wf-1' },
        {} as any,
      );
      expect(result.approved).toBe(true);
    });
  });
});
