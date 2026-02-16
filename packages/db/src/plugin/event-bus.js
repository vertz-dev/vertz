/**
 * Create a synchronous event bus for mutation events.
 */
export function createEventBus() {
  const handlers = new Set();
  return {
    emit(event) {
      for (const handler of handlers) {
        handler(event);
      }
    },
    on(handler) {
      handlers.add(handler);
    },
    off(handler) {
      handlers.delete(handler);
    },
  };
}
//# sourceMappingURL=event-bus.js.map
