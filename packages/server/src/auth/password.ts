/**
 * Password utilities — hashing, verification, and validation
 */

import type { AuthValidationError } from '@vertz/errors';
import { createAuthValidationError } from '@vertz/errors';
import bcrypt from 'bcryptjs';
import type { PasswordRequirements } from './types';

const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: false,
  requireNumbers: false,
  requireSymbols: false,
};

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validatePassword(
  password: string,
  requirements?: PasswordRequirements,
): AuthValidationError | null {
  const req = { ...DEFAULT_PASSWORD_REQUIREMENTS, ...requirements };

  if (password.length < (req.minLength ?? 8)) {
    return createAuthValidationError(
      `Password must be at least ${req.minLength} characters`,
      'password',
      'TOO_SHORT',
    );
  }

  if (req.requireUppercase && !/[A-Z]/.test(password)) {
    return createAuthValidationError(
      'Password must contain at least one uppercase letter',
      'password',
      'NO_UPPERCASE',
    );
  }

  if (req.requireNumbers && !/\d/.test(password)) {
    return createAuthValidationError(
      'Password must contain at least one number',
      'password',
      'NO_NUMBER',
    );
  }

  if (req.requireSymbols && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return createAuthValidationError(
      'Password must contain at least one symbol',
      'password',
      'NO_SYMBOL',
    );
  }

  return null;
}
