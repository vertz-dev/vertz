import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import { agent } from './agent';
import { step, workflow } from './workflow';
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
