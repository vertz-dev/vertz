import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import type { LLMAdapter } from './loop/react-loop';
import { tool } from './tool';
import { runWorkflow, workflow } from './workflow';

// ---------------------------------------------------------------------------
// workflow() builder
// ---------------------------------------------------------------------------

describe('workflow() builder', () => {
  const testAgent = agent('test-agent', {
    state: s.object({}),
    initialState: {},
    tools: {},
    model: { provider: 'cloudflare', model: 'test' },
  });

  it('builds a frozen WorkflowDefinition with correct name and kind', () => {
    const pipeline = workflow('my-pipeline', { input: s.object({ userName: s.string() }) })
      .step('greet', {
        agent: testAgent,
        output: s.object({ greeting: s.string() }),
      })
      .build();

    expect(pipeline.kind).toBe('workflow');
    expect(pipeline.name).toBe('my-pipeline');
    expect(Object.isFrozen(pipeline)).toBe(true);
  });

  it('throws on invalid workflow name', () => {
    expect(() => workflow('Bad Name!', { input: s.object({}) })).toThrow(
      /workflow\(\) name must be/,
    );
  });

  it('throws when build() is called with no steps', () => {
    expect(() => workflow('empty', { input: s.object({}) }).build()).toThrow(/at least one step/);
  });

  it('throws on invalid step name', () => {
    expect(() =>
      workflow('test', { input: s.object({}) }).step('Invalid Name', { output: s.object({}) }),
    ).toThrow(/step\(\) name must be/);
  });

  it('throws on duplicate step names', () => {
    expect(() =>
      workflow('dupe', { input: s.object({}) })
        .step('do-work', { agent: testAgent, output: s.object({}) })
        .step('do-work', { agent: testAgent, output: s.object({}) }),
    ).toThrow(/Duplicate step name/);
  });

  it('preserves input schema and steps', () => {
    const inputSchema = s.object({ repo: s.string() });

    const pipeline = workflow('pipeline', { input: inputSchema })
      .step('analyze', { agent: testAgent, output: s.object({ result: s.string() }) })
      .step('report', { agent: testAgent, output: s.object({ summary: s.string() }) })
      .build();

    expect(pipeline.input).toBe(inputSchema);
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps[0].name).toBe('analyze');
    expect(pipeline.steps[1].name).toBe('report');
  });

  it('preserves access config', () => {
    const pipeline = workflow('with-access', {
      input: s.object({}),
      access: { start: 'authenticated', approve: 'admin' },
    })
      .step('work', { agent: testAgent, output: s.object({}) })
      .build();

    expect(pipeline.access).toEqual({ start: 'authenticated', approve: 'admin' });
  });

  it('preserves agent reference on steps', () => {
    const pipeline = workflow('ref-test', { input: s.object({}) })
      .step('greet', { agent: testAgent, output: s.object({ greeting: s.string() }) })
      .build();

    expect(pipeline.steps[0].agent).toBe(testAgent);
  });

  it('preserves input callback on steps', () => {
    const pipeline = workflow('cb-test', { input: s.object({}) })
      .step('greet', {
        agent: testAgent,
        input: () => ({ message: 'hello' }),
        output: s.object({ greeting: s.string() }),
      })
      .build();

    expect(typeof pipeline.steps[0].input).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// runWorkflow() execution
// ---------------------------------------------------------------------------

/** Create a mock LLM that returns tool calls then completes. */
function createMockLlm(
  responses: Array<{
    text: string;
    toolCalls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>;
  }>,
): LLMAdapter {
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

    const pipeline = workflow('greet-pipeline', { input: s.object({ target: s.string() }) })
      .step('greet', {
        agent: greetAgent,
        input: (ctx) => `Greet ${ctx.workflow.input.target}`,
      })
      .build();

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

    const pipeline = workflow('multi-step', { input: s.object({ data: s.string() }) })
      .step('first', {
        agent: noopAgent,
        input: () => 'Step 1: do something',
      })
      .step('second', {
        agent: noopAgent,
        input: (ctx) => {
          capturedPrev.push({ ...ctx.prev });
          return 'Step 2: continue';
        },
      })
      .build();

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
    // Without output schema, prev contains { response: rawText }
    expect(capturedPrev[0].first).toEqual({ response: 'Step 1 done' });
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

    const pipeline = workflow('fail-pipeline', { input: s.object({}) })
      .step('will-fail', {
        agent: noopAgent,
        input: () => 'Please fail',
        output: s.object({}),
      })
      .step('never-reached', {
        agent: noopAgent,
        input: () => 'Should not run',
        output: s.object({}),
      })
      .build();

    const result = await runWorkflow(pipeline, { input: {}, llm });

    expect(result.status).toBe('error');
    expect(result.failedStep).toBe('will-fail');
    expect(result.errorReason).toBe('agent-failed');
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

    const pipeline = workflow('validated', { input: s.object({ name: s.string() }) })
      .step('work', { agent: noopAgent, output: s.object({}) })
      .build();

    // @ts-expect-error — passing number where string is expected
    await expect(runWorkflow(pipeline, { input: { name: 42 }, llm })).rejects.toThrow();
  });

  it('throws when a step has no agent', async () => {
    const llm = createMockLlm([{ text: 'done' }]);

    const pipeline = workflow('no-agent', { input: s.object({}) })
      .step('orphan', { output: s.object({}) })
      .build();

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

    const pipeline = workflow('default-msg', { input: s.object({}) })
      .step('auto', { agent: noopAgent })
      .build();

    await runWorkflow(pipeline, { input: {}, llm });

    expect(capturedMessage).toBe('Execute step "auto"');
  });

  it('suspends on approval step and returns pending status', async () => {
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

    const pipeline = workflow('approval-pipeline', {
      input: s.object({ docPath: s.string() }),
    })
      .step('write-doc', {
        agent: noopAgent,
        input: () => 'Write the doc',
      })
      .step('human-review', {
        approval: {
          message: 'Review the doc',
          timeout: '7d',
        },
      })
      .step('implement', {
        agent: noopAgent,
        input: () => 'Start implementation',
      })
      .build();

    const result = await runWorkflow(pipeline, {
      input: { docPath: '/plans/feature.md' },
      llm,
    });

    expect(result.status).toBe('pending');
    expect(result.pendingStep).toBe('human-review');
    // First step should have completed
    expect(result.stepResults['write-doc'].status).toBe('complete');
    // Steps after approval should not have run
    expect(result.stepResults).not.toHaveProperty('implement');
  });

  it('resumes a workflow from a specific step after approval', async () => {
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

    const pipeline = workflow('resume-pipeline', { input: s.object({}) })
      .step('first', {
        agent: noopAgent,
        input: () => 'Step 1',
      })
      .step('approve', {
        approval: { message: 'Approve?' },
      })
      .step('last', {
        agent: noopAgent,
        input: () => 'Step 3',
      })
      .build();

    // Resume from after the approval step, providing previous results
    const result = await runWorkflow(pipeline, {
      input: {},
      llm,
      resumeAfter: 'approve',
      previousResults: {
        first: { status: 'complete', response: 'Step 1 done', iterations: 1 },
      },
    });

    expect(result.status).toBe('complete');
    // Should have only run 'last'
    expect(result.stepResults).toHaveProperty('first');
    expect(result.stepResults).toHaveProperty('last');
    expect(result.stepResults['last'].status).toBe('complete');
  });

  it('returns approval message from function', async () => {
    const llm: LLMAdapter = {
      async chat() {
        return { text: 'done', toolCalls: [] };
      },
    };

    const pipeline = workflow('msg-pipeline', { input: s.object({ docPath: s.string() }) })
      .step('review', {
        approval: {
          message: (ctx) => `Please review: ${ctx.workflow.input.docPath}`,
        },
      })
      .build();

    const result = await runWorkflow(pipeline, {
      input: { docPath: '/plans/test.md' },
      llm,
    });

    expect(result.status).toBe('pending');
    expect(result.approvalMessage).toBe('Please review: /plans/test.md');
  });

  it('throws when resumeAfter references a nonexistent step', async () => {
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

    const pipeline = workflow('bad-resume', { input: s.object({}) })
      .step('only', { agent: noopAgent, output: s.object({}) })
      .build();

    await expect(
      runWorkflow(pipeline, { input: {}, llm, resumeAfter: 'nonexistent' }),
    ).rejects.toThrow(/Step "nonexistent" not found/);
  });

  it('treats stuck agent as workflow error', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
      loop: { maxIterations: 2 },
    });

    const llm: LLMAdapter = {
      async chat() {
        // Always request a nonexistent tool — triggers stuck detection
        return { text: '', toolCalls: [{ name: 'missing-tool', arguments: {} }] };
      },
    };

    const pipeline = workflow('stuck-pipeline', { input: s.object({}) })
      .step('will-get-stuck', { agent: noopAgent, output: s.object({}) })
      .step('never-reached', { agent: noopAgent, output: s.object({}) })
      .build();

    const result = await runWorkflow(pipeline, { input: {}, llm });

    expect(result.status).toBe('error');
    expect(result.failedStep).toBe('will-get-stuck');
    expect(result.errorReason).toBe('agent-failed');
    expect(result.stepResults['will-get-stuck'].status).toBe('max-iterations');
    expect(result.stepResults).not.toHaveProperty('never-reached');
  });

  it('stores validated output in prev when agent returns valid JSON matching schema', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    let callCount = 0;
    const llm: LLMAdapter = {
      async chat() {
        callCount++;
        if (callCount === 1) {
          // First step returns valid JSON matching its output schema
          return { text: '{"greeting":"Hello!"}', toolCalls: [] };
        }
        return { text: 'done', toolCalls: [] };
      },
    };

    let capturedGreeting: unknown;

    const pipeline = workflow('validated-output', { input: s.object({}) })
      .step('greet', {
        agent: noopAgent,
        output: s.object({ greeting: s.string() }),
      })
      .step('consumer', {
        agent: noopAgent,
        input: (ctx) => {
          capturedGreeting = ctx.prev.greet;
          return 'consume';
        },
      })
      .build();

    await runWorkflow(pipeline, { input: {}, llm });

    // prev should contain the validated, parsed output — not { response: '...' }
    expect(capturedGreeting).toEqual({ greeting: 'Hello!' });
  });

  it('returns error when agent output is valid JSON but fails schema validation', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    const llm: LLMAdapter = {
      async chat() {
        // Valid JSON but wrong shape — greeting should be string, not number
        return { text: '{"greeting":42}', toolCalls: [] };
      },
    };

    const pipeline = workflow('schema-fail', { input: s.object({}) })
      .step('greet', {
        agent: noopAgent,
        output: s.object({ greeting: s.string() }),
      })
      .build();

    const result = await runWorkflow(pipeline, { input: {}, llm });

    expect(result.status).toBe('error');
    expect(result.failedStep).toBe('greet');
    expect(result.errorReason).toBe('schema-mismatch');
    // Agent completed successfully — the error is from output validation, not the agent
    expect(result.stepResults['greet']).toBeDefined();
    expect(result.stepResults['greet'].status).toBe('complete');
    expect(result.stepResults['greet'].response).toBe('{"greeting":42}');
  });

  it('returns error when agent output is not valid JSON and step has output schema', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    const llm: LLMAdapter = {
      async chat() {
        return { text: 'not json at all', toolCalls: [] };
      },
    };

    const pipeline = workflow('json-fail', { input: s.object({}) })
      .step('greet', {
        agent: noopAgent,
        output: s.object({ greeting: s.string() }),
      })
      .build();

    const result = await runWorkflow(pipeline, { input: {}, llm });

    expect(result.status).toBe('error');
    expect(result.failedStep).toBe('greet');
    expect(result.errorReason).toBe('invalid-json');
    // Agent completed but response wasn't valid JSON
    expect(result.stepResults['greet']).toBeDefined();
    expect(result.stepResults['greet'].status).toBe('complete');
    expect(result.stepResults['greet'].response).toBe('not json at all');
  });

  it('returns schema-mismatch when output schema parse() throws', async () => {
    const noopAgent = agent('noop', {
      state: s.object({}),
      initialState: {},
      tools: {},
      model: { provider: 'cloudflare', model: 'test' },
    });

    const llm: LLMAdapter = {
      async chat() {
        return { text: '{"value":1}', toolCalls: [] };
      },
    };

    // Create a schema whose parse() throws instead of returning { ok: false }
    const throwingSchema = {
      parse() {
        throw new Error('custom refinement exploded');
      },
      _output: undefined as unknown,
    };

    const pipeline = workflow('parse-throws', { input: s.object({}) })
      .step('greet', {
        agent: noopAgent,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing edge case with throwing schema
        output: throwingSchema as any,
      })
      .build();

    const result = await runWorkflow(pipeline, { input: {}, llm });

    expect(result.status).toBe('error');
    expect(result.failedStep).toBe('greet');
    expect(result.errorReason).toBe('schema-mismatch');
  });

  it('passes message from { message: string } form of step input callback', async () => {
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

    const pipeline = workflow('object-input', { input: s.object({}) })
      .step('work', {
        agent: noopAgent,
        input: () => ({ message: 'Hello from object form' }),
      })
      .build();

    await runWorkflow(pipeline, { input: {}, llm });

    expect(capturedMessage).toBe('Hello from object form');
  });
});
