/**
 * Type-level tests for queryMatch().
 *
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { QueryResult } from '../query';
import { queryMatch } from '../query-match';

// ─── Error handler receives typed E ─────────────────────────────

interface AppError {
  code: string;
  message: string;
}

declare const typedResult: QueryResult<string, AppError>;

queryMatch(typedResult, {
  loading: () => null,
  error: (err) => {
    // err should be AppError
    const _code: string = err.code;
    const _msg: string = err.message;
    void _code;
    void _msg;
    return null;
  },
  data: () => null,
});

// ─── Data handler receives typed T ──────────────────────────────

interface User {
  id: number;
  name: string;
}

declare const userResult: QueryResult<User>;

queryMatch(userResult, {
  loading: () => null,
  error: () => null,
  data: (user) => {
    // user should be User
    const _id: number = user.id;
    const _name: string = user.name;
    void _id;
    void _name;
    return null;
  },
});

// ─── Return type is union of handler return types ───────────────

declare const qr: QueryResult<string, Error>;

const result = queryMatch(qr, {
  loading: () => 'loading' as const,
  error: () => 42,
  data: () => true,
});

// Return type should be 'loading' | number | boolean
const _check: 'loading' | number | boolean = result;
void _check;

// @ts-expect-error - return type is not just string
const _wrong: string = result;
void _wrong;
