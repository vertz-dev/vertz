/**
 * Type-level tests for auth context API.
 * Verifies generic flow from AuthContextValue → useAuth() → form().
 */
import type { Result } from '@vertz/fetch';
import type { AuthContextValue, useAuth } from '../auth-context';
import type { AuthResponse } from '../auth-types';

// --- useAuth() return type checks ---

declare const auth: ReturnType<typeof useAuth>;

// Positive: signIn accepts valid input
const _signInResult: PromiseLike<Result<AuthResponse, Error>> = auth.signIn({
  email: 'a@b.com',
  password: 'pass',
});

// @ts-expect-error — signIn requires email and password
auth.signIn({});

// @ts-expect-error — signIn requires password
auth.signIn({ email: 'a@b.com' });

// Positive: signUp accepts valid input
const _signUpResult: PromiseLike<Result<AuthResponse, Error>> = auth.signUp({
  email: 'a@b.com',
  password: 'pass',
});

// @ts-expect-error — signUp requires email and password
auth.signUp({});

// Positive: signOut takes no args
const _signOutResult: Promise<void> = auth.signOut();

// @ts-expect-error — signOut takes no arguments
auth.signOut('arg');

// Positive: mfaChallenge accepts valid input
const _mfaResult: PromiseLike<Result<AuthResponse, Error>> = auth.mfaChallenge({ code: '123456' });

// @ts-expect-error — mfaChallenge requires code
auth.mfaChallenge({});

// Positive: forgotPassword accepts valid input
const _forgotResult: PromiseLike<Result<void, Error>> = auth.forgotPassword({ email: 'a@b.com' });

// @ts-expect-error — forgotPassword requires email
auth.forgotPassword({});

// Positive: resetPassword accepts valid input
const _resetResult: PromiseLike<Result<void, Error>> = auth.resetPassword({
  token: 'tok',
  password: 'pass',
});

// @ts-expect-error — resetPassword requires token and password
auth.resetPassword({});

// --- SdkMethodWithMeta properties ---

const _signInUrl: string = auth.signIn.url;
const _signInMethod: string = auth.signIn.method;

const _signUpUrl: string = auth.signUp.url;
const _mfaUrl: string = auth.mfaChallenge.url;
const _forgotUrl: string = auth.forgotPassword.url;
const _resetUrl: string = auth.resetPassword.url;

// --- Signal property types (auto-unwrapped by compiler) ---

// These would be Signal<T> in AuthContextValue but unwrapped via UnwrapSignals
declare const ctxValue: AuthContextValue;
// AuthContextValue has Signal<User | null>
const _user: import('../auth-types').User | null = ctxValue.user.value;

// Suppress unused variable warnings
void _signInResult;
void _signUpResult;
void _signOutResult;
void _mfaResult;
void _forgotResult;
void _resetResult;
void _signInUrl;
void _signInMethod;
void _signUpUrl;
void _mfaUrl;
void _forgotUrl;
void _resetUrl;
void _user;
