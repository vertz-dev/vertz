import { describe, expect, it } from '@vertz/test';
import { validateErrorCode } from '../types.js';

describe('validateErrorCode', () => {
  describe('Given a known DesktopErrorCode', () => {
    it.each([
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'IO_ERROR',
      'INVALID_PATH',
      'TIMEOUT',
      'METHOD_NOT_FOUND',
      'WINDOW_CLOSED',
      'EXECUTION_FAILED',
    ] as const)('Then returns "%s" as-is', (code) => {
      expect(validateErrorCode(code)).toBe(code);
    });
  });

  describe('Given an unknown error code', () => {
    it('Then falls back to IO_ERROR', () => {
      expect(validateErrorCode('SOMETHING_UNEXPECTED')).toBe('IO_ERROR');
    });

    it('Then falls back to IO_ERROR for empty string', () => {
      expect(validateErrorCode('')).toBe('IO_ERROR');
    });
  });
});
