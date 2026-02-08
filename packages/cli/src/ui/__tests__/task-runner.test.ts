import { describe, expect, it, vi } from 'vitest';
import type { TaskHandle } from '../task-runner';
import { createTaskRunner } from '../task-runner';

describe('TaskRunner', () => {
  it('createTaskRunner returns a TaskRunner instance', () => {
    const runner = createTaskRunner();
    expect(runner).toBeDefined();
    expect(runner.group).toBeTypeOf('function');
    expect(runner.info).toBeTypeOf('function');
    expect(runner.warn).toBeTypeOf('function');
    expect(runner.error).toBeTypeOf('function');
    expect(runner.success).toBeTypeOf('function');
    expect(runner.cleanup).toBeTypeOf('function');
  });

  it('group creates a TaskGroup', () => {
    const runner = createTaskRunner();
    const group = runner.group('Build');
    expect(group).toBeDefined();
    expect(group.task).toBeTypeOf('function');
    expect(group.dismiss).toBeTypeOf('function');
  });

  it('group.task executes the provided function', async () => {
    const runner = createTaskRunner();
    const group = runner.group('Build');
    const fn = vi.fn();
    await group.task('Compiling', fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('task function receives a handle with update, succeed, fail', async () => {
    const runner = createTaskRunner();
    const group = runner.group('Build');
    let receivedHandle: TaskHandle | undefined;
    await group.task('Compiling', (handle) => {
      receivedHandle = handle;
      return Promise.resolve();
    });
    expect(receivedHandle).toBeDefined();
    expect(receivedHandle?.update).toBeTypeOf('function');
    expect(receivedHandle?.succeed).toBeTypeOf('function');
    expect(receivedHandle?.fail).toBeTypeOf('function');
  });
});
