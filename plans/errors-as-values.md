# Design Doc: Errors-as-Values Across All Public APIs

**Issue:** #393  
**Status:** RFC  
**Owner:** Platform Team  
**Target:** v2.0.0 (major version bump)

---

## 1. Problem Statement

Our current API design relies on exceptions for error handling. This creates three critical problems:

### 1.1 Errors Are Invisible to the Type System

```typescript
// Current: throws on error — type signature lies
async function findUser(id: string): Promise<User> {
  const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  if (!row) throw new NotFoundError('users', id);
  return row;
}

// Caller has NO type-level indication this can fail
const user = await findUser('123'); // Type: Promise<User>
```

### 1.2 LLMs Can't Reason About Error Paths

When an AI agent calls `findUser()`, it has no way to know:
- What exceptions might be thrown
- When to expect them
- How to handle them appropriately

This leads to unhandled exceptions in production — surprise crashes at 3am.

### 1.3 try/catch Pyramids

```typescript
// Current: nested disaster
try {
  const user = await createUser(input);
  try {
    const profile = await createProfile(user.id);
    try {
      await sendWelcomeEmail(user.email);
    } catch (e) {
      // Now what? Email failed but user + profile exist
    }
  } catch (e) {
    await rollbackUser(user.id); // Manual cleanup
  }
} catch (e) {
  // Which error happened? Generic catch-all
}
```

---

## 2. The `Result<T, E>` Type

We introduce a simple, explicit result type in `@vertz/schema` (the shared foundation every package depends on):

```typescript
// @vertz/schema/src/result.ts

export interface Ok<T> {
  readonly ok: true;
  readonly data: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A discriminated union representing success or failure.
 * 
 * @example
 * type UserResult = Result<User, SchemaError>;
 * type UsersResult = Result<User[], ReadError>;
 */
export type Result<T, E = unknown> = Ok<T> | Err<E>;

/**
 * Creates a successful Result.
 * 
 * @example
 * const result = ok({ name: 'Alice' });
 */
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

/**
 * Creates an error Result.
 * 
 * @example
 * const result = err(new ValidationError({ email: ['Invalid format'] }));
 */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
```

---

## 3. Named Error Unions

Each package defines its error unions. We provide both **granular** (per-method) and **convenience** (named alias) types.

### 3.1 `@vertz/db` Errors

```typescript
// @vertz/db/src/errors/index.ts

// Individual error types (already exist)
export class UniqueConstraintError extends DbError { /* ... */ }
export class NotNullError extends DbError { /* ... */ }
export class CheckConstraintError extends DbError { /* ... */ }
export class ForeignKeyError extends DbError { /* ... */ }
export class NotFoundError extends DbError { /* ... */ }
export class ConnectionError extends DbError { /* ... */ }

// Convenience unions
export type WriteError = 
  | UniqueConstraintError 
  | NotNullError 
  | CheckConstraintError 
  | ForeignKeyError;

export type ReadError = 
  | NotFoundError 
  | ConnectionError;

export type DbError = WriteError | ReadError;
```

### 3.2 `@vertz/schema` Errors

```typescript
// @vertz/schema/src/errors.ts

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly fields: Record<string, string[]>;
  
  constructor(fields: Record<string, string[]>) {
    super('Validation failed');
    this.fields = fields;
  }
}

export class ParseError extends Error {
  readonly code = 'PARSE_ERROR';
  readonly path: string;
  readonly value: unknown;
  
  constructor(path: string, value: unknown, message: string) {
    super(message);
    this.path = path;
    this.value = value;
  }
}

export type SchemaError = ValidationError | ParseError;
```

### 3.3 `@vertz/server` Errors

```typescript
// @vertz/server/src/errors.ts

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
}

export class DomainError extends Error {
  readonly code: string;
  
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type AuthError = UnauthorizedError | ForbiddenError;
export type ServerError = AuthError | SchemaError | DbError | DomainError;
```

---

## 4. Method Signatures: Before/After

### 4.1 `@vertz/db` — User Repository

**BEFORE (throws):**
```typescript
class UserRepository {
  async create(input: CreateUserInput): Promise<User>;
  async findOne(id: string): Promise<User | null>;
  async findMany(query: UserQuery): Promise<User[]>;
  async update(id: string, input: UpdateUserInput): Promise<User>;
  async delete(id: string): Promise<void>;
}
```

**AFTER (Result):**
```typescript
class UserRepository {
  // Granular: caller sees exact errors
  async create(input: CreateUserInput): Promise<Result<User, UniqueConstraintError | NotNullError | CheckConstraintError>>;
  
  // Convenience: named alias for common use
  async create(input: CreateUserInput): Promise<Result<User, WriteError>>;
  
  // null is valid success — absence isn't an error
  async findOne(id: string): Promise<Result<User | null, ReadError>>;
  
  // For cases where absence IS an error
  async findOneRequired(id: string): Promise<Result<User, NotFoundError | ReadError>>;
  
  async findMany(query: UserQuery): Promise<Result<User[], ReadError>>;
  
  async update(id: string, input: UpdateUserInput): Promise<Result<User, NotFoundError | WriteError>>;
  
  async delete(id: string): Promise<Result<void, NotFoundError | WriteError>>;
}
```

### 4.2 `@vertz/schema` — Validation

**BEFORE (throws):**
```typescript
function parse<T>(schema: Schema<T>, data: unknown): T;
```

**AFTER (Result):**
```typescript
function parse<T>(schema: Schema<T>, data: unknown): Result<T, SchemaError>;
```

### 4.3 `@vertz/server` — Domain Actions

**BEFORE (throws):**
```typescript
class UserService {
  async register(input: RegisterInput): Promise<User>;
  async login(credentials: LoginCredentials): Promise<Session>;
}
```

**AFTER (Result):**
```typescript
class UserService {
  async register(input: RegisterInput): Promise<Result<User, SchemaError | UniqueConstraintError>>;
  async login(credentials: LoginCredentials): Result<Session, UnauthorizedError | SchemaError>;
}
```

### 4.4 `@vertz/cli` — Command Handlers

**BEFORE (throws/exits):**
```typescript
async function handleCreateUser(cmd: CreateUserCommand): Promise<void>;
```

**AFTER (Result):**
```typescript
async function handleCreateUser(cmd: CreateUserCommand): Promise<Result<User, WriteError | SchemaError>>;
```

### 4.5 `@vertz/ui` — Async Operations

**BEFORE (Promise<T>):**
```typescript
function useUser(id: string): { user: User | null; loading: boolean };
```

**AFTER (Result in query state):**
```typescript
function useUser(id: string): QueryState<Result<User, ReadError>>;
```

---

## 5. Helper Utilities

We provide four core helpers in `@vertz/schema` v1:

```typescript
// @vertz/schema/src/result-helpers.ts

/**
 * Unwraps a Result, throwing if error.
 * Use only in tests, scripts, or when failure is truly exceptional.
 * 
 * @example
 * // Tests
 * const user = unwrap(await repo.findOneRequired(id));
 * 
 * // Scripts
 * const config = unwrap(parseConfig());
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.data;
  }
  throw result.error;
}

/**
 * Maps the success value to a new type.
 * 
 * @example
 * const userName = map(userResult, u => u.name);
 */
export function map<T, E, U>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (result.ok) {
    return { ok: true, data: fn(result.data) };
  }
  return result;
}

/**
 * Chains Result-returning functions.
 * 
 * @example
 * const result = await flatMap(
 *   await repo.findOne(userId),
 *   async (user) => await profileRepo.findOne(user.profileId)
 * );
 */
export async function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Promise<Result<U, F>>
): Promise<Result<U, E | F>>;
export function flatMap<T, E, U, F>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, F>
): Result<U, E | F>;

/**
 * Pattern matching on Result.
 * 
 * @example
 * const message = match(result, {
 *   ok: (user) => `Hello, ${user.name}!`,
 *   err: (e) => `Error: ${e.message}`
 * });
 */
export function match<T, E, Ok, Err>(
  result: Result<T, E>,
  handlers: { ok: (data: T) => Ok; err: (error: E) => Err }
): Ok | Err {
  return result.ok ? handlers.ok(result.data) : handlers.err(result.error);
}
```

### Usage Examples

```typescript
// map — transform without short-circuiting
const userDto = map(userResult, u => ({
  id: u.id,
  name: u.name,
  avatar: u.avatarUrl,
}));

// flatMap — chaining that preserves errors
const profile = await flatMap(
  await users.findOne(id),
  (user) => profiles.findOne(user.profileId)
);

// match — explicit branches
const html = match(result, {
  ok: (data) => render(data),
  err: (error) => renderError(error),
});

// unwrap — when you just want the value or crash
const user = unwrap(await repo.findOneRequired(id));
```

---

## 6. Migration Strategy

This is a **breaking change** requiring a major version bump to v2.0.0. Since we're pre-launch with ~zero external consumers, we can ship Result-only APIs directly without deprecated parallel APIs.

### Simplified Rollout

1. **Phase 1: Add Result types to @vertz/schema**
   - `Result<T, E>`, `Ok<T>`, `Err<E>`
   - Constructor helpers: `ok()`, `err()`
   - Helper utilities: `unwrap()`, `map()`, `flatMap()`, `match()`

2. **Phase 2: Update @vertz/db to return Result**
   - Replace existing method signatures with Result-returning versions
   - Error unions: `WriteError`, `ReadError`

3. **Phase 3: Update @vertz/server, @vertz/schema**
   - Domain actions return Result
   - `parse()` returns `Result<T, SchemaError>`

4. **Phase 4: Update @vertz/cli, @vertz/ui**
   - Command handlers return Result
   - Query state includes Result

### Compatibility Layer

For teams migrating incrementally:

```typescript
// Optional: migration helper (internal use only)
function resultToThrow<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.data;
}
```

**This helper is internal — we don't expose " Result + throw" as the default pattern.**

---

## 7. Naming Changes

| Old Name | New Name | Rationale |
|----------|----------|-----------|
| `findOneOrThrow()` | `findOneRequired()` | "Required" conveys the contract: absence is an error |
| `findOne()` | `findOne()` (unchanged) | Now returns `Result<T \| null, ReadError>` — null is valid |
| `parse()` (throws) | `parse()` (returns Result) | `parse()` now returns `Result<T, SchemaError>` by default. Use `unwrap(parse(...))` if you want to throw. |
| N/A | `WriteError` | Named union for write operations |
| N/A | `ReadError` | Named union for read operations |
| N/A | `SchemaError` | Union type for schema/parse errors (`ValidationError \| ParseError`) |

---

## 8. Integration Example

Here's a full request handler demonstrating the pattern:

```typescript
// @vertz/server/src/domain/user-actions.ts
import { ok, err, map, flatMap, match } from '@vertz/schema';
import { db } from '@vertz/db';
import { ValidationError, WriteError, ReadError } from '@vertz/db';

export async function createUserAndWelcome(
  input: CreateUserInput
): Promise<Result<{ user: User; emailSent: boolean }, WriteError | ValidationError>> {
  // Step 1: Validate input
  const parsed = parseUserInput(input);
  if (!parsed.ok) {
    return err(parsed.error);
  }

  // Step 2: Create user (flatMap chains, preserves error types)
  const userResult = await flatMap(
    parsed,
    async (validInput) => await db.users.create(validInput)
  );

  // Step 3: Send welcome email (another flatMap)
  const finalResult = await flatMap(
    userResult,
    async (user) => {
      const emailResult = await email.send(user.email, 'welcome');
      // Email failure doesn't rollback user — we return success with flag
      return ok({ user, emailSent: emailResult.ok });
    }
  );

  return finalResult;
}
```

### Express/Server Handler

```typescript
// @vertz/server/src/http/handlers.ts
import { match } from '@vertz/schema';

async function handleCreateUser(req: Request): Promise<Response> {
  const result = await createUserAndWelcome(req.body);

  return match(result, {
    ok: ({ user, emailSent }) => 
      json({ 
        data: { id: user.id, email: user.email },
        meta: { emailSent } 
      }, 201),
    
    err: (error) => {
      // Type narrowing: TypeScript knows exact error type
      if (error.code === 'UNIQUE_VIOLATION') {
        return json({ 
          error: 'EMAIL_EXISTS', 
          message: 'A user with this email already exists' 
        }, 409);
      }
      if (error.code === 'VALIDATION_ERROR') {
        return json({ 
          error: 'INVALID_INPUT', 
          fields: error.fields 
        }, 400);
      }
      // Unexpected — log and hide
      console.error('Unexpected error:', error);
      return json({ error: 'INTERNAL_ERROR' }, 500);
    }
  });
}
```

### What This Achieves

1. **Explicit contracts** — Every public method shows its error possibilities in the type signature
2. **No hidden control flow** — No try/catch pyramids, no surprise exceptions
3. **LLM-readable** — AI agents see exactly what can go wrong and must handle it
4. **Composable** — `flatMap` chains operations while preserving error types
5. **"If it builds, it works"** — The compiler enforces error handling at call sites

---

## 9. Key Principles

| Principle | Description |
|-----------|-------------|
| **Errors-as-values default** | No `throws` in public APIs. Every method returns `Result<T, E>`. |
| **LLM-native** | Agents read types, not documentation, to know error paths. |
| **Composable** | `flatMap` chains without try/catch pyramids. |
| **Granular + convenient** | Both per-method unions and named aliases available. |
| **Null is valid** | `findOne()` returns `Result<T \| null, E>` — absence isn't always an error. |
| **Required when needed** | `findOneRequired()` for cases where absence is a problem. |

---

## 10. Open Questions

1. **Error code standardization?** Should all errors have string codes for programmatic handling?
2. **Version bump to v2.0.0?** Any other considerations for the major version?

---

## 11. Related Issues

- #393 (this issue)
- #287 — Schema validation errors
- #156 — Database error handling

---

*Design doc authored by Platform Team. RFC period: 2 weeks.*
