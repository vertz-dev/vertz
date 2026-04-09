import { describe, expect, it } from '@vertz/test';
import {
  createMfaAlreadyEnabledError,
  createMfaInvalidCodeError,
  createMfaNotEnabledError,
  createMfaRequiredError,
  isMfaAlreadyEnabledError,
  isMfaInvalidCodeError,
  isMfaNotEnabledError,
  isMfaRequiredError,
} from '../auth';

describe('MFA error types', () => {
  it('createMfaRequiredError creates error with correct code', () => {
    const error = createMfaRequiredError('MFA verification required');
    expect(error.code).toBe('MFA_REQUIRED');
    expect(error.message).toBe('MFA verification required');
  });

  it('isMfaRequiredError returns true/false correctly', () => {
    const mfaError = createMfaRequiredError();
    const otherError = { code: 'INVALID_CREDENTIALS', message: 'wrong' };
    expect(isMfaRequiredError(mfaError)).toBe(true);
    expect(isMfaRequiredError(otherError)).toBe(false);
  });

  it('createMfaInvalidCodeError creates error with attemptsRemaining', () => {
    const error = createMfaInvalidCodeError('Invalid code', 3);
    expect(error.code).toBe('MFA_INVALID_CODE');
    expect(error.message).toBe('Invalid code');
    expect(error.attemptsRemaining).toBe(3);
  });

  it('isMfaInvalidCodeError returns true/false correctly', () => {
    const mfaError = createMfaInvalidCodeError('Invalid code');
    const otherError = { code: 'INVALID_CREDENTIALS', message: 'wrong' };
    expect(isMfaInvalidCodeError(mfaError)).toBe(true);
    expect(isMfaInvalidCodeError(otherError)).toBe(false);
  });

  it('createMfaAlreadyEnabledError creates error with correct code', () => {
    const error = createMfaAlreadyEnabledError();
    expect(error.code).toBe('MFA_ALREADY_ENABLED');
    expect(error.message).toBe('MFA is already enabled');
  });

  it('isMfaAlreadyEnabledError returns true/false correctly', () => {
    const mfaError = createMfaAlreadyEnabledError();
    const otherError = { code: 'MFA_REQUIRED', message: 'wrong' };
    expect(isMfaAlreadyEnabledError(mfaError)).toBe(true);
    expect(isMfaAlreadyEnabledError(otherError)).toBe(false);
  });

  it('createMfaNotEnabledError creates error with correct code', () => {
    const error = createMfaNotEnabledError();
    expect(error.code).toBe('MFA_NOT_ENABLED');
    expect(error.message).toBe('MFA is not enabled');
  });

  it('isMfaNotEnabledError returns true/false correctly', () => {
    const mfaError = createMfaNotEnabledError();
    const otherError = { code: 'MFA_REQUIRED', message: 'wrong' };
    expect(isMfaNotEnabledError(mfaError)).toBe(true);
    expect(isMfaNotEnabledError(otherError)).toBe(false);
  });
});
