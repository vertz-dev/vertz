import { describe, expect, it } from 'bun:test';
import {
  forgotPasswordSchema,
  mfaSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '../auth-types';

describe('signInSchema', () => {
  it('accepts valid email and password', () => {
    const result = signInSchema.parse({ email: 'a@b.com', password: 'secret' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ email: 'a@b.com', password: 'secret' });
    }
  });

  it('rejects missing email', () => {
    const result = signInSchema.parse({ password: 'secret' });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = signInSchema.parse({ email: 'not-an-email', password: 'secret' });
    expect(result.ok).toBe(false);
  });

  it('rejects missing password', () => {
    const result = signInSchema.parse({ email: 'a@b.com' });
    expect(result.ok).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('accepts valid email and password >= 8 chars', () => {
    const result = signUpSchema.parse({ email: 'a@b.com', password: '12345678' });
    expect(result.ok).toBe(true);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = signUpSchema.parse({ email: 'a@b.com', password: '1234567' });
    expect(result.ok).toBe(false);
  });

  it('passes through extra fields', () => {
    const result = signUpSchema.parse({ email: 'a@b.com', password: '12345678', name: 'Test' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('Test');
    }
  });
});

describe('mfaSchema', () => {
  it('accepts a 6-digit code', () => {
    const result = mfaSchema.parse({ code: '123456' });
    expect(result.ok).toBe(true);
  });

  it('rejects code shorter than 6 digits', () => {
    const result = mfaSchema.parse({ code: '12345' });
    expect(result.ok).toBe(false);
  });

  it('rejects code longer than 6 digits', () => {
    const result = mfaSchema.parse({ code: '1234567' });
    expect(result.ok).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    const result = forgotPasswordSchema.parse({ email: 'a@b.com' });
    expect(result.ok).toBe(true);
  });

  it('rejects missing email', () => {
    const result = forgotPasswordSchema.parse({});
    expect(result.ok).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts valid token and password', () => {
    const result = resetPasswordSchema.parse({ token: 'abc', password: '12345678' });
    expect(result.ok).toBe(true);
  });

  it('rejects missing token', () => {
    const result = resetPasswordSchema.parse({ password: '12345678' });
    expect(result.ok).toBe(false);
  });

  it('rejects short password', () => {
    const result = resetPasswordSchema.parse({ token: 'abc', password: '1234567' });
    expect(result.ok).toBe(false);
  });
});
