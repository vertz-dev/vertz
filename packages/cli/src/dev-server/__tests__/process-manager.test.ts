import { describe, expect, it, mock } from '@vertz/test';
import { EventEmitter } from 'node:events';
import type { SpawnFn } from '../process-manager';
import { createProcessManager } from '../process-manager';

function createMockChild() {
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  return {
    emitter,
    stdout,
    stderr,
    child: Object.assign(emitter, {
      stdout,
      stderr,
      pid: 123,
      killed: false,
      kill: mock((signal?: string) => {
        emitter.emit('exit', signal === 'SIGKILL' ? 137 : 0, signal);
        return true;
      }),
    }),
  };
}

describe('createProcessManager', () => {
  it('returns a process manager instance', () => {
    const pm = createProcessManager();
    expect(pm).toBeDefined();
    expect(typeof pm.start).toBe('function');
    expect(typeof pm.stop).toBe('function');
    expect(typeof pm.restart).toBe('function');
    expect(typeof pm.isRunning).toBe('function');
  });

  it('isRunning returns false before start', () => {
    const pm = createProcessManager();
    expect(pm.isRunning()).toBe(false);
  });

  it('isRunning returns true after start', () => {
    const mc = createMockChild();
    // Prevent the exit event from setting child to undefined immediately
    mc.child.kill = mock(() => true);
    const spawnFn: SpawnFn = mock(() => mc.child as never);
    const pm = createProcessManager(spawnFn);

    pm.start('app.ts');
    expect(pm.isRunning()).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith('app.ts', undefined);
  });

  it('isRunning returns false after process exits', () => {
    const mc = createMockChild();
    mc.child.kill = mock(() => true);
    const spawnFn: SpawnFn = mock(() => mc.child as never);
    const pm = createProcessManager(spawnFn);

    pm.start('app.ts');
    expect(pm.isRunning()).toBe(true);

    mc.emitter.emit('exit', 0, null);
    expect(pm.isRunning()).toBe(false);
  });

  it('stop terminates the child process with SIGTERM', async () => {
    const mc = createMockChild();
    const spawnFn: SpawnFn = mock(() => mc.child as never);
    const pm = createProcessManager(spawnFn);

    pm.start('app.ts');
    await pm.stop();

    expect(mc.child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(pm.isRunning()).toBe(false);
  });

  it('restart stops then starts the process', async () => {
    const mock1 = createMockChild();
    const mock2 = createMockChild();
    mock2.child.kill = mock(() => true);
    let callCount = 0;
    const spawnFn: SpawnFn = mock(() => {
      callCount++;
      return (callCount === 1 ? mock1.child : mock2.child) as never;
    });
    const pm = createProcessManager(spawnFn);

    pm.start('app.ts');
    await pm.restart('app.ts');

    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(pm.isRunning()).toBe(true);
  });

  it('onOutput receives stdout data from child', () => {
    const mc = createMockChild();
    mc.child.kill = mock(() => true);
    const spawnFn: SpawnFn = mock(() => mc.child as never);
    const pm = createProcessManager(spawnFn);
    const outputHandler = mock();

    pm.onOutput(outputHandler);
    pm.start('app.ts');

    mc.stdout.emit('data', Buffer.from('hello'));
    expect(outputHandler).toHaveBeenCalledWith('hello');
  });

  it('onError receives stderr data from child', () => {
    const mc = createMockChild();
    mc.child.kill = mock(() => true);
    const spawnFn: SpawnFn = mock(() => mc.child as never);
    const pm = createProcessManager(spawnFn);
    const errorHandler = mock();

    pm.onError(errorHandler);
    pm.start('app.ts');

    mc.stderr.emit('data', Buffer.from('error!'));
    expect(errorHandler).toHaveBeenCalledWith('error!');
  });

  it('start passes env to spawn function', () => {
    const mc = createMockChild();
    mc.child.kill = mock(() => true);
    const spawnFn: SpawnFn = mock(() => mc.child as never);
    const pm = createProcessManager(spawnFn);

    pm.start('app.ts', { NODE_ENV: 'development' });
    expect(spawnFn).toHaveBeenCalledWith('app.ts', { NODE_ENV: 'development' });
  });

  it('starting when already running stops existing process first', () => {
    const mock1 = createMockChild();
    const mock2 = createMockChild();
    mock2.child.kill = mock(() => true);
    let callCount = 0;
    const spawnFn: SpawnFn = mock(() => {
      callCount++;
      return (callCount === 1 ? mock1.child : mock2.child) as never;
    });
    const pm = createProcessManager(spawnFn);

    pm.start('app.ts');
    pm.start('app.ts');

    expect(mock1.child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(pm.isRunning()).toBe(true);
  });
});
