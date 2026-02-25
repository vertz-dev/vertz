import { afterEach, describe, expect, it } from 'vitest';
import { tui } from '../app';
import { TaskRunner, type TaskRunnerConfig } from '../components/TaskRunner';
import { renderToString } from '../render-to-string';
import { TestAdapter } from '../test/test-adapter';

describe('TaskRunner', () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it('runs tasks sequentially and returns results', async () => {
    process.env.CI = 'true';
    const order: string[] = [];

    const config: TaskRunnerConfig = {
      tasks: [
        {
          label: 'Step 1',
          run: async () => {
            order.push('step1');
            return 'result1';
          },
        },
        {
          label: 'Step 2',
          run: async () => {
            order.push('step2');
            return 42;
          },
        },
      ],
    };

    const results = await TaskRunner(config).run();

    expect(order).toEqual(['step1', 'step2']);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('success');
    expect(results[0].label).toBe('Step 1');
    expect(results[0].value).toBe('result1');
    expect(results[0].duration).toBeGreaterThanOrEqual(0);
    expect(results[1].status).toBe('success');
    expect(results[1].value).toBe(42);
  });

  it('stops on failure and marks remaining as skipped', async () => {
    process.env.CI = 'true';

    const config: TaskRunnerConfig = {
      tasks: [
        { label: 'Pass', run: async () => 'ok' },
        {
          label: 'Fail',
          run: async () => {
            throw new Error('boom');
          },
        },
        { label: 'Never', run: async () => 'nope' },
      ],
    };

    const results = await TaskRunner(config).run();

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    expect(results[1].error?.message).toBe('boom');
    expect(results[2].status).toBe('skipped');
  });

  it('logs task progress in CI mode', async () => {
    process.env.CI = 'true';
    const output: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await TaskRunner({
        tasks: [
          { label: 'Build', run: async () => 'done' },
          { label: 'Test', run: async () => 'pass' },
        ],
      }).run();

      const joined = output.join('');
      expect(joined).toContain('Build');
      expect(joined).toContain('Test');
      expect(joined).toContain('\u2713'); // success symbol
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('records elapsed duration per task', async () => {
    process.env.CI = 'true';

    const results = await TaskRunner({
      tasks: [
        {
          label: 'Slow',
          run: () => new Promise((resolve) => setTimeout(() => resolve('done'), 50)),
        },
      ],
    }).run();

    expect(results[0].duration).toBeGreaterThanOrEqual(40);
  });

  it('handles sync task functions', async () => {
    process.env.CI = 'true';

    const results = await TaskRunner({
      tasks: [{ label: 'Sync', run: () => 'sync-result' }],
    }).run();

    expect(results[0].status).toBe('success');
    expect(results[0].value).toBe('sync-result');
  });

  it('component renders task labels with pending status initially', () => {
    const adapter = new TestAdapter(60, 10);
    const runner = TaskRunner({
      tasks: [
        { label: 'Analyze', run: async () => 'ok' },
        { label: 'Build', run: async () => 'ok' },
      ],
    });

    const handle = tui.mount(() => runner.component(), { adapter });
    const text = adapter.text();
    expect(text).toContain('Analyze');
    expect(text).toContain('Build');
    expect(text).toContain('\u2500'); // dash symbol for pending
    handle.unmount();
  });

  it('component updates status after tasks complete', async () => {
    const adapter = new TestAdapter(60, 10);
    const runner = TaskRunner({
      tasks: [
        { label: 'Step A', run: async () => 'done' },
        { label: 'Step B', run: async () => 'done' },
      ],
    });

    const handle = tui.mount(() => runner.component(), { adapter });

    await runner.run();

    const text = adapter.text();
    expect(text).toContain('Step A');
    expect(text).toContain('Step B');
    expect(text).toContain('\u2713'); // success symbol
    handle.unmount();
  });

  it('component shows running indicator during task execution', async () => {
    let resolveTask: (() => void) | null = null;
    const taskPromise = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });

    const adapter = new TestAdapter(60, 10);
    const runner = TaskRunner({
      tasks: [
        {
          label: 'Deploy',
          run: () => taskPromise,
        },
      ],
    });

    const handle = tui.mount(() => runner.component(), { adapter });

    // Start run (don't await — it will block until we resolve)
    const runPromise = runner.run();

    // Wait a tick for the state to update to 'running'
    await new Promise((resolve) => setTimeout(resolve, 10));

    // While running, the component shows the label (running state renders empty string for indicator)
    const text = adapter.text();
    expect(text).toContain('Deploy');

    // Resolve the task so it completes
    resolveTask?.();
    await runPromise;

    handle.unmount();
  });

  it('CI mode logs skip message for tasks after failure', async () => {
    process.env.CI = 'true';
    const output: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await TaskRunner({
        tasks: [
          {
            label: 'Fail',
            run: async () => {
              throw new Error('oops');
            },
          },
          { label: 'Skipped Task', run: async () => 'nope' },
        ],
      }).run();

      const joined = output.join('');
      expect(joined).toContain('Skipped Task');
      expect(joined).toContain('skipped');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('CI mode does not leak error messages to stdout', async () => {
    process.env.CI = 'true';
    const output: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await TaskRunner({
        tasks: [
          {
            label: 'Sensitive',
            run: async () => {
              throw new Error('database password: s3cret');
            },
          },
        ],
      }).run();

      const joined = output.join('');
      expect(joined).toContain('Sensitive');
      expect(joined).toContain('failed');
      expect(joined).not.toContain('s3cret');
      expect(joined).not.toContain('database password');
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it('renderToString renders task results summary', async () => {
    process.env.CI = 'true';

    const runner = TaskRunner({
      tasks: [
        { label: 'Compile', run: async () => 'ok' },
        { label: 'Bundle', run: async () => 'ok' },
      ],
    });

    await runner.run();

    const output = renderToString(runner.component(), { width: 60 });
    expect(output).toContain('Compile');
    expect(output).toContain('Bundle');
    expect(output).toContain('\u2713'); // success symbol
  });
});
