import { describe, expect, it, mock, beforeEach } from '@vertz/test';
import { createWorkflowExecutor } from '../workflow-executor';
import type { WorkflowStore, WorkflowRun } from '../../api/services/workflows';
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

function createTestStore(): WorkflowStore & { data: Map<string, WorkflowRun> } {
  const data = new Map<string, WorkflowRun>();
  let counter = 0;
  return {
    data,
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
        artifacts: [],
        createdAt: new Date().toISOString(),
      };
      data.set(id, run);
      return run;
    },
    get(id) {
      return data.get(id) ?? null;
    },
    list() {
      return [...data.values()];
    },
    update(id, partial) {
      const run = data.get(id);
      if (run) data.set(id, { ...run, ...partial });
    },
  };
}

function createSimpleWorkflow(): WorkflowDefinition {
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
    prompt: { system: 'You are a simple test agent. Just respond with "done".' },
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
      input: (ctx) => `Plan issue #${(ctx.workflow.input as { issueNumber: number }).issueNumber}`,
    })
    .step('human-approval', {
      approval: { message: 'Approve the plan?' },
    })
    .step('implement', {
      agent: simpleAgent,
      input: () => 'Implement the plan',
    })
    .build();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: Workflow executor', () => {
  describe('Given a workflow executor with a mock LLM', () => {
    let store: ReturnType<typeof createTestStore>;
    let llm: LLMAdapter;
    let wfDef: WorkflowDefinition;

    beforeEach(() => {
      store = createTestStore();
      llm = mockLLM('done');
      wfDef = createSimpleWorkflow();
    });

    describe('When starting a workflow', () => {
      it('Then executes steps until approval gate and updates store to waiting-approval', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        const run = store.create({ issueNumber: 42, repo: 'vertz-dev/vertz' });

        await executor.start(run);

        const updated = store.get(run.id);
        expect(updated).toBeTruthy();
        expect(updated!.status).toBe('waiting-approval');
        expect(updated!.currentStep).toBe('human-approval');
        expect(updated!.steps['plan']).toBeDefined();
        expect(updated!.steps['plan'].status).toBe('complete');
      });
    });

    describe('When approving a workflow', () => {
      it('Then resumes execution from after the approval step and completes', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        const run = store.create({ issueNumber: 42, repo: 'vertz-dev/vertz' });

        await executor.start(run);
        await executor.approve(run.id);

        const updated = store.get(run.id);
        expect(updated).toBeTruthy();
        expect(updated!.status).toBe('completed');
        expect(updated!.steps['implement']).toBeDefined();
        expect(updated!.steps['implement'].status).toBe('complete');
      });
    });

    describe('When approving a non-existent workflow', () => {
      it('Then throws an error', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        await expect(executor.approve('wf-999')).rejects.toThrow('not found');
      });
    });

    describe('When approving a workflow not waiting for approval', () => {
      it('Then throws an error', async () => {
        const executor = createWorkflowExecutor(wfDef, store, llm);
        const run = store.create({ issueNumber: 42, repo: 'vertz-dev/vertz' });
        // Don't run the workflow — it's still in 'running' status
        await expect(executor.approve(run.id)).rejects.toThrow('not waiting');
      });
    });

    describe('When a workflow step fails', () => {
      it('Then updates store to failed status', async () => {
        const failingLlm: LLMAdapter = {
          async chat() {
            throw new Error('LLM unavailable');
          },
        };
        const executor = createWorkflowExecutor(wfDef, store, failingLlm);
        const run = store.create({ issueNumber: 42, repo: 'vertz-dev/vertz' });

        await executor.start(run);

        const updated = store.get(run.id);
        expect(updated).toBeTruthy();
        expect(updated!.status).toBe('failed');
      });
    });
  });
});
