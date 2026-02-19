# Result Types Audit

This document provides an exhaustive comparison of Result types across the @vertz packages.

---

## @vertz/errors Result

### Exact Type Definition

```typescript
// From /packages/errors/src/result.ts

export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = unknown> = Ok<T> | Err<E>;
```

### Field Names

**Ok case:**
- `ok: true` (boolean literal)
- `data: T` (the success value)

**Err case:**
- `ok: false` (boolean literal)
- `error: E` (the error value)

### Constructor Functions

```typescript
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
```

### All Methods

```typescript
// Unwrap functions
export function unwrap<T, E>(result: Result<T, E>): T;
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T;

// Transformation
export function map<T, E, U>(result: Result<T, E>, fn: (data: T) => U): Result<U, E>;
export function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, F>,
): Result<U, E | F>;
export function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Promise<Result<U, F>>,
): Promise<Result<U, E | F>>;

// Pattern matching
export function match<T, E, OkR, ErrR>(
  result: Result<T, E>,
  handlers: { ok: (data: T) => OkR; err: (error: E) => ErrR },
): OkR | ErrR;

// Exhaustive pattern matching (errors discriminated by 'code')
export function matchErr<T, E extends { readonly code: string }, R>(
  result: Result<T, E>,
  handlers: { ok: (data: T) => R } & ErrorHandlers<E, R>,
): R;

// Type guards
export function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
export function isErr<T, E>(result: Result<T, E>): result is Err<E>;
```

### AppError Class

```typescript
// From /packages/errors/src/app-error.ts

export class AppError<C extends string = string> extends Error {
  readonly code: C;

  constructor(code: C, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
    };
  }
}
```

**Properties:**
- `code: C` - string literal error code for discrimination
- `message: string` - human-readable message (from Error)
- `name: string` - always 'AppError'

**Methods:**
- `toJSON()` - returns `{ code, message }` (can be overridden in subclasses)

**Example subclass:**
```typescript
class InsufficientBalanceError extends AppError<'INSUFFICIENT_BALANCE'> {
  constructor(public readonly required: number, public readonly available: number) {
    super('INSUFFICIENT_BALANCE', `Need ${required}, have ${available}`);
  }

  toJSON() {
    return { ...super.toJSON(), required: this.required, available: this.available };
  }
}
```

---

## @vertz/core Result

### Exact Type Definition

```typescript
// From /packages/core/src/result.ts

const RESULT_BRAND: unique symbol = Symbol.for('vertz.result');

export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
  readonly [RESULT_BRAND]: true;
}

export interface Err<E> {
  readonly ok: false;
  readonly status: number;
  readonly body: E;
  readonly [RESULT_BRAND]: true;
}

export type Result<T, E = unknown> = Ok<T> | Err<E>;
```

### How It Differs from @vertz/errors Result

| Aspect | @vertz/errors | @vertz/core |
|--------|---------------|-------------|
| **Err fields** | `{ ok: false, error: E }` | `{ ok: false, status: number, body: E }` |
| **Branding** | None | Symbol brand `RESULT_BRAND` |
| **Purpose** | Generic errors-as-values | HTTP-aware errors (status + body) |
| **Use case** | Business logic layer | Route handler returns |

### Constructor Functions

```typescript
export function ok<T>(data: T): Ok<T> {
  return { ok: true, data, [RESULT_BRAND]: true };
}

export function err<E>(status: number, body: E): Err<E> {
  return { ok: false, status, body, [RESULT_BRAND]: true };
}
```

### Methods (same as @vertz/errors but reimplemented)

```typescript
export function isOk<T, E>(result: Result<T, E>): result is Ok<T>;
export function isErr<T, E>(result: Result<T, E>): result is Err<E>;
export function isResult(value: unknown): value is Result<unknown, unknown>;
```

Note: @vertz/core Result does NOT have `map`, `flatMap`, `match`, `unwrap`, `unwrapOr` - it only has type guards.

---

## @vertz/db Result Usage

### Functions That Return Result vs Throw

**Returns plain values (may return null or throw):**
```typescript
// From /packages/db/src/query/crud.ts

// Returns null if not found
export async function get<T>(queryFn, table, options?): Promise<T | null>

// Throws NotFoundError if not found
export async function getOrThrow<T>(queryFn, table, options?): Promise<T>

// Returns array (empty if none)
export async function list<T>(queryFn, table, options?): Promise<T[]>

// Returns { data, total }
export async function listAndCount<T>(queryFn, table, options?): Promise<{ data: T[]; total: number }>

// Returns created record
export async function create<T>(queryFn, table, options): Promise<T>

// Returns count
export async function createMany(queryFn, table, options): Promise<{ count: number }>

// Returns created records
export async function createManyAndReturn<T>(queryFn, table, options): Promise<T[]>

// Throws NotFoundError if not found
export async function update<T>(queryFn, table, options): Promise<T>

// Returns count
export async function updateMany(queryFn, table, options): Promise<{ count: number }>

// Returns upserted record
export async function upsert<T>(queryFn, table, options): Promise<T>

// Throws NotFoundError if not found
export async function deleteOne<T>(queryFn, table, options): Promise<T>

// Returns count
export async function deleteMany(queryFn, table, options): Promise<{ count: number }>
```

### Error Types Used

**Database errors (from @vertz/errors):**
```typescript
// From /packages/errors/src/domain/db.ts

export interface NotFoundError {
  readonly code: 'NOT_FOUND';
  readonly message: string;
  readonly table: string;
  readonly key?: Record<string, unknown>;
}

export interface UniqueViolation {
  readonly code: 'UNIQUE_VIOLATION';
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
}

export interface FKViolation {
  readonly code: 'FK_VIOLATION';
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
  readonly referencedTable?: string;
}

export interface NotNullViolation {
  readonly code: 'NOT_NULL_VIOLATION';
  readonly message: string;
  readonly table?: string;
  readonly column?: string;
}

export interface CheckViolation {
  readonly code: 'CHECK_VIOLATION';
  readonly message: string;
  readonly constraint?: string;
  readonly table?: string;
}

export type ReadError = NotFoundError;
export type WriteError = UniqueViolation | FKViolation | NotNullViolation | CheckViolation;
export type DBError = ReadError | WriteError;
```

**Additional DB-specific error types (from @vertz/db):**
```typescript
// From /packages/db/src/errors.ts

export interface DbErrorBase {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

export interface DbConnectionError extends DbErrorBase {
  readonly code: 'CONNECTION_ERROR';
}

export interface DbQueryError extends DbErrorBase {
  readonly code: 'QUERY_ERROR';
  readonly sql?: string;
}

export interface DbConstraintError extends DbErrorBase {
  readonly code: 'CONSTRAINT_ERROR';
  readonly constraint?: string;
  readonly table?: string;
  readonly column?: string;
}

export interface DbNotFoundError extends DbErrorBase {
  readonly code: 'NOT_FOUND';
  readonly table: string;
}

export type ReadError = DbConnectionError | DbQueryError | DbNotFoundError;
export type WriteError = DbConnectionError | DbQueryError | DbConstraintError;
```

### Migration Runner Specifically

**From /packages/db/src/migration/runner.ts:**

The migration runner uses `@vertz/errors` Result type:

```typescript
import { createMigrationQueryError, err, ok, type MigrationError, type Result } from '@vertz/errors';

export interface MigrationRunner {
  createHistoryTable(queryFn: MigrationQueryFn): Promise<Result<void, MigrationError>>;
  apply(
    queryFn: MigrationQueryFn,
    sql: string,
    name: string,
    options?: ApplyOptions,
  ): Promise<Result<ApplyResult, MigrationError>>;
  getApplied(queryFn: MigrationQueryFn): Promise<Result<AppliedMigration[], MigrationError>>;
  getPending(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[];
  detectDrift(files: MigrationFile[], applied: AppliedMigration[]): string[];
  detectOutOfOrder(files: MigrationFile[], applied: AppliedMigration[]): string[];
}
```

**Example usage:**
```typescript
async createHistoryTable(queryFn: MigrationQueryFn): Promise<Result<void, MigrationError>> {
  try {
    await queryFn(CREATE_HISTORY_SQL, []);
    return ok(undefined);
  } catch (cause) {
    return err(
      createMigrationQueryError('Failed to create migration history table', {
        sql: CREATE_HISTORY_SQL,
        cause,
      }),
    );
  }
}
```

---

## @vertz/server Current Patterns

### How Route Handlers Work Today

Route handlers in @vertz/server can return either:
1. Plain values (any JavaScript value)
2. `@vertz/core` Result (Ok/Err with status)
3. `Response` object (for HTML/file responses)
4. Throw exceptions

**From /packages/core/src/app/app-runner.ts:**

```typescript
const result = await entry.handler(ctx);

// Handle Result type (errors-as-values pattern)
if (isResult(result)) {
  if (isOk(result)) {
    // Ok result - extract data
    return createResponseWithCors(data, 200, config, request);
  } else {
    // Err result - use error status and body
    const errorStatus = result.status;
    const errorBody = result.body;
    return createResponseWithCors(errorBody, errorStatus, config, request);
  }
}

// If result is already a Response, return it directly
if (result instanceof Response) {
  return result;
}

// Default: wrap in JSON response
return createJsonResponse(result);
```

### Route Handler Return Patterns

**Pattern 1: Return plain value**
```typescript
handler: async (ctx) => {
  return { id: 1, name: 'John' };
}
```

**Pattern 2: Return @vertz/core Result**
```typescript
import { ok, err } from '@vertz/core';

handler: async (ctx) => {
  const user = await ctx.userService.find(ctx.params.id);
  if (!user) {
    return err(404, { message: 'User not found' });
  }
  return ok({ id: user.id, name: user.name });
}
```

**Pattern 3: Throw exceptions**
```typescript
import { NotFoundException } from '@vertz/server';

handler: async (ctx) => {
  const user = await ctx.userService.find(ctx.params.id);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return { id: user.id, name: user.name };
}
```

### Auto-Mapping Logic

**Error handling in app-runner (catch block):**

```typescript
// From /packages/core/src/app/app-runner.ts
catch (error) {
  return createErrorResponse(error);
}
```

**createErrorResponse function:**

```typescript
// From /packages/core/src/server/response-utils.ts

export function createErrorResponse(error: unknown): Response {
  if (error instanceof VertzException) {
    return createJsonResponse(error.toJSON(), error.statusCode);
  }

  return createJsonResponse(
    { error: 'InternalServerError', message: 'Internal Server Error', statusCode: 500 },
    500,
  );
}
```

**VertzException base class:**

```typescript
// From /packages/core/src/exceptions/vertz-exception.ts

export class VertzException extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? this.name;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}
```

**HTTP Exception classes:**

```typescript
// From /packages/core/src/exceptions/http-exceptions.ts

export class BadRequestException extends VertzException { /* 400 */ }
export class UnauthorizedException extends VertzException { /* 401 */ }
export class ForbiddenException extends VertzException { /* 403 */ }
export class NotFoundException extends VertzException { /* 404 */ }
export class ConflictException extends VertzException { /* 409 */ }
export class ValidationException extends VertzException { /* 422 */ }
export class InternalServerErrorException extends VertzException { /* 500 */ }
export class ServiceUnavailableException extends VertzException { /* 503 */ }
```

### How Errors Reach HTTP Responses Today

1. **Route handler returns `@vertz/core` Err** → status + body directly used
2. **Route handler throws `VertzException`** → caught by catch block, `toJSON()` used with statusCode
3. **Route handler throws plain `Error`** → caught, returns generic 500 InternalServerError
4. **Route returns plain value** → wrapped in 200 JSON response

### Auth Result (Server-specific)

```typescript
// From /packages/server/src/auth/types.ts

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthError };
```

This is a simple discriminated union, different from both @vertz/errors and @vertz/core Result.

### Domain Result (Server-specific)

```typescript
// From /packages/server/src/domain/types.ts

export type Result<T, E = any> = { ok: true; data: T } | { ok: false; error: E };
```

Also a simple discriminated union, similar to AuthResult but with `any` default for error.

---

## Summary of Result Types

| Package | Err Fields | Purpose |
|---------|------------|---------|
| @vertz/errors | `{ ok: false, error: E }` | Business logic layer |
| @vertz/core | `{ ok: false, status: number, body: E }` | Route handlers (HTTP-aware) |
| @vertz/server/auth | `{ ok: false, error: AuthError }` | Auth operations |
| @vertz/server/domain | `{ ok: false, error: E }` | Domain handlers |
