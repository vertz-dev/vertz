import { describe, expect, it } from '@vertz/test';
import { createInMemoryWorkflowStore } from '../workflow-store';

describe('Feature: In-memory workflow store', () => {
  describe('Given an empty store', () => {
    const store = createInMemoryWorkflowStore();

    it('Then list returns an empty array', () => {
      expect(store.list()).toEqual([]);
    });

    it('Then get returns null for unknown id', () => {
      expect(store.get('nonexistent')).toBeNull();
    });
  });

  describe('Given a store with a created run', () => {
    const store = createInMemoryWorkflowStore();
    const run = store.create({ issueNumber: 10, repo: 'vertz-dev/vertz' });

    it('Then create returns a run with a generated id', () => {
      expect(run.id).toMatch(/^wf-/);
      expect(run.issueNumber).toBe(10);
      expect(run.repo).toBe('vertz-dev/vertz');
      expect(run.status).toBe('running');
      expect(run.currentStep).toBe('plan');
    });

    it('Then get returns the created run', () => {
      const found = store.get(run.id);
      expect(found).toBeTruthy();
      expect(found!.id).toBe(run.id);
    });

    it('Then list returns the created run', () => {
      expect(store.list()).toHaveLength(1);
    });

    it('Then update modifies the run', () => {
      store.update(run.id, { status: 'waiting-approval', currentStep: 'human-approval' });
      const updated = store.get(run.id);
      expect(updated!.status).toBe('waiting-approval');
      expect(updated!.currentStep).toBe('human-approval');
    });
  });
});
