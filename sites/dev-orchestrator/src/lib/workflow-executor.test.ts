import { describe, expect, it } from '@vertz/test';
import { agent, workflow } from '@vertz/agents';
import type { LLMAdapter, StepProgressEvent } from '@vertz/agents';
import { s } from '@vertz/schema';
import { createInMemoryWorkflowStore } from '../api/services/workflow-store';
import { createProgressEmitter } from './progress-emitter';
import { createWorkflowExecutor } from './workflow-executor';

describe('createWorkflowExecutor() progress events', () => {
  const noopAgent = agent('noop', {
    state: s.object({}),
    initialState: {},
    tools: {},
    model: { provider: 'cloudflare', model: 'test' },
  });

  const llm: LLMAdapter = {
    async chat() {
      return { text: 'done', toolCalls: [] };
    },
  };

  it('forwards step progress events to the ProgressEmitter', async () => {
    const workflowDef = workflow('test-flow', {
      input: s.object({ issueNumber: s.number(), repo: s.string() }),
    })
      .step('plan', { agent: noopAgent, input: () => 'Plan it' })
      .step('implement', { agent: noopAgent, input: () => 'Do it' })
      .build();

    const store = createInMemoryWorkflowStore();
    const emitter = createProgressEmitter();
    const executor = createWorkflowExecutor(workflowDef, store, llm, { emitter });

    const events: StepProgressEvent[] = [];
    const run = store.create({ issueNumber: 1, repo: 'test/repo' });

    emitter.subscribe(run.id, (e) => events.push(e));
    await executor.start(run);

    // Should have: started+completed for plan, started+completed for implement
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({ step: 'plan', type: 'step-started' });
    expect(events[1]).toMatchObject({ step: 'plan', type: 'step-completed' });
    expect(events[2]).toMatchObject({ step: 'implement', type: 'step-started' });
    expect(events[3]).toMatchObject({ step: 'implement', type: 'step-completed' });

    // Snapshot should also contain all events
    expect(emitter.snapshot(run.id)).toHaveLength(4);
  });

  it('populates step timing from progress events in store', async () => {
    const workflowDef = workflow('timing-flow', {
      input: s.object({ issueNumber: s.number(), repo: s.string() }),
    })
      .step('plan', { agent: noopAgent, input: () => 'Plan it' })
      .build();

    const store = createInMemoryWorkflowStore();
    const emitter = createProgressEmitter();
    const executor = createWorkflowExecutor(workflowDef, store, llm, { emitter });

    const run = store.create({ issueNumber: 1, repo: 'test/repo' });
    await executor.start(run);

    const updated = store.get(run.id)!;
    const planStep = updated.steps['plan'];
    expect(planStep).toBeDefined();
    expect(planStep.status).toBe('complete');
    expect(planStep.iterations).toBe(1);
    expect(typeof planStep.startedAt).toBe('string');
    expect(typeof planStep.completedAt).toBe('string');
    expect(typeof planStep.duration).toBe('number');
    expect(planStep.duration!).toBeGreaterThanOrEqual(0);
  });

  it('works without emitter (backward compatible)', async () => {
    const workflowDef = workflow('compat-flow', {
      input: s.object({ issueNumber: s.number(), repo: s.string() }),
    })
      .step('work', { agent: noopAgent })
      .build();

    const store = createInMemoryWorkflowStore();
    const executor = createWorkflowExecutor(workflowDef, store, llm);

    const run = store.create({ issueNumber: 1, repo: 'test/repo' });
    await executor.start(run);

    const updated = store.get(run.id);
    expect(updated?.status).toBe('completed');
  });
});
