import { s } from '@vertz/schema';

export interface StepProgressEvent {
  readonly step: string;
  readonly type: 'step-started' | 'step-completed' | 'step-failed';
  readonly timestamp: number;
  readonly iterations?: number;
  readonly response?: string;
}

const stepProgressSchema = s.object({
  step: s.string(),
  type: s.enum(['step-started', 'step-completed', 'step-failed']),
  timestamp: s.number(),
  iterations: s.number().optional(),
  response: s.string().optional(),
});

export interface WorkflowStream {
  subscribe(listener: (event: StepProgressEvent) => void): () => void;
  close(): void;
}

/**
 * Create a typed SSE client for a workflow run.
 * Uses EventSource for auto-reconnection. Validates incoming events.
 */
export function createWorkflowStream(runId: string, baseUrl = ''): WorkflowStream {
  const listeners = new Set<(event: StepProgressEvent) => void>();
  const es = new EventSource(`${baseUrl}/api/workflows/${encodeURIComponent(runId)}/stream`);

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      const result = stepProgressSchema.parse(parsed);
      if (!result.ok) {
        console.warn('[sse-client] Invalid event payload, discarding:', result.error);
        return;
      }
      const validated = result.data as StepProgressEvent;
      for (const fn of listeners) fn(validated);
    } catch (err) {
      console.warn('[sse-client] Failed to parse SSE event:', err);
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      es.close();
      listeners.clear();
    },
  };
}
