import { afterEach, describe, expect, it } from 'bun:test';
import type { StepProgressEvent, WorkflowStream } from './sse-client';

// Mock EventSource for testing
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  // Test helper: simulate incoming message
  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }
}

// Install mock before importing the module
(globalThis as Record<string, unknown>).EventSource = MockEventSource;

// Dynamic import so the mock is in place when the module loads
const { createWorkflowStream } = await import('./sse-client');

afterEach(() => {
  MockEventSource.instances = [];
});

describe('createWorkflowStream()', () => {
  it('creates EventSource with correct URL', () => {
    const stream = createWorkflowStream('wf-1');
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/workflows/wf-1/stream');
    stream.close();
  });

  it('validates and delivers valid events to subscribers', () => {
    const stream = createWorkflowStream('wf-1');
    const events: StepProgressEvent[] = [];
    stream.subscribe((e) => events.push(e));

    const es = MockEventSource.instances[0];
    es.simulateMessage(JSON.stringify({
      step: 'plan',
      type: 'step-started',
      timestamp: 1000,
    }));

    expect(events).toHaveLength(1);
    expect(events[0].step).toBe('plan');
    expect(events[0].type).toBe('step-started');
    stream.close();
  });

  it('discards invalid payloads', () => {
    const stream = createWorkflowStream('wf-1');
    const events: StepProgressEvent[] = [];
    stream.subscribe((e) => events.push(e));

    const es = MockEventSource.instances[0];
    // Invalid type field
    es.simulateMessage(JSON.stringify({
      step: 'plan',
      type: 'invalid-type',
      timestamp: 1000,
    }));
    // Not JSON
    es.simulateMessage('not json');

    expect(events).toHaveLength(0);
    stream.close();
  });

  it('returns unsubscribe function', () => {
    const stream = createWorkflowStream('wf-1');
    const events: StepProgressEvent[] = [];
    const unsub = stream.subscribe((e) => events.push(e));

    const es = MockEventSource.instances[0];
    es.simulateMessage(JSON.stringify({
      step: 'plan',
      type: 'step-started',
      timestamp: 1000,
    }));

    unsub();

    es.simulateMessage(JSON.stringify({
      step: 'plan',
      type: 'step-completed',
      timestamp: 2000,
    }));

    expect(events).toHaveLength(1);
    stream.close();
  });

  it('close() disconnects the EventSource', () => {
    const stream = createWorkflowStream('wf-1');
    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    stream.close();
    expect(es.closed).toBe(true);
  });

  it('encodes run ID in URL', () => {
    const stream = createWorkflowStream('wf with spaces');
    expect(MockEventSource.instances[0].url).toBe('/api/workflows/wf%20with%20spaces/stream');
    stream.close();
  });
});
