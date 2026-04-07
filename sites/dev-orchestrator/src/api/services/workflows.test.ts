import { describe, expect, it } from 'bun:test';
import { createInMemoryWorkflowStore } from './workflow-store';
import { createWorkflowService } from './workflows';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock context
const mockCtx = {} as any;

describe('createWorkflowService()', () => {
  describe('stepDetail action', () => {
    it('returns null for unknown run', async () => {
      const store = createInMemoryWorkflowStore();
      const svc = createWorkflowService(store);
      const result = await svc.actions.stepDetail.handler({ runId: 'nonexistent', step: 'plan' }, mockCtx);
      expect(result).toBeNull();
    });

    it('returns null for unknown step in existing run', async () => {
      const store = createInMemoryWorkflowStore();
      const run = store.create({ issueNumber: 1, repo: 'test/repo' });
      const svc = createWorkflowService(store);
      const result = await svc.actions.stepDetail.handler({ runId: run.id, step: 'nonexistent' }, mockCtx);
      expect(result).toBeNull();
    });

    it('returns step detail for existing step', async () => {
      const store = createInMemoryWorkflowStore();
      const run = store.create({ issueNumber: 1, repo: 'test/repo' });
      store.update(run.id, {
        steps: {
          plan: {
            status: 'complete',
            output: 'Design doc written',
            startedAt: '2026-04-07T10:00:00.000Z',
            completedAt: '2026-04-07T10:01:00.000Z',
            iterations: 3,
            duration: 60000,
          },
        },
      });

      const svc = createWorkflowService(store);
      const result = await svc.actions.stepDetail.handler({ runId: run.id, step: 'plan' }, mockCtx);
      expect(result).toEqual({
        status: 'complete',
        output: 'Design doc written',
        startedAt: '2026-04-07T10:00:00.000Z',
        completedAt: '2026-04-07T10:01:00.000Z',
        iterations: 3,
        duration: 60000,
      });
    });
  });

  describe('artifacts action', () => {
    it('returns empty artifacts for unknown run', async () => {
      const store = createInMemoryWorkflowStore();
      const svc = createWorkflowService(store);
      const result = await svc.actions.artifacts.handler({ runId: 'nonexistent' }, mockCtx);
      expect(result).toEqual({ artifacts: [] });
    });

    it('returns empty artifacts for run with no artifacts', async () => {
      const store = createInMemoryWorkflowStore();
      const run = store.create({ issueNumber: 1, repo: 'test/repo' });
      const svc = createWorkflowService(store);
      const result = await svc.actions.artifacts.handler({ runId: run.id }, mockCtx);
      expect(result).toEqual({ artifacts: [] });
    });

    it('returns artifacts for run with artifacts', async () => {
      const store = createInMemoryWorkflowStore();
      const run = store.create({ issueNumber: 1, repo: 'test/repo' });
      store.update(run.id, {
        artifacts: [
          { path: 'plans/feature.md', content: '# Design', type: 'markdown', step: 'plan' },
        ],
      });

      const svc = createWorkflowService(store);
      const result = await svc.actions.artifacts.handler({ runId: run.id }, mockCtx);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].path).toBe('plans/feature.md');
    });
  });
});
