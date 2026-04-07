import type { StepProgressEvent } from '@vertz/agents';

export interface ProgressEmitter {
  /** Register a listener for a specific run. Returns unsubscribe function. */
  subscribe(runId: string, listener: (event: StepProgressEvent) => void): () => void;
  /** Emit a progress event to all subscribers of a run. */
  emit(runId: string, event: StepProgressEvent): void;
  /** Get all events for a run (for snapshot-on-connect). */
  snapshot(runId: string): readonly StepProgressEvent[];
  /** Clean up events for a completed/failed run. */
  cleanup(runId: string): void;
}

export function createProgressEmitter(): ProgressEmitter {
  const events = new Map<string, StepProgressEvent[]>();
  const listeners = new Map<string, Set<(event: StepProgressEvent) => void>>();

  return {
    subscribe(runId, listener) {
      let set = listeners.get(runId);
      if (!set) {
        set = new Set();
        listeners.set(runId, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
        if (set!.size === 0) listeners.delete(runId);
      };
    },

    emit(runId, event) {
      let list = events.get(runId);
      if (!list) {
        list = [];
        events.set(runId, list);
      }
      list.push(event);

      const set = listeners.get(runId);
      if (set) {
        for (const fn of set) fn(event);
      }
    },

    snapshot(runId) {
      return events.get(runId) ?? [];
    },

    cleanup(runId) {
      events.delete(runId);
      listeners.delete(runId);
    },
  };
}
