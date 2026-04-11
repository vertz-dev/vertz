import { describe, expect, it } from '@vertz/test';
import type { StepProgressEvent } from '@vertz/agents';
import { createProgressEmitter } from '../../lib/progress-emitter';
import { createInMemoryWorkflowStore } from './workflow-store';
import { handleWorkflowStream } from './workflow-stream';

function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms = 5000,
): Promise<Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>> {
  return Promise.race([
    reader.read(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Stream read timeout')), ms),
    ),
  ]);
}

describe('handleWorkflowStream()', () => {
  const makeEvent = (step: string, type: StepProgressEvent['type']): StepProgressEvent => ({
    step,
    type,
    timestamp: Date.now(),
  });

  it('returns 404 for unknown run', () => {
    const store = createInMemoryWorkflowStore();
    const emitter = createProgressEmitter();
    const response = handleWorkflowStream('nonexistent', store, emitter);
    expect(response.status).toBe(404);
  });

  it('returns text/event-stream content type', async () => {
    const store = createInMemoryWorkflowStore();
    const emitter = createProgressEmitter();
    const run = store.create({ issueNumber: 1, repo: 'test/repo' });

    const response = handleWorkflowStream(run.id, store, emitter);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');

    // Clean up the stream to avoid leaking the heartbeat interval
    await response.body?.cancel();
  });

  it('sends snapshot of past events on connect', async () => {
    const store = createInMemoryWorkflowStore();
    const emitter = createProgressEmitter();
    const run = store.create({ issueNumber: 1, repo: 'test/repo' });

    // Emit events before connecting
    emitter.emit(run.id, makeEvent('plan', 'step-started'));
    emitter.emit(run.id, makeEvent('plan', 'step-completed'));

    const response = handleWorkflowStream(run.id, store, emitter);
    const reader = response.body!.getReader();

    // Read chunks until we have both events
    let allText = '';
    for (let i = 0; i < 3; i++) {
      const { value, done } = await readWithTimeout(reader);
      if (done) break;
      allText += new TextDecoder().decode(value);
      if (allText.includes('step-completed')) break;
    }

    expect(allText).toContain('"type":"step-started"');
    expect(allText).toContain('"type":"step-completed"');

    await reader.cancel();
  });

  it('streams new events after connect', async () => {
    const store = createInMemoryWorkflowStore();
    const emitter = createProgressEmitter();
    const run = store.create({ issueNumber: 1, repo: 'test/repo' });

    const response = handleWorkflowStream(run.id, store, emitter);
    const reader = response.body!.getReader();

    // Emit an event after connecting
    emitter.emit(run.id, makeEvent('implement', 'step-started'));

    // Read with timeout to prevent hang
    const { value } = await readWithTimeout(reader);
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"step":"implement"');
    expect(text).toContain('"type":"step-started"');

    await reader.cancel();
  });
});
