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
