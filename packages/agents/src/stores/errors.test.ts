import { describe, expect, it } from '@vertz/test';
import { SessionAccessDeniedError, SessionNotFoundError } from './errors';

describe('SessionNotFoundError', () => {
  describe('Given a session ID', () => {
    describe('When instantiated', () => {
      it('Then has the correct message and code', () => {
        const error = new SessionNotFoundError('sess_abc');
        expect(error.message).toBe('Session not found or access denied: sess_abc');
        expect(error.code).toBe('SESSION_NOT_FOUND');
        expect(error.name).toBe('SessionNotFoundError');
        expect(error).toBeInstanceOf(Error);
      });
    });
  });
});

describe('SessionAccessDeniedError', () => {
  describe('Given a session ID', () => {
    describe('When instantiated', () => {
      it('Then has the same message format as SessionNotFoundError to prevent enumeration', () => {
        const error = new SessionAccessDeniedError('sess_abc');
        expect(error.message).toBe('Session not found or access denied: sess_abc');
        expect(error.code).toBe('SESSION_ACCESS_DENIED');
        expect(error.name).toBe('SessionAccessDeniedError');
        expect(error).toBeInstanceOf(Error);
      });
    });
  });
});
