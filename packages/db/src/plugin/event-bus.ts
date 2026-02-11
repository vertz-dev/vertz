/**
 * Mutation event emitted by the event bus.
 */
export interface MutationEvent {
  type: 'create' | 'update' | 'delete';
  table: string;
  data: unknown;
}

export type EventHandler = (event: MutationEvent) => void;

export interface EventBus {
  emit(event: MutationEvent): void;
  on(handler: EventHandler): void;
  off(handler: EventHandler): void;
}

/**
 * Create a synchronous event bus for mutation events.
 */
export function createEventBus(): EventBus {
  const handlers = new Set<EventHandler>();

  return {
    emit(event: MutationEvent): void {
      for (const handler of handlers) {
        handler(event);
      }
    },
    on(handler: EventHandler): void {
      handlers.add(handler);
    },
    off(handler: EventHandler): void {
      handlers.delete(handler);
    },
  };
}
