# Auth SDK Codegen — Design Plan

> **Revision 3** — Aligned with unified SDK vision: auth endpoints flow through the IR → codegen pipeline, same as entities. No static templates.

## Context

The generated client SDK (`createClient()` from `.vertz/generated/client.ts`) only generates entity CRUD methods. Auth methods are hardcoded in `@vertz/ui/auth`'s AuthProvider using raw `fetch()` calls.

Auth endpoints are registered by `createServer({ auth: { ... } })` but they **don't appear in the IR, OpenAPI spec, or generated SDK**. This means E2E tests need a separate `createAuthClient` (PR #1436), violating Principle 2.

**Root cause:** The codegen pipeline only processes entities. Auth (and any future plugin) is invisible to it.

**Fix:** When auth is hooked into a server, its endpoints flow through the same pipeline as entities: **server config → IR → codegen → SDK**. The generated SDK is the single surface for everything the server exposes.

## API Surface

### 1. Generated client — one SDK for everything

```ts
import { createClient } from '#generated';

const api = createClient();

// Entity operations (unchanged)
const projects = query(api.projects.list());

// Auth operations (NEW — generated from IR, same pipeline as entities)
const loginForm = form(api.auth.signIn, {
  onSuccess: () => navigate('/dashboard'),
});
```

### 2. E2E test setup (Node.js)

```ts
import { createClient } from '#generated';

test.beforeEach(async ({ context, baseURL }) => {
  const api = createClient({ baseURL: baseURL ?? 'http://localhost:3001' });

  await api.auth.signUp({
    email: `e2e-${Date.now()}@test.local`,
    password: 'TestPassword123!',
  });
  await api.auth.switchTenant({ tenantId: 'tenant-acme' });

  await context.addCookies(api.auth.cookies());
});
```

### 3. When to use `api.auth` vs `useAuth()`

| Context | Use | Why |
|---------|-----|-----|
| E2E test setup (Node.js) | `api.auth.signIn()` | No DOM, no signals, need raw cookies |
| Server-side scripts | `api.auth.signIn()` | No reactive context available |
| App UI with reactive state | `useAuth().signIn` | AuthProvider manages user/status signals |
| Forms in app UI | `form(api.auth.signIn)` | Form-compatible, no reactive state needed |

## Architecture: IR-Driven Auth SDK

### How it works

Auth endpoints follow the same pipeline as entity endpoints:

```
createServer({ auth: { emailPassword: {} } })
  → Compiler detects auth config → AppIR includes auth operations
    → IR adapter maps to CodegenIR.auth.operations
      → AuthSdkGenerator produces .vertz/generated/auth.ts
        → ClientGenerator wires into createClient()
```

### CodegenIR extension

```ts
// packages/codegen/src/types.ts

export interface CodegenAuth {
  schemes: CodegenAuthScheme[];
  operations: CodegenAuthOperation[];  // NEW
}

export interface CodegenAuthOperation {
  /** e.g., 'signIn', 'signUp', 'signOut', 'switchTenant' */
  operationId: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** URL path relative to auth basePath, e.g., '/signin' */
  path: string;
  /** Whether this operation accepts a request body (form-compatible via SdkMethodWithMeta) */
  hasBody: boolean;
  /** JSON schema for request body (if hasBody) */
  inputSchema?: JsonSchema;
  /** JSON schema for response */
  outputSchema?: JsonSchema;
}
```

### Known auth operations (derived from config)

When auth is configured in `createServer()`, the pipeline adds these operations based on which features are enabled:

| Feature config | Operations added |
|---------------|-----------------|
| (always, if auth configured) | `signOut`, `session`, `refresh` |
| `emailPassword: {}` | `signIn`, `signUp` |
| `tenant: { verifyMembership }` | `switchTenant` |
| `providers: [...]` | `providers` (GET) |
| `mfa: { enabled: true }` | `mfaChallenge`, `mfaSetup`, `mfaVerifySetup`, `mfaStatus` |
| `emailVerification: {}` | `verifyEmail`, `resendVerification` |
| `passwordReset: {}` | `forgotPassword`, `resetPassword` |

Phase 1 covers the core operations (signIn, signUp, signOut, switchTenant, session, refresh). Optional operations (MFA, email verification, password reset) are follow-up.

### Generated auth SDK shape

```ts
// .vertz/generated/auth.ts (generated from IR)

export interface AuthCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
}

export interface AuthError extends Error {
  code: AuthErrorCode;
  statusCode: number;
  retryAfter?: number;
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_EXISTS'
  | 'MFA_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

// Input/output types generated from operation schemas in the IR
export interface SignInInput { email: string; password: string; }
export interface SignUpInput { email: string; password: string; [key: string]: unknown; }
export interface AuthResponse { user: AuthUser; expiresAt: number; }
export interface SwitchTenantInput { tenantId: string; }
export interface SwitchTenantResponse { tenantId: string; user: AuthUser; expiresAt: number; }
export interface AuthUser { id: string; email: string; role: string; [key: string]: unknown; }
export interface AuthSession { user: AuthUser; expiresAt: number; tenantId?: string; }

/**
 * Form-compatible methods (SdkMethodWithMeta) have .url, .method, .meta.bodySchema.
 * Plain methods (no body) are regular async functions — not form-compatible.
 */
export interface AuthSdk {
  signUp: SdkMethodWithMeta<SignUpInput, AuthResponse>;
  signIn: SdkMethodWithMeta<SignInInput, AuthResponse>;
  switchTenant: SdkMethodWithMeta<SwitchTenantInput, SwitchTenantResponse>;
  signOut: () => Promise<Result<{ ok: true }, AuthError>>;
  session: () => Promise<Result<{ session: AuthSession | null }, AuthError>>;
  refresh: () => Promise<Result<AuthResponse, AuthError>>;
  /** Accumulated cookies. Populated in Node.js; empty in browser (warns in dev). */
  cookies: () => AuthCookie[];
}

export function createAuthSdk(options: { basePath: string }): AuthSdk;
```

## Cookie Jar

Test-grade cookie management for Node.js/Bun E2E test setup. Not a full RFC 6265 implementation.

### How it works

| Environment | Cookie sending | Cookie reading | `cookies()` |
|-------------|---------------|----------------|-------------|
| Browser | Automatic (`credentials: 'include'`) | `Set-Cookie` invisible to JS | Returns `[]` + dev warning |
| Node.js/Bun | Manual via `Cookie` header | `getSetCookie()` on response | Returns accumulated cookies |

### Set-Cookie parsing

Uses `response.headers.getSetCookie()` (Node.js >= 19.7, Bun >= 1.0). Parses all standard attributes: `Path`, `Domain`, `Secure`, `HttpOnly`, `SameSite`, `Max-Age`/`Expires`.

### Path-scoped cookie sending

The server's refresh cookie is scoped to `Path=/api/auth/refresh`. The cookie jar respects `Path` — only sends cookies whose path is a prefix of the request URL.

### CSRF header

All auth requests include `'X-VTZ-Request': '1'`. The server validates this for CSRF protection.

## Manifesto Alignment

### Principle 2: One way to do things
One generated client for everything. Auth endpoints flow through the same pipeline as entities — no special-cased static templates.

### Principle 1: If it builds, it works
Auth methods are fully typed from the IR. `signIn` only accepts `SignInInput`.

### Principle 3: AI agents are first-class users
`api.auth.signIn({ email, password })` — the single, obvious way to authenticate.

## Non-Goals

1. **Refactoring AuthProvider** — Tracked in #1440. This PR must NOT modify `packages/ui/src/auth/auth-context.ts`.
2. **Optional auth operations** (MFA, email verification, password reset) — Follow-up after core auth operations land.
3. **OAuth methods** — OAuth uses browser redirects, not API calls.
4. **Custom/user-defined auth endpoints** — Framework built-in endpoints only.
5. **Production-grade cookie jar** — Test-grade, sufficient for E2E setup.
6. **`switchTenant` namespace** — Lives under `api.auth` for now (server exposes it at `/api/auth/switch-tenant`). May move to `api.tenant` in the future.

## Unknowns

1. **`#generated` import in Playwright tests** — Spike during Phase 1 to verify `import { createClient } from '#generated'` resolves in Playwright test files (Node.js + TypeScript via esbuild).

## Type Flow Map

```
Auth config in createServer()
  → Compiler detects → AppIR auth operations
    → IR adapter → CodegenIR.auth.operations
      → AuthSdkGenerator → SdkMethodWithMeta<SignInInput, AuthResponse>
        → form(api.auth.signIn)
          → loginForm.email (FormField<string>)
          → loginForm.onSubmit → Result<AuthResponse, AuthError>
```

## E2E Acceptance Test

```ts
describe('Feature: Auth SDK in generated client', () => {
  describe('Given a server with auth configured', () => {
    describe('When codegen runs', () => {
      it('Then generates auth.ts with methods matching configured auth features', () => {});
      it('Then client.ts includes auth property', () => {});
    });
  });

  describe('Given createClient() with auth', () => {
    it('Then api.auth has signIn, signUp, signOut, switchTenant, session, refresh, cookies', () => {});
    it('Then signIn has .url, .method, .meta.bodySchema (SdkMethodWithMeta)', () => {});
    it('Then signOut does NOT have .url/.method (plain function)', () => {});
  });

  describe('Given a running server', () => {
    it('Then api.auth.signUp() returns ok result with user', () => {});
    it('Then api.auth.signUp() accumulates cookies in jar (Node.js)', () => {});
    it('Then cookies include parsed attributes (path, httpOnly)', () => {});
    it('Then path-scoped cookies are only sent to matching paths', () => {});
    it('Then all requests include X-VTZ-Request header', () => {});
  });

  describe('Given Playwright E2E test', () => {
    it('Then signUp + switchTenant + cookies() provides valid Playwright cookies', () => {});
  });
});
```

## Implementation Plan

### Phase 1: CodegenIR extension + Auth SDK generator

**Goal:** Extend `CodegenIR.auth` with operations. Create `AuthSdkGenerator` that produces `auth.ts` from the IR. Spike `#generated` in Playwright.

**Changes:**
- `packages/codegen/src/types.ts` — Add `CodegenAuthOperation`, extend `CodegenAuth`
- `packages/codegen/src/generators/auth-sdk-generator.ts` — New generator
- `packages/codegen/src/index.ts` — Export new types and generator
- Cookie jar utility (either inline or extracted)

**Acceptance criteria:**
```ts
describe('Feature: Auth SDK generator', () => {
  describe('Given CodegenIR with auth operations', () => {
    describe('When AuthSdkGenerator.generate() is called', () => {
      it('Then produces auth.ts with createAuthSdk factory', () => {});
      it('Then form-compatible methods have SdkMethodWithMeta shape', () => {});
      it('Then plain methods are regular async functions', () => {});
      it('Then types (AuthError, AuthSession, etc.) are defined', () => {});
    });
  });

  describe('Given createAuthSdk against a real server', () => {
    it('Then signIn/signUp/switchTenant work with cookie jar', () => {});
    it('Then cookies() returns parsed Set-Cookie with all attributes', () => {});
    it('Then path-scoped cookies are sent correctly', () => {});
  });
});
```

### Phase 2: IR adapter + client generator wiring

**Goal:** IR adapter populates auth operations from AppIR. Client generator includes auth SDK.

**Changes:**
- `packages/codegen/src/ir-adapter.ts` — Detect auth config, populate `CodegenAuth.operations`
- `packages/codegen/src/generators/client-generator.ts` — Import and wire auth SDK
- May need compiler extension if AppIR doesn't include auth config

**Acceptance criteria:**
```ts
describe('Feature: Auth in codegen pipeline', () => {
  describe('Given createServer({ auth: { emailPassword: {} } })', () => {
    describe('When the codegen pipeline runs', () => {
      it('Then CodegenIR.auth.operations includes signIn, signUp, signOut, session, refresh', () => {});
      it('Then createClient() returns { auth, ...entities }', () => {});
    });
  });

  describe('Given createServer({ auth: { tenant: { verifyMembership } } })', () => {
    it('Then CodegenIR.auth.operations includes switchTenant', () => {});
  });
});
```

### Phase 3: Linear clone E2E migration

**Goal:** Linear clone E2E tests use `createClient()` for auth. Remove `createAuthClient` from `@vertz/testing`.

**Acceptance criteria:**
- All existing E2E tests pass with `api.auth.*` instead of `createAuthClient`
- No direct fetch calls to `/api/auth/*` in test files
- `createAuthClient` removed from `@vertz/testing`

### Phase 4 (future — #1440): AuthProvider refactor

Deferred. AuthProvider uses the generated auth SDK instead of its own HTTP layer.
