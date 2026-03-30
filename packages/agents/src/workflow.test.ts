import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import type { LLMAdapter } from './loop/react-loop';
import { tool } from './tool';
import { runWorkflow, step, workflow } from './workflow';
import type { StepContext } from './workflow';

// ---------------------------------------------------------------------------
// step() factory
// ---------------------------------------------------------------------------

describe('step()', () => {
  it('returns a frozen StepDefinition with correct name and kind', () => {
    const greetStep = step('greet', {
      output: s.object({ greeting: s.string() }),
    });

    expect(greetStep.kind).toBe('step');
    expect(greetStep.name).toBe('greet');
    expect(Object.isFrozen(greetStep)).toBe(true);
  });

  it('throws on invalid step name', () => {
    expect(() =>
      step('Invalid Name', { output: s.object({}) }),
    ).toThrow(/step\(\) name must be/);
  });

  it('preserves agent reference', () => {
    const testAgent = agent('test-agent', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    const greetStep = step('greet', {
      agent: testAgent,
      output: s.object({ greeting: s.string() }),
    });

    expect(greetStep.agent).toBe(testAgent);
  });

  it('preserves input callback', () => {
    const inputFn = (_ctx: StepContext) => ({ message: 'hello' });
    const greetStep = step('greet', {
      input: inputFn,
      output: s.object({ greeting: s.string() }),
    });

    expect(greetStep.input).toBe(inputFn);
  });
});

// ---------------------------------------------------------------------------
// workflow() factory
// ---------------------------------------------------------------------------

describe('workflow()', () => {
  const testAgent = agent('test-agent', {
    state: s.object({}),
    initialState: {},
    tools: {},
    model: { provider: 'cloudflare', model: 'test' },
  });

  it('returns a frozen WorkflowDefinition with correct name and kind', () => {
    const pipeline = workflow('my-pipeline', {
      input: s.object({ userName: s.string() }),
      steps: [
        step('greet', {
          agent: testAgent,
          output: s.object({ greeting: s.string() }),
        }),
      ],
    });

    expect(pipeline.kind).toBe('workflow');
    expect(pipeline.name).toBe('my-pipeline');
    expect(Object.isFrozen(pipeline)).toBe(true);
  });

  it('throws on invalid workflow name', () => {
    expect(() =>
      workflow('Bad Name!', {
        input: s.object({}),
        steps: [],
      }),
    ).toThrow(/workflow\(\) name must be/);
  });

  it('throws when steps array is empty', () => {
    expect(() =>
      workflow('empty', {
        input: s.object({}),
        steps: [],
      }),
    ).toThrow(/at least one step/);
  });

  it('throws on duplicate step names', () => {
    expect(() =>
      workflow('dupe', {
        input: s.object({}),
        steps: [
          step('do-work', { agent: testAgent, output: s.object({}) }),
          step('do-work', { agent: testAgent, output: s.object({}) }),
        ],
      }),
    ).toThrow(/Duplicate step name/);
  });

  it('preserves input schema and steps', () => {
    const inputSchema = s.object({ repo: s.string() });
    const step1 = step('analyze', { agent: testAgent, output: s.object({ result: s.string() }) });
    const step2 = step('report', { agent: testAgent, output: s.object({ summary: s.string() }) });

    const pipeline = workflow('pipeline', {
      input: inputSchema,
      steps: [step1, step2],
    });

    expect(pipeline.input).toBe(inputSchema);
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps[0].name).toBe('analyze');
    expect(pipeline.steps[1].name).toBe('report');
  });

  it('preserves access config', () => {
    const pipeline = workflow('with-access', {
      input: s.object({}),
      steps: [step('work', { agent: testAgent, output: s.object({}) })],
      access: { start: 'authenticated', approve: 'admin' },
    });

    expect(pipeline.access).toEqual({ start: 'authenticated', approve: 'admin' });
  });
});

// ---------------------------------------------------------------------------
// runWorkflow() execution
// ---------------------------------------------------------------------------

/** Create a mock LLM that returns tool calls then completes. */
function createMockLlm(responses: Array<{ text: string; toolCalls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> }> }>): LLMAdapter {
  let callIndex = 0;
  return {
    async chat() {
      const resp = responses[callIndex] ?? { text: 'done', toolCalls: [] };
      callIndex++;
      return { text: resp.text, toolCalls: resp.toolCalls ?? [] };
    },
  };
}

describe('runWorkflow()', () => {
  it('executes a single-step workflow and returns the step output', async () => {
    const greetTool = tool({
      description: 'Greet',
      input: s.object({ name: s.string() }),
      output: s.object({ greeting: s.string() }),
      handler(input) {
        return { greeting: `Hello, ${input.name}!` };
      },
    });

    const greetAgent = agent('greeter', {
      state: s.object({}),
      initialState: {},
      tools: { greet: greetTool },
      model: { provider: 'cloudflare', model: 'test' },
      prompt: { system: 'Greet the user.' },
    });

    const llm = createMockLlm([
      // Agent calls the greet tool
      { text: '', toolCalls: [{ name: 'greet', arguments: { name: 'World' } }] },
      // Agent responds with final text
      { text: 'Hello, World!' },
    ]);

    const pipeline = workflow('greet-pipeline', {
      input: s.object({ target: s.string() }),
      steps: [
        step('greet', {
          agent: greetAgent,
          input: (ctx) => `Greet ${(ctx.workflow.input as { target: string }).target}`,
          output: s.object({ response: s.string() }),
        }),
      ],
    });

    const result = await runWorkflow(pipeline, {
      input: { target: 'World' },
      llm,
    });

    expect(result.status).toBe('complete');
    expect(result.stepResults).toHaveProperty('greet');
    expect(result.stepResults['greet'].status).toBe('complete');
  });

  it('executes multi-step workflow and passes prev between steps', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    let step1CallCount = 0;
    let step2CallCount = 0;

    // Each step's LLM completes immediately with text
    // We track call order via the mock
    const llm: LLMAdapter = {
      async chat(messages) {
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
        if (userMsg.includes('Step 1')) {
          step1CallCount++;
          return { text: 'Step 1 done', toolCalls: [] };
        }
        step2CallCount++;
        return { text: 'Step 2 done', toolCalls: [] };
      },
    };

    const capturedPrev: Record<string, unknown>[] = [];

    const pipeline = workflow('multi-step', {
      input: s.object({ data: s.string() }),
      steps: [
        step('first', {
          agent: noopAgent,
          input: () => 'Step 1: do something',
          output: s.object({}),
        }),
        step('second', {
          agent: noopAgent,
          input: (ctx) => {
            capturedPrev.push({ ...ctx.prev });
            return 'Step 2: continue';
          },
          output: s.object({}),
        }),
      ],
    });

    const result = await runWorkflow(pipeline, {
      input: { data: 'test' },
      llm,
    });

    expect(result.status).toBe('complete');
    expect(step1CallCount).toBe(1);
    expect(step2CallCount).toBe(1);
    // Step 2's input callback should have received step 1's output in prev
    expect(capturedPrev).toHaveLength(1);
    expect(capturedPrev[0]).toHaveProperty('first');
  });

  it('stops on error and reports failed step', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    const llm: LLMAdapter = {
      async chat(messages) {
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
        if (userMsg.includes('fail')) {
          throw new Error('LLM exploded');
        }
        return { text: 'ok', toolCalls: [] };
      },
    };

    const pipeline = workflow('fail-pipeline', {
      input: s.object({}),
      steps: [
        step('will-fail', {
          agent: noopAgent,
          input: () => 'Please fail',
          output: s.object({}),
        }),
        step('never-reached', {
          agent: noopAgent,
          input: () => 'Should not run',
          output: s.object({}),
        }),
      ],
    });

    const result = await runWorkflow(pipeline, { input: {}, llm });

    expect(result.status).toBe('error');
    expect(result.failedStep).toBe('will-fail');
    expect(result.stepResults).toHaveProperty('will-fail');
    expect(result.stepResults).not.toHaveProperty('never-reached');
  });

  it('validates workflow input against schema', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    const llm = createMockLlm([{ text: 'done' }]);

    const pipeline = workflow('validated', {
      input: s.object({ name: s.string() }),
      steps: [step('work', { agent: noopAgent, output: s.object({}) })],
    });

    // @ts-expect-error — passing number where string is expected
    await expect(runWorkflow(pipeline, { input: { name: 42 }, llm })).rejects.toThrow();
  });

  it('throws when a step has no agent', async () => {
    const llm = createMockLlm([{ text: 'done' }]);

    const pipeline = workflow('no-agent', {
      input: s.object({}),
      steps: [step('orphan', { output: s.object({}) })],
    });

    await expect(runWorkflow(pipeline, { input: {}, llm })).rejects.toThrow(
      /Step "orphan" has no agent/,
    );
  });

  it('uses default message when step has no input callback', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    let capturedMessage = '';
    const llm: LLMAdapter = {
      async chat(messages) {
        capturedMessage = messages.find((m) => m.role === 'user')?.content ?? '';
        return { text: 'done', toolCalls: [] };
      },
    };

    const pipeline = workflow('default-msg', {
      input: s.object({}),
      steps: [step('auto', { agent: noopAgent, output: s.object({}) })],
    });

    await runWorkflow(pipeline, { input: {}, llm });

    expect(capturedMessage).toBe('Execute step "auto"');
  });
});
