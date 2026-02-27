# Platform Agnosticism Fixes — Runtime Packages

## Context

An audit of all 23 packages revealed that 5 runtime packages use Node.js-specific APIs (`process.env`, `node:crypto`, `node:fs/promises`) directly, breaking platform agnosticism. This violates the framework's principle that runtime packages should work across Node, Bun, Deno, Cloudflare Workers, and browsers. This plan addresses all findings with minimal, clean changes.

---

## Phase 1: NODE_ENV typeof Guards

**5 files, zero breaking changes, zero test modifications**

Add `typeof process !== 'undefined' &&` before every unguarded `process.env.NODE_ENV` check.

### Files

| File | Line | Change |
|------|------|--------|
| `packages/core/src/context/ctx-builder.ts` | 38 | `if (process.env.NODE_ENV === 'development')` → `if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development')` |
| `packages/core/src/context/deps-builder.ts` | 12 | Same pattern |
| `packages/core/src/immutability/make-immutable.ts` | 5 | Same pattern |
| `packages/ui/src/component/context.ts` | 115 | `if (process.env.NODE_ENV !== 'production' && Array.isArray(result))` → `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && Array.isArray(result))` |
| `packages/db/src/core/db-provider.ts` | 90 | `return process.env.NODE_ENV !== 'production'` → `return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` |

The `@vertz/ui` fix aligns with the guarded pattern already used in 8 other locations across `mount.ts`, `element.ts`, and `hydration-context.ts`.

### Verification
- `bun test --filter core` and `bun test --filter ui` pass unchanged
- `bun run typecheck` on both packages

---

## Phase 2: createEnv Optional `env` Parameter

**3 files changed, backward-compatible**

### Files

**`packages/core/src/types/env.ts`** — Add `env` field to `EnvConfig`:
```typescript
export interface EnvConfig<T = unknown> {
  load?: string[];
  schema: Schema<T>;
  env?: Record<string, string | undefined>;
}
```

**`packages/core/src/env/env-validator.ts`** — Use `config.env` with fallback:
```typescript
export function createEnv<T>(config: EnvConfig<T>): T {
  const envRecord =
    config.env ?? (typeof process !== 'undefined' ? process.env : {});
  const result = config.schema.safeParse(envRecord);
  ...
}
```

**`packages/core/src/env/__tests__/env-validator.test.ts`** — Add 2 tests:
1. "uses explicit env record when provided"
2. "explicit env takes precedence over process.env"

### Verification
- All 5 existing tests pass unchanged
- 2 new tests pass
- `bun run typecheck` on `@vertz/core`

---

## Phase 3: Web Crypto API for Hash Functions

**1 new util, 2 production files, test updates — async signature change**

### New file: `packages/db/src/util/hash.ts`
```typescript
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

`crypto.subtle` is globally available in Bun, Node 19+, Cloudflare Workers, Deno, and all modern browsers. SHA-256 produces identical output regardless of implementation, so existing checksums in migration tables remain valid.

### Changed files

**`packages/db/src/migration/runner.ts`**:
- Remove `import { createHash } from 'node:crypto'`
- Import `sha256Hex` from `../util/hash`
- `computeChecksum` becomes `async`, returns `Promise<string>`
- `detectDrift` becomes `async`, returns `Promise<string[]>` (already returns via the `MigrationRunner` interface)
- `apply` already awaits — just add `await` before `computeChecksum(sql)` on line 133

**`packages/db/src/plugin/fingerprint.ts`**:
- Remove `import { createHash } from 'node:crypto'`
- Import `sha256Hex` from `../util/hash`
- `fingerprint` becomes `async`, returns `Promise<string>`

**`packages/db/src/migration/index.ts`**:
- Update `MigrationRunner` type export — `detectDrift` return type changes to `Promise<string[]>`

### Breaking change acknowledgement

Both `computeChecksum` and `fingerprint` are **public API exports** (from `@vertz/db` index and `@vertz/db/plugin` respectively). Changing them from sync to async is a breaking change — consumers doing `const x = computeChecksum(sql)` will silently get a Promise. TypeScript will catch this at typecheck, but only for consumers who typecheck. Pre-v1 breaking changes policy applies.

The `MigrationRunner` interface also changes: `detectDrift` goes from `string[]` to `Promise<string[]>`.

### Hash backward compatibility

SHA-256 produces identical output regardless of implementation (`node:crypto` vs Web Crypto). The golden test MUST verify this explicitly to guarantee existing checksums stored in `_vertz_migrations` tables remain valid.

### Test updates
- `runner.test.ts`: Add `await` to `computeChecksum()` calls, make `detectDrift` test async
- `fingerprint.test.ts`: Add `await` to all `fingerprint()` calls
- Integration tests referencing `computeChecksum` or `fingerprint`: add `await`
- New test file `packages/db/src/util/__tests__/hash.test.ts`: determinism, length, known-value golden test

### Verification
- `bun test --filter db` — all tests pass
- `bun run typecheck` on `@vertz/db`
- Golden test confirms `sha256Hex('')` === `'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'`

---

## Phase 4: SnapshotStorage Adapter Interface

**1 new interface file, 2 refactored files, test updates**

### New file: `packages/db/src/migration/storage.ts`
```typescript
import type { SchemaSnapshot } from './snapshot';

export interface SnapshotStorage {
  load(key: string): Promise<SchemaSnapshot | null>;
  save(key: string, snapshot: SchemaSnapshot): Promise<void>;
}
```

The parameter is named `key` (not `path`) to be backend-agnostic — it's a file path for `NodeSnapshotStorage`, but could be a KV key, S3 object key, etc.

### Changed files

**`packages/db/src/migration/snapshot-storage.ts`** — Convert standalone functions to `NodeSnapshotStorage` class implementing `SnapshotStorage`. Keeps `node:fs/promises` and `node:path` imports (this is the Node-specific implementation).

**`packages/db/src/migration/auto-migrate.ts`**:
- Add optional `storage?: SnapshotStorage` to `AutoMigrateOptions`
- Default to `new NodeSnapshotStorage()` when not provided
- Replace `loadSnapshot()`/`saveSnapshot()` calls with `storage.load()`/`storage.save()`

**`packages/db/src/migration/index.ts`** — Add exports:
```typescript
export type { SnapshotStorage } from './storage';
export { NodeSnapshotStorage } from './snapshot-storage';
```

### Test updates
- `snapshot-storage.test.ts`: Refactor to use `new NodeSnapshotStorage()` instance
- Add contract test with in-memory `SnapshotStorage` to verify interface works

### Verification
- `bun test --filter db` — all tests pass
- `bun run typecheck` on `@vertz/db`

---

## Phase 5: Server Auth Config Decoupling

**2 production files, test updates**

### Changed files

**`packages/server/src/auth/types.ts`** — Add `isProduction` to `AuthConfig`:
```typescript
export interface AuthConfig {
  session: SessionConfig;
  emailPassword?: EmailPasswordConfig;
  jwtSecret?: string;
  jwtAlgorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256';
  claims?: (user: AuthUser) => Record<string, unknown>;
  /** Whether the app runs in production mode. Defaults to process.env.NODE_ENV check with typeof guard. */
  isProduction?: boolean;
}
```

**`packages/server/src/auth/index.ts`**:

1. **Lines 233-251** — Remove `process.env.AUTH_JWT_SECRET` fallback. Compute `isProduction` once with a **secure default** — when the environment can't be determined (e.g. edge runtimes where `process` is undefined), default to `true` so we fail safely rather than silently using insecure defaults:
```typescript
const isProduction =
  config.isProduction ??
  (typeof process === 'undefined' || process.env.NODE_ENV === 'production');

let jwtSecret: string;
if (configJwtSecret) {
  jwtSecret = configJwtSecret;
} else if (isProduction) {
  throw new Error(
    'jwtSecret is required in production. Provide it via createAuth({ jwtSecret: "..." }).',
  );
} else {
  console.warn(
    'Using insecure default JWT secret. Provide jwtSecret in createAuth() config for production.',
  );
  jwtSecret = 'dev-secret-change-in-production';
}
```

**Security note:** The default flips to `true` when `process` is unavailable. This ensures edge runtimes (Cloudflare Workers, Deno Deploy) require explicit `jwtSecret` rather than silently falling back to the insecure dev secret. Users must pass `isProduction: false` to opt into dev mode on non-Node runtimes.

2. **Line 536** — Replace `process.env.NODE_ENV === 'production'` with `isProduction` (already in closure scope from `createAuth`).

### Test updates
- All existing tests pass unchanged (they already pass `jwtSecret` via config)
- Add test: "throws when isProduction is true and no jwtSecret"
- Add test: "accepts jwtSecret in production mode"

### Verification
- `bun test --filter server` — all tests pass
- `bun run typecheck` on `@vertz/server`
- No `process.env.AUTH_JWT_SECRET` references remain in auth module

---

## Out of Scope

- **`sqlite-adapter.ts`** (`@vertz/db`): Uses `fs`, `path`, `require()` — SQLite is inherently Node/Bun-only, so this is acceptable.
- **`@vertz/tui`**: Private, terminal-specific package. Lower priority, separate effort.
- **`@vertz/codegen`** and **`@vertz/cli`**: Build-time packages that run exclusively in Node/Bun. `node:crypto` usage there is expected and acceptable.
- **`@vertz/ui-server`**: Uses `AsyncLocalStorage` from `node:async_hooks` — this is a server-side rendering package, Node-only by design. Not a platform agnosticism violation.

## Adversarial Review Findings (Addressed)

The following issues were raised during adversarial review and incorporated above:

1. **Missed `db-provider.ts:90`** — Unguarded `process.env.NODE_ENV` check. Added to Phase 1.
2. **`isProduction` security default** — Originally defaulted to `false` when `process` is unavailable, which would silently use insecure JWT secret on edge runtimes. Fixed: defaults to `true` (secure-by-default). Users must explicitly opt into dev mode.
3. **Hash backward compatibility** — Added explicit golden test requirement and acknowledgement that SHA-256 output is implementation-independent.
4. **Public API sync-to-async breaks** — `computeChecksum` and `fingerprint` are public exports. Breaking change acknowledged; pre-v1 policy applies.
5. **`SnapshotStorage` parameter naming** — Changed from `path` to `key` for backend-agnostic semantics.

## Final Verification

After all phases:
```bash
bun test                    # All tests across monorepo
bun run typecheck           # Full typecheck
bun run lint                # Biome lint
```
