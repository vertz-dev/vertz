import { describe, expect, it } from 'bun:test';
import type { StepProgressEvent } from '@vertz/agents';
import { createProgressEmitter } from './progress-emitter';

describe('createProgressEmitter()', () => {
  const makeEvent = (step: string, type: StepProgressEvent['type']): StepProgressEvent => ({
    step,
    type,
    timestamp: Date.now(),
  });

  it('stores emitted events and returns them via snapshot()', () => {
    const emitter = createProgressEmitter();
    const event = makeEvent('plan', 'step-started');
    emitter.emit('wf-1', event);

    const snap = emitter.snapshot('wf-1');
    expect(snap).toHaveLength(1);
    expect(snap[0]).toBe(event);
  });

  it('notifies subscribers when events are emitted', () => {
    const emitter = createProgressEmitter();
    const received: StepProgressEvent[] = [];
    emitter.subscribe('wf-1', (e) => received.push(e));

    const event = makeEvent('plan', 'step-completed');
    emitter.emit('wf-1', event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('returns unsubscribe function that stops notifications', () => {
    const emitter = createProgressEmitter();
    const received: StepProgressEvent[] = [];
    const unsub = emitter.subscribe('wf-1', (e) => received.push(e));

    emitter.emit('wf-1', makeEvent('plan', 'step-started'));
    unsub();
    emitter.emit('wf-1', makeEvent('plan', 'step-completed'));

    expect(received).toHaveLength(1);
  });

  it('returns empty snapshot for unknown run', () => {
    const emitter = createProgressEmitter();
    expect(emitter.snapshot('nonexistent')).toHaveLength(0);
  });

  it('supports multiple subscribers for the same run', () => {
    const emitter = createProgressEmitter();
    const received1: StepProgressEvent[] = [];
    const received2: StepProgressEvent[] = [];
    emitter.subscribe('wf-1', (e) => received1.push(e));
    emitter.subscribe('wf-1', (e) => received2.push(e));

    emitter.emit('wf-1', makeEvent('plan', 'step-started'));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('does not cross-notify subscribers of different runs', () => {
    const emitter = createProgressEmitter();
    const received: StepProgressEvent[] = [];
    emitter.subscribe('wf-1', (e) => received.push(e));

    emitter.emit('wf-2', makeEvent('plan', 'step-started'));

    expect(received).toHaveLength(0);
  });

  it('cleanup() removes events for a run', () => {
    const emitter = createProgressEmitter();
    emitter.emit('wf-1', makeEvent('plan', 'step-started'));
    emitter.emit('wf-1', makeEvent('plan', 'step-completed'));

    emitter.cleanup('wf-1');

    expect(emitter.snapshot('wf-1')).toHaveLength(0);
  });
});
