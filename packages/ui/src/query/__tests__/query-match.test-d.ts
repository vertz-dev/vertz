/**
 * Type-level tests for queryMatch().
 *
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { DisposeFn } from '../../runtime/signal-types';
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

// ─── Data handler receives typed T (no revalidating param) ──────

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

// ─── Return type is HTMLElement & { dispose: DisposeFn } ─────────

declare const qr: QueryResult<string, Error>;

const result = queryMatch(qr, {
  loading: () => null,
  error: () => null,
  data: () => null,
});

// Return type should be HTMLElement & { dispose: DisposeFn }
const _checkElement: HTMLElement = result;
const _checkDispose: DisposeFn = result.dispose;
void _checkElement;
void _checkDispose;

// @ts-expect-error - return type is not string
const _wrong: string = result;
void _wrong;

// ─── Handlers must return Node | null ────────────────────────────

queryMatch(qr, {
  // @ts-expect-error - loading handler cannot return string
  loading: () => 'not a node',
  error: () => null,
  data: () => null,
});

queryMatch(qr, {
  loading: () => null,
  error: () => null,
  // @ts-expect-error - data handler cannot return number
  data: () => 42,
});
