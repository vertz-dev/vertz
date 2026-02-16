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
export declare function createEventBus(): EventBus;
//# sourceMappingURL=event-bus.d.ts.map
