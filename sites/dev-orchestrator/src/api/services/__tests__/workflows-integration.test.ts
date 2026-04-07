import { describe, expect, it, beforeEach } from 'bun:test';
import { createWorkflowService, type WorkflowStore, type WorkflowRun } from '../workflows';
import { createWorkflowExecutor } from '../../../lib/workflow-executor';
import type { LLMAdapter, WorkflowDefinition } from '@vertz/agents';
import { workflow, agent, tool } from '@vertz/agents';
import { s } from '@vertz/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLM(text: string): LLMAdapter {
  return {
    async chat() {
      return { text, toolCalls: [] };
    },
  };
}

function createTestStore(): WorkflowStore {
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
      if (run) runs.set(id, { ...run, ...data });
    },
  };
}

function createTestWorkflow(): WorkflowDefinition {
  const simpleAgent = agent('simple', {
    state: s.object({}),
    initialState: {},
    tools: {
      noop: tool({
        description: 'does nothing',
        input: s.object({}),
        output: s.object({ ok: s.boolean() }),
        handler: async () => ({ ok: true }),
      }),
    },
    model: { provider: 'minimax', model: 'MiniMax-M2.7' },
    prompt: { system: 'Respond with "done".' },
    loop: { maxIterations: 1 },
  });

  return workflow('test-flow', {
    input: s.object({
      issueNumber: s.number(),
      repo: s.string(),
    }),
  })
    .step('plan', {
      agent: simpleAgent,
      input: () => 'Plan',
    })
    .step('human-approval', {
      approval: { message: 'Approve?' },
    })
    .step('implement', {
      agent: simpleAgent,
      input: () => 'Implement',
    })
    .build();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Workflow service with executor integration', () => {
  let store: WorkflowStore;
  let wfDef: WorkflowDefinition;
  let llm: LLMAdapter;

  beforeEach(() => {
    store = createTestStore();
    wfDef = createTestWorkflow();
    llm = mockLLM('done');
  });

  describe('Given a workflow service with an executor', () => {
    describe('When starting a workflow via the API', () => {
      it('Then the workflow executes and pauses at approval gate', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        const svc = createWorkflowService(store, { executor });

        const run = await svc.actions.start.handler(
          { issueNumber: 42, repo: 'vertz-dev/vertz' },
          {} as any,
        );

        // Give the background execution time to complete
        await new Promise((resolve) => setTimeout(resolve, 50));

        const updated = store.get(run.id);
        expect(updated).toBeTruthy();
        expect(updated!.status).toBe('waiting-approval');
        expect(updated!.currentStep).toBe('human-approval');
        expect(updated!.steps['plan']).toBeDefined();
      });
    });

    describe('When approving a waiting workflow via the API', () => {
      it('Then the workflow resumes and completes', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        const svc = createWorkflowService(store, { executor });

        const run = await svc.actions.start.handler(
          { issueNumber: 42, repo: 'vertz-dev/vertz' },
          {} as any,
        );

        // Wait for workflow to reach approval gate
        await new Promise((resolve) => setTimeout(resolve, 50));

        const approval = await svc.actions.approve.handler(
          { id: run.id },
          {} as any,
        );
        expect(approval.approved).toBe(true);

        // Wait for workflow to complete after approval
        await new Promise((resolve) => setTimeout(resolve, 50));

        const updated = store.get(run.id);
        expect(updated).toBeTruthy();
        expect(updated!.status).toBe('completed');
        expect(updated!.steps['implement']).toBeDefined();
      });
    });

    describe('When listing workflow runs after execution', () => {
      it('Then returns runs with updated step data', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        const svc = createWorkflowService(store, { executor });

        await svc.actions.start.handler(
          { issueNumber: 42, repo: 'vertz-dev/vertz' },
          {} as any,
        );

        await new Promise((resolve) => setTimeout(resolve, 50));

        const result = await svc.actions.list.handler(
          undefined as unknown,
          {} as any,
        );
        expect(result.runs).toHaveLength(1);
        expect(result.runs[0].status).toBe('waiting-approval');
        expect(result.runs[0].steps['plan']).toBeDefined();
      });
    });
  });
});
