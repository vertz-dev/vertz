# Security Auth Hardening — Implementation Plan

**Design doc:** [plans/security-auth-hardening.md](./security-auth-hardening.md)
**Package focus:** `@vertz/server`, `@vertz/core`

---

## Dependency Map

```txt
Phase 1: Signup privilege stripping + immediate session revocation
  |
  '--> Phase 2: Cache headers + forgot-password timing + bounded body parsing
         |
         '--> Phase 3: Dependency uplift + audit/test cleanup
```

All phases are sequential because Phase 2 depends on the new session-validation and parser behavior being stable first, and Phase 3 closes the audit only after runtime fixes are in place.

---

## Phase 1: Signup Privilege Stripping + Immediate Revocation

**What it implements**

- Remove `role` from the public `SignUpInput` type
- Strip reserved framework-owned sign-up fields (`role`, `plan`, `emailVerified`, identity metadata)
- Add active-session lookup to `SessionStore`
- Make `getSession()` deny revoked/expired/mismatched session records
- Preserve current refresh flow and current auth cookies

### Files

- `packages/server/src/auth/types.ts`
- `packages/server/src/auth/index.ts`
- `packages/server/src/auth/session-store.ts`
- `packages/server/src/auth/db-session-store.ts`
- `packages/server/src/auth/__tests__/dual-token.test.ts`
- `packages/server/src/auth/__tests__/handler-edge-cases.test.ts`
- `packages/integration-tests/src/__tests__/auth-dual-token.test.ts`

### TDD cycles

1. **RED:** sign-up with `role`, `plan`, and `emailVerified` returns elevated user data
   **GREEN:** strip reserved fields and force default role

2. **RED:** `SignUpInput` still accepts `role`
   **GREEN:** remove the public type field and add type regression coverage

3. **RED:** `signOut()` revokes the store record but `getSession()` still returns the old session
   **GREEN:** add active-session lookup to `getSession()`

4. **RED:** revoked session after `DELETE /sessions/:id` or password reset still authenticates
   **GREEN:** use the same active-session check across those paths

### Integration acceptance

- Integration test: sign-up ignores reserved privilege fields
- Integration test: `signOut()` immediately nulls `GET /session`
- Integration test: revoked session ID immediately nulls `GET /session`
- Integration test: password reset revocation immediately nulls prior session

### Phase gate

- `bun test packages/server/src/auth/__tests__/dual-token.test.ts`
- `bun test packages/server/src/auth/__tests__/handler-edge-cases.test.ts`
- `bun test packages/integration-tests/src/__tests__/auth-dual-token.test.ts`
- `bun run --filter @vertz/server typecheck`
- `bunx biome check packages/server/src/auth`

---

## Phase 2: Cache Headers + Forgot-Password Timing + Bounded Body Parsing

**What it implements**

- Stream-bounded body parsing in `@vertz/core`
- Reuse bounded parsing from auth routes instead of raw `request.json()`
- Make `/api/auth/access-set` private and vary on cookies while keeping `ETag`
- Remove forgot-password delivery timing from the request path and add a response floor

### Files

- `packages/core/src/server/request-utils.ts`
- `packages/core/src/server/__tests__/request-utils.test.ts`
- `packages/server/src/auth/index.ts`
- `packages/server/src/auth/__tests__/handler-edge-cases.test.ts`
- `packages/server/src/auth/__tests__/access-set-jwt.test.ts`

### TDD cycles

1. **RED:** body parser accepts oversized streamed payload with missing/misleading `Content-Length`
   **GREEN:** read the stream with a hard byte cap

2. **RED:** auth `/signup` and `/signin` still use unbounded `request.json()`
   **GREEN:** route them through bounded parsing helpers

3. **RED:** `/access-set` lacks `private`/`Vary: Cookie`
   **GREEN:** add private cache headers without breaking `304`

4. **RED:** forgot-password timing differs because `onSend()` is awaited only on existing users
   **GREEN:** fire-and-forget send path, do symmetric token work, and apply a minimum response floor

### Integration acceptance

- Unit test: bounded parser rejects oversized JSON without trusting only `Content-Length`
- Auth handler test: oversized sign-up/sign-in body returns `400`
- Auth test: `/access-set` returns `Cache-Control: private, no-cache` and `Vary: Cookie`
- Auth test: forgot-password responds before a slow `onSend()` resolves and still returns `200`

### Phase gate

- `bun test packages/core/src/server/__tests__/request-utils.test.ts`
- `bun test packages/server/src/auth/__tests__/handler-edge-cases.test.ts`
- `bun test packages/server/src/auth/__tests__/access-set-jwt.test.ts`
- `bun run --filter @vertz/core typecheck`
- `bun run --filter @vertz/server typecheck`
- `bunx biome check packages/core/src/server packages/server/src/auth`

---

## Phase 3: Dependency Uplift + Audit Closure

**What it implements**

- Upgrade the vulnerable `happy-dom` path in `packages/ui-server`
- Refresh the `vitest`/lockfile chain so `rollup` is no longer pulled at a vulnerable range
- Re-run dependency audit and targeted security regressions
- Update public auth docs to stop advertising privileged sign-up field pass-through

### Files

- `package.json`
- `bun.lock`
- `packages/ui-server/package.json`
- `docs/guides/authentication.md`
- `packages/docs/guides/ui/auth.mdx`

### TDD / validation cycles

1. **RED:** `bun audit` reports `happy-dom` / `rollup`
   **GREEN:** upgrade affected dependencies until audit is clean or reduced to unrelated findings

2. **RED:** docs still state sign-up blindly passes through `...extra`
   **GREEN:** document reserved-field stripping and profile-only intent

### Integration acceptance

- `bun audit` no longer reports the audited `happy-dom` and `rollup` advisories
- auth docs no longer advertise public privilege field pass-through
- all targeted regression tests from Phases 1 and 2 remain green

### Phase gate

- `bun audit`
- `bun run --filter @vertz/server test`
- `bun run --filter @vertz/core test`
- `bun run --filter @vertz/integration-tests test`
- `bun run typecheck`
- `bun run lint`

---

## Review Artifacts

Write one local review file after each phase:

- `reviews/security-auth-hardening/phase-01-signup-and-revocation.md`
- `reviews/security-auth-hardening/phase-02-cache-timing-body.md`
- `reviews/security-auth-hardening/phase-03-dependencies-and-docs.md`

Each review records:

- commit range or working diff scope
- tests and gates run
- security checklist
- findings and resolution

---

## Developer Walkthrough

1. Create an auth instance with email/password enabled.
2. Attempt sign-up with reserved fields; confirm they do not elevate privileges.
3. Sign in, then sign out; confirm the old JWT no longer authenticates `GET /session`.
4. Request `/api/auth/access-set`; confirm it is `private`, varies on cookies, and revalidates with `ETag`.
5. POST an oversized auth payload; confirm a bounded `400` instead of full-body parsing.
