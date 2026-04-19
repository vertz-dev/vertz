/** Thrown when a session ID does not exist in the store or the caller lacks access. */
export class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND' as const;

  constructor(sessionId: string) {
    super(`Session not found or access denied: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

/** Thrown when the caller does not own the session. Uses the same message as SessionNotFoundError to prevent ID enumeration. */
export class SessionAccessDeniedError extends Error {
  readonly code = 'SESSION_ACCESS_DENIED' as const;

  constructor(sessionId: string) {
    super(`Session not found or access denied: ${sessionId}`);
    this.name = 'SessionAccessDeniedError';
  }
}

/**
 * Thrown when `memoryStore()` is combined with a `sessionId` on `run()`.
 *
 * The memory store keeps state in-process and cannot provide the durable
 * step-by-step writes that sessionId-based resume requires. Callers who
 * want persistence must use `sqliteStore(...)` or `d1Store(...)`; callers
 * who don't need persistence should omit `sessionId` and run statelessly.
 */
export class MemoryStoreNotDurableError extends Error {
  readonly code = 'MEMORY_STORE_NOT_DURABLE' as const;

  constructor() {
    super(
      'memoryStore() cannot provide durable resume. ' +
        'Pass sessionId with a durable store (sqliteStore, d1Store) ' +
        'or omit sessionId to run statelessly.',
    );
    this.name = 'MemoryStoreNotDurableError';
  }
}
