# Open Issues Triage — Status Update
**Date:** 2026-02-14  
**Auditor:** @auditor  
**Context:** Post-Turborepo migration, Zero-Config SSR launch, create-vertz-app release

---

## Executive Summary

Triaged **17 open issues** across vertz repo:
- **4 CLOSE** — Already implemented/resolved
- **5 UPDATE** — Partially done, need status updates
- **8 OPEN** — Still needed (includes 2 blocked by compiler)

**Key Findings:**
- Recent launches (SSR, create-vertz-app, Turborepo) closed 4 issues
- Postgres driver has 5 open issues from original PR #202 review
- DX improvements (#179, #180, #182, #185) remain unaddressed
- Testing package missing features (#50, #51) blocked by core types

---

## ✅ CLOSE — Already Implemented

### Issue #265: Zero-config SSR
**Status:** ✅ **RESOLVED by PR #267** (merged Feb 14, 2026)  
**Evidence:**
```bash
$ git log --oneline --grep "#265"
0a33c14 feat: Zero-Config SSR (#265) (#267)
```
**Action:** Close with comment: "Resolved by PR #267 (Zero-Config SSR implementation merged Feb 14, 2026)"

---

### Issue #245: create-vertz-app scaffolding CLI
**Status:** ✅ **RESOLVED by PR #256** (merged ~Feb 13-14, 2026)  
**Evidence:**
- Package exists at `packages/create-vertz-app/`
- Bin script: `packages/create-vertz-app/bin/create-vertz-app.ts`
- Full implementation with prompts, templates, tests
- `git log` shows: `9c9ae6b feat(cli): add create-vertz-app scaffolding CLI (#256)`

**Action:** Close with comment: "Implemented in PR #256. Package shipped at `packages/create-vertz-app/` with full scaffolding, templates, and tests."

---

### Issue #75: TDD green light checks (biome format, lint, typecheck)
**Status:** ✅ **RESOLVED by Turborepo migration** (PR #272, merged Feb 14, 2026)  
**Evidence:**
```yaml
# lefthook.yml
pre-push:
  commands:
    quality-gates:
      run: turbo run lint typecheck test --output-logs=errors-only
```
**Action:** Close with comment: "Resolved by Turborepo migration (PR #272). Pre-push hook now runs `turbo run lint typecheck test` automatically."

---

### Issue #70: feat(core): implement app.listen() and runtime adapters
**Status:** ✅ **IMPLEMENTED**  
**Evidence:**
- `packages/core/src/app/app-builder.ts` lines 20-52 implement `listen()` method
- `detectAdapter()` auto-detects Bun vs Node runtime
- `ServerHandle` interface with `port`, `hostname`, `close()` implemented
- Integration tests: `packages/core/src/app/__tests__/listen.test.ts`

**Code:**
```typescript
async listen(port, options) {
  const adapter = detectAdapter();
  const serverHandle = await adapter.listen(port ?? DEFAULT_PORT, builder.handler, options);
  // ...route logging...
  return serverHandle;
}
```

**Action:** Close with comment: "Feature implemented in `@vertz/core`. `app.listen()` supports Bun/Node adapters with auto-detection, port configuration, and route logging."

---

## 🔄 UPDATE — Partially Done or Need Work

### Issue #207: test(db): improve postgres integration test isolation
**Status:** 🔄 **PARTIALLY VALID** — Tests exist but share state  
**Current Situation:**
- Integration tests at `packages/db/src/__tests__/postgres-integration.test.ts`
- Setup/teardown uses `beforeAll`/`afterAll` (not `beforeEach`)
- Tests share UUIDs (`ORG_ID`, `USER_ID`, etc.) and rely on execution order
- Tests would fail if reordered or run in isolation

**Example:** Test "creates an organization" (line 245) inserts `ORG_ID`, which subsequent "creates a user" test depends on.

**Recommendation:** Issue remains valid. Tests should use `beforeEach` with unique data per test or transaction rollback pattern.

**Action:** Add comment:
```
Issue confirmed. Current integration tests share state via ordered execution:
- `beforeAll` creates tables once
- Tests reuse stable UUIDs (ORG_ID, USER_ID, etc.)
- Test "create user" depends on prior "create organization" test

Suggested fix remains valid: Use `beforeEach` with unique test data or transaction rollback.
```

---

### Issue #206: fix(db): set default idle_timeout for connection pool
**Status:** 🔄 **NOT FIXED** — No default set  
**Current Code:**
```typescript
// packages/db/src/client/postgres-driver.ts:103
const sql: PostgresSql = postgresLib(url, {
  max: pool?.max ?? 10,
  idle_timeout: pool?.idleTimeout !== undefined ? pool.idleTimeout / 1000 : undefined,
  // ^^^ Still no default — passes undefined if not provided
  connect_timeout: pool?.connectionTimeout !== undefined ? pool.connectionTimeout / 1000 : 10,
});
```

**Impact:** Connections never expire if `idleTimeout` not explicitly configured.

**Action:** Add comment:
```
Issue still valid. Current code at `postgres-driver.ts:103` does not default `idle_timeout`:
\`\`\`typescript
idle_timeout: pool?.idleTimeout !== undefined ? pool.idleTimeout / 1000 : undefined,
\`\`\`
This means idle connections never expire unless consumer explicitly sets `idleTimeout`. Suggested fix (default 30s) remains needed.
```

---

### Issue #205: fix(db): route db.query() through executeQuery for consistent error mapping
**Status:** 🔄 **NOT FIXED** — db.query() bypasses error mapping  
**Evidence:**
```typescript
// packages/db/src/client/database.ts
async query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<T>> {
  return queryFn<T>(fragment.sql, fragment.params);  // ❌ Direct call, no error mapping
}
```

**CRUD operations** (create, findOne, etc.) use `executeQuery` which calls `parsePgError()`, but raw SQL via `db.query()` does not.

**Impact:** Raw SQL constraint violations return generic `PostgresError` instead of typed `UniqueConstraintError`, `ForeignKeyError`, etc.

**Action:** Add comment:
```
Issue confirmed. `db.query()` at `database.ts` bypasses error mapping:
\`\`\`typescript
async query<T>(fragment: SqlFragment): Promise<QueryResult<T>> {
  return queryFn<T>(fragment.sql, fragment.params);  // No parsePgError()
}
\`\`\`
CRUD operations route through `executeQuery()` and get typed errors. Raw SQL does not. Inconsistent error handling confirmed.
```

---

### Issue #204: docs(db): document timestamp coercion false-positive risk
**Status:** 🔄 **PARTIALLY DONE** — Documented in code, not in consumer docs  
**Evidence:**
```typescript
// packages/db/src/client/postgres-driver.ts:157-169
/**
 * Coerce values returned from PostgreSQL to appropriate JS types.
 *
 * postgres.js returns most types correctly, but when fetch_types is disabled,
 * timestamp values may come as strings. This function ensures:
 * - ISO 8601 timestamp strings → Date objects
 * - Everything else passes through unchanged
 */
function coerceValue(value: unknown): unknown {
  if (typeof value === 'string' && isTimestampString(value)) {
    // ...Date coercion...
  }
}
```

**Gap:** Code comments exist, but no consumer-facing documentation (README, API docs, etc.) mentions the coercion behavior or false-positive risk.

**Action:** Add comment:
```
Partially done. Code comments at `postgres-driver.ts:157` document the coercion behavior. However, consumer-facing documentation (package README, API docs for `createDb`) does not mention this. Recommend adding note to `@vertz/db` README about automatic timestamp coercion and potential edge cases.
```

---

### Issue #203: fix(db): add timeout to isHealthy() to prevent hangs
**Status:** 🔄 **NOT FIXED** — No timeout implemented  
**Current Code:**
```typescript
// packages/db/src/client/postgres-driver.ts
async isHealthy(): Promise<boolean> {
  try {
    await sql`SELECT 1`;  // ❌ No timeout
    return true;
  } catch {
    return false;
  }
}
```

**Impact:** If database accepts connections but doesn't respond to queries, `isHealthy()` could hang indefinitely.

**Action:** Add comment:
```
Issue confirmed. `isHealthy()` at `postgres-driver.ts` has no timeout:
\`\`\`typescript
async isHealthy(): Promise<boolean> {
  try {
    await sql\`SELECT 1\`;  // Hangs indefinitely if DB is degraded
    return true;
  } catch {
    return false;
  }
}
\`\`\`
Suggested fix (5s timeout via `Promise.race`) remains valid.
```

---

## 🔴 OPEN — Still Needed

### Issue #185: DX: Response schema not validated at runtime
**Status:** 🔴 **OPEN** — Design decision needed  
**Context:** `RouteConfig.response` exists for types/OpenAPI but not enforced at runtime.  
**Impact:** Low — developers may expect validation if they define response schemas.  
**Recommendation:** Document behavior OR add opt-in `validateResponses: true` dev mode.

---

### Issue #183: DX: Route-level middleware not processed by app runner
**Status:** 🔴 **OPEN** — Feature not implemented  
**Evidence:**
- `RouteConfig` has `middlewares?: unknown[]` field (router-def.ts:34)
- But `registerRoutes()` and `RouteEntry` in `app-runner.ts` don't process route-level middlewares
- Only global middlewares via `app.middlewares()` are resolved/run

**Impact:** Medium — Any app needing route-specific auth/authorization (e.g., admin-only endpoints) cannot use per-route middleware.

---

### Issue #182: DX: d.enum() should support reusable enum definitions
**Status:** 🔴 **OPEN** — Not implemented  
**Current:** Must repeat enum name + values in every table:
```typescript
status: d.enum('task_status', ['todo', 'in_progress', 'done'] as const)
```

**Desired:**
```typescript
const taskStatus = d.enumDef('task_status', ['todo', 'in_progress', 'done'] as const);
// Then: status: taskStatus.default('todo')
```

**Impact:** Low — DX improvement for multi-table enums.

---

### Issue #180: DX: s.coerce.number() not suggested when s.number() fails on string query params
**Status:** 🔴 **OPEN** — Not implemented  
**Problem:** Query params are always strings. `s.number()` fails with:
```json
{ "error": "BadRequestException", "message": "Expected number, received string" }
```
No hint about `s.coerce.number()`.

**Impact:** Medium — Every developer building paginated endpoints hits this.  
**Fix Options:**
- Contextual error hints
- Auto-coerce in query context
- Prominent docs

---

### Issue #179: DX: Enum value duplication between @vertz/db and @vertz/schema
**Status:** 🔴 **OPEN** — Not addressed  
**Problem:** Enums must be declared twice:
```typescript
// db/schema.ts
status: d.enum('task_status', ['todo', 'in_progress', 'done'] as const)

// schemas/task.schemas.ts
const taskStatus = s.enum(['todo', 'in_progress', 'done'] as const);
```
No compile-time check if they drift.

**Impact:** High — Runtime mismatch risk on every enum.  
**Ideal:** Framework-level bridge (e.g., `s.fromDbEnum(tasks._columns.status)`)

---

### Issue #83: Explore errors-as-values pattern for route handlers
**Status:** 🔴 **OPEN** — Design exploration  
**Context:** Currently exception-based (`throw NotFoundException`). Proposal: `Result<T, E>` pattern with typed error responses in route config.

**Benefits:**
- Type-safe error paths
- OpenAPI integration
- LLM-friendly (visible in signatures)
- Composable (no try/catch)

**Status:** Design discussion, not yet decided or implemented.

---

### Issue #51: Add typed routes, params, and response body to test app
**Status:** 🔴 **OPEN** — **Blocked by compiler**  
**Context:** Listed as "Blocked by Compiler (out of scope)" in `plans/vertz-testing-implementation.md:9-16`.  
**Requirements:**
- Typed route strings (autocomplete for `/users/:id`)
- Typed params/body/headers per route
- Typed response body discrimination

**Action:** Stays open until compiler generates route type information.

---

### Issue #50: Add .options() and .env() to createTestService
**Status:** 🔴 **OPEN** — **Blocked by core types**  
**Current:** `createTestService()` only supports `.mock()` (test-service.ts).  
**Needed:**
```typescript
const methods = await createTestService(authService)
  .mock(dbService, mockDb)
  .options({ maxLoginAttempts: 3 })
  .env({ JWT_SECRET: 'test-secret' });
```

**Blocker:** `ServiceDef` in `@vertz/core` doesn't have `options` or `env` fields yet (only `inject`, `onInit`, `methods`, `onDestroy`).

**Action:** Stays open until core types support service options/env.

---

## Summary by Category

| Category | Count | Issues |
|----------|-------|--------|
| ✅ **CLOSE** | 4 | #265, #245, #75, #70 |
| 🔄 **UPDATE** | 5 | #207, #206, #205, #204, #203 |
| 🔴 **OPEN** | 8 | #185, #183, #182, #180, #179, #83, #51, #50 |
| **Total** | **17** | |

---

## Recommendations

### Immediate Actions (P0)
1. **Close resolved issues** (#265, #245, #75, #70) — Need GitHub permissions or manual close
2. **Update postgres issues** (#206, #205, #203) — Add status comments noting they remain unfixed

### High Priority (P1)
- **#179** — Enum duplication is a runtime safety issue affecting every app with enums
- **#183** — Route-level middleware blocks auth/authorization patterns

### Medium Priority (P2)
- **#180** — Low-hanging DX fruit (query param coercion hints)
- **#207** — Test isolation improves CI reliability

### Low Priority / Design Discussions
- **#185** — Response validation (document or design opt-in mode)
- **#83** — Errors-as-values (design exploration, not blocking)
- **#182** — Reusable enums (nice-to-have DX)

### Blocked
- **#51**, **#50** — Waiting on compiler and core type system updates

---

## Notes

**GitHub Permissions Issue:**  
Attempted to close issues via `gh issue close` but encountered:
```
GraphQL: Resource not accessible by integration (addComment)
```

Bot token lacks `issues:write` permission. Manual close or token permission update needed.

**Process Quality:**  
Recent work (Turborepo migration, Zero-Config SSR, create-vertz-app) has excellent follow-through — issues are being resolved and shipped. Postgres driver issues from original PR #202 review remain the main backlog.

---

**Triaged by:** @auditor  
**Date:** 2026-02-14 18:30 UTC  
**Tool:** Manual code inspection + git log + grep analysis
