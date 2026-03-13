import type { FormSchema } from '../form/validation';

// --- Client-side user (subset of server AuthUser) ---

export interface User {
  id: string;
  email: string;
  role: string;
  emailVerified?: boolean;
  [key: string]: unknown;
}

// --- Auth status state machine ---

export type AuthStatus =
  | 'idle'
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'mfa_required'
  | 'error';

// --- Error types ---

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_EXISTS'
  | 'USER_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'MFA_REQUIRED'
  | 'INVALID_MFA_CODE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR';

export interface AuthClientError {
  code: AuthErrorCode;
  message: string;
  statusCode: number;
  retryAfter?: number;
}

// --- Input types ---

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  [key: string]: unknown;
}

export interface MfaInput {
  code: string;
}

export interface ForgotInput {
  email: string;
}

export interface ResetInput {
  token: string;
  password: string;
}

// --- SignOut options ---

export interface SignOutOptions {
  /** Path to navigate to after sign-out completes. Uses SPA navigation (replace). */
  redirectTo?: string;
}

// --- Response types ---

export interface AuthResponse {
  user: User;
  expiresAt: number;
}

// --- Validation schemas ---

export const signInSchema: FormSchema<SignInInput> = {
  parse(data: unknown) {
    const d = data as Record<string, unknown>;
    const errors: { path: (string | number)[]; message: string }[] = [];
    if (!d.email || typeof d.email !== 'string' || !d.email.includes('@')) {
      errors.push({ path: ['email'], message: 'Valid email is required' });
    }
    if (!d.password || typeof d.password !== 'string') {
      errors.push({ path: ['password'], message: 'Password is required' });
    }
    if (errors.length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { issues: typeof errors }).issues = errors;
      return { ok: false, error: err };
    }
    return { ok: true, data: { email: d.email as string, password: d.password as string } };
  },
};

export const signUpSchema: FormSchema<SignUpInput> = {
  parse(data: unknown) {
    const d = data as Record<string, unknown>;
    const errors: { path: (string | number)[]; message: string }[] = [];
    if (!d.email || typeof d.email !== 'string' || !d.email.includes('@')) {
      errors.push({ path: ['email'], message: 'Valid email is required' });
    }
    if (!d.password || typeof d.password !== 'string' || (d.password as string).length < 8) {
      errors.push({ path: ['password'], message: 'Password must be at least 8 characters' });
    }
    if (errors.length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { issues: typeof errors }).issues = errors;
      return { ok: false, error: err };
    }
    const { email, password, ...rest } = d;
    return {
      ok: true,
      data: { email: email as string, password: password as string, ...rest },
    };
  },
};

export const mfaSchema: FormSchema<MfaInput> = {
  parse(data: unknown) {
    const d = data as Record<string, unknown>;
    if (!d.code || typeof d.code !== 'string' || (d.code as string).length !== 6) {
      const err = new Error('Validation failed');
      (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
        { path: ['code'], message: 'Enter a 6-digit code' },
      ];
      return { ok: false, error: err };
    }
    return { ok: true, data: { code: d.code as string } };
  },
};

export const forgotPasswordSchema: FormSchema<ForgotInput> = {
  parse(data: unknown) {
    const d = data as Record<string, unknown>;
    if (!d.email || typeof d.email !== 'string' || !d.email.includes('@')) {
      const err = new Error('Validation failed');
      (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
        { path: ['email'], message: 'Valid email is required' },
      ];
      return { ok: false, error: err };
    }
    return { ok: true, data: { email: d.email as string } };
  },
};

export const resetPasswordSchema: FormSchema<ResetInput> = {
  parse(data: unknown) {
    const d = data as Record<string, unknown>;
    const errors: { path: (string | number)[]; message: string }[] = [];
    if (!d.token || typeof d.token !== 'string') {
      errors.push({ path: ['token'], message: 'Token is required' });
    }
    if (!d.password || typeof d.password !== 'string' || (d.password as string).length < 8) {
      errors.push({ path: ['password'], message: 'Password must be at least 8 characters' });
    }
    if (errors.length > 0) {
      const err = new Error('Validation failed');
      (err as Error & { issues: typeof errors }).issues = errors;
      return { ok: false, error: err };
    }
    return {
      ok: true,
      data: { token: d.token as string, password: d.password as string },
    };
  },
};
