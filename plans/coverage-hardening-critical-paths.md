# Coverage Hardening: Security-Critical Server Paths

## Summary

Raise test coverage to 99%+ on 6 security-critical files in `@vertz/server`. Test-only changes — no production code modifications.

## Target Files

| File | Current | Target | Risk if untested |
|------|---------|--------|-----------------|
| `auth/index.ts` | 95.43% | 99%+ | Session hijack, OAuth bypass, MFA bypass |
| `auth/access-set.ts` | 92.39% | 99%+ | Billing overage bypass |
| `auth/billing/webhook-handler.ts` | 95.28% | 99%+ | Cross-tenant billing |
| `entity/tenant-chain.ts` | 91.14% | 99%+ | Cross-tenant data leak |
| `entity/access-enforcer.ts` | 94.48% | 99%+ | Access control bypass |
| `entity/crud-pipeline.ts` | 94.98% | 99%+ | Tenant boundary violation |

## API Surface

N/A — test-only changes. No public API modifications.

## Manifesto Alignment

- **Correctness over convenience** — hardening tests for code paths where bugs have the highest blast radius
- **Security by default** — tenant isolation, access enforcement, and auth flows must be provably correct

## Non-Goals

- Not raising coverage on non-critical files (schema builders, codegen)
- Not refactoring production code — testing existing behavior as-is
- Not fixing the 3 existing failing tests (separate issue)
- Cloud-mode files (`cloud-proxy.ts`, `cloud-jwt-verifier.ts`, `circuit-breaker.ts`) are tested in cloud integration suites — out of scope here
- `password.ts` (68% coverage) — uncovered lines are validation convenience branches (uppercase/number/symbol requirements), not security boundaries. Deferred.
- Cloudflare package (`tpr-routes.ts`, `handler.ts`) — edge-specific, lower blast radius than auth/billing/tenant

## Unknowns

None identified. All uncovered lines have been analyzed and test scenarios are concrete.

## POC Results

N/A — no POC needed for test coverage work.

## Type Flow Map

N/A — no new generic types introduced.

## E2E Acceptance Test

Coverage output from `bun test --coverage` showing all 6 files at 99%+ line coverage.

> **Note:** Line numbers in acceptance criteria are snapshots from the 2026-03-19 audit. Implementers should re-verify uncovered lines at the start of each phase via `bun test --coverage` rather than blindly targeting listed numbers.

---

## Implementation Plan

### Phase 1: Auth Handler — Session Races, Error Handler, Input Validation, CSRF

**File:** `auth/__tests__/auth-session-edge-cases.test.ts` (new)

Tests:
1. `GET /session` returns `{ session: null }` when user deleted after JWT issued
2. `POST /refresh` returns 401 `SESSION_EXPIRED` when user deleted between requests
3. Grace period path where `getCurrentTokens` returns null falls through to normal rotation
   - **Setup:** Supply a custom `sessionStore` wrapper where `getCurrentTokens` is stubbed to return `null` while `findByPreviousRefreshHash` returns a valid session. This simulates the race where two rapid refresh calls hit the grace window but the stored tokens have been cleared.
4. Handler returns 500 on unexpected internal error
   - **Setup:** Supply a custom `sessionStore` where `findById` throws an uncaught error. Send `GET /session` with valid cookies — the inner `getSession` handler passes errors up, and the outer catch at line 2473 should catch it. Verify: 500 with `{ error: 'Internal server error' }`.
5. Unsupported session strategy error (line 162)
   - Note: may be unreachable via public API if config validation prevents it. If so, document as excluded.
6. `revokeSession` when not authenticated → error (line 744)
   - **Setup:** Call `POST /signout` without any session cookies. Expect 401.
7. `PERMISSION_DENIED` and default cases in `authErrorToStatus` (lines 799-800)
   - **Setup:** Trigger a flow that produces `PERMISSION_DENIED` error code. May require access-denied in login flow (line 983).
8. `BadRequestException` catch in `parseJsonAuthBody` (line 845)
   - **Setup:** Send POST with non-JSON Content-Type and malformed body.
9. Malformed `Referer` header in CSRF check (line 870)
   - **Setup:** Send a request with `Referer: not-a-valid-url`. Expect CSRF warning logged.
10. `GET /session` returning 500 when `getSession()` fails (lines 1045-1048)
    - **Setup:** Supply custom store where session retrieval throws.
11. Each endpoint with uncovered `parseJsonAuthBody` returns 400 on malformed JSON:
    - `/mfa/verify-setup`, `/mfa/challenge`, `/mfa/backup-codes`, `/mfa/step-up`, `/mfa/disable`, `/verify-email`, `/forgot-password`, `/reset-password`, `/switch-tenant`

**Acceptance criteria:**
- Lines 162 (if reachable), 589, 643, 670, 744, 799-800, 845, 870, 983, 1045-1048, 1629, 1849, 2473-2476, and all parseJsonAuthBody lines covered

### Phase 2: Auth Handler — OAuth Error Paths and Rollback Failures

**File:** `auth/__tests__/oauth-error-paths.test.ts` (new)

Tests:
1. Corrupted OAuth cookie → `invalid_state` redirect
   - **Setup:** Send request to `/oauth/:provider/callback` with `vertz.oauth=garbage-non-decryptable-data` (NOT a valid encrypted state with wrong values — the cookie data itself must fail `decrypt()`). Expect 302 redirect with `error=invalid_state`.
2. Expired OAuth state → `invalid_state` redirect
   - **Setup:** Use `encrypt()` directly to create a state cookie with `expiresAt` set to a past timestamp. Set the cookie and hit callback. Expect 302 redirect with `error=invalid_state`. This avoids `Date.now()` mocking.
3. `onUserCreated` throws + rollback `unlinkAccount` also throws → logs error, returns error redirect
   - **Setup:** Create a wrapper around `InMemoryOAuthAccountStore` where `unlinkAccount` throws. Configure `onUserCreated` to throw. Complete an OAuth flow with a new user. Expect 302 redirect with `error=user_setup_failed`, plus `console.error` called for the rollback failure.
4. `onUserCreated` throws + rollback `deleteUser` also throws on email signup → logs error, returns error
   - **Setup:** Create a wrapper around `InMemoryUserStore` where `deleteUser` throws. Configure `onUserCreated` to throw. Sign up with email/password. Expect 400 with `CALLBACK_FAILED`, plus `console.error` for rollback.
   - **Correction from review:** OAuth rollback (test #3) returns 302 redirect, not 400. Email signup rollback (test #4) returns 400.
5. User deleted between OAuth create and findById → `user_info_failed` redirect
   - **Setup:** Create a wrapper around `InMemoryUserStore` where `findById` returns null after `createUser` succeeds (e.g., counter-based — first call works, second returns null). Expect 302 redirect with `error=user_info_failed`.

**Acceptance criteria:**
- Lines 425, 1343-1349, 1379-1384, 1469-1472, 1477, 1494-1500 covered

### Phase 3: Auth Handler — MFA Edge Cases and Password Management

**File:** `auth/__tests__/mfa-edge-cases.test.ts` (new)

Tests:
1. MFA challenge with no TOTP secret → 400 `MFA_NOT_ENABLED`
   - **Setup:** Create user, trigger MFA challenge cookie (by signing in with password when MFA is "expected" but never actually enabled), call `/mfa/challenge` with the cookie. The `mfaStore.getSecret()` returns null.
2. MFA challenge with corrupted encrypted secret → 500
   - **Setup:** Supply a custom `mfaStore` (pre-populated via config override) where `getSecret()` returns a non-null but non-decryptable string. Create a valid MFA challenge cookie via `encrypt()`. Send challenge request. Expect 500.
3. MFA challenge with backup code (not step-up flow)
   - **Setup:** Enable MFA, get backup codes, trigger MFA challenge (not step-up), submit a backup code instead of TOTP code. Expect success.
4. MFA challenge with invalid code → 400 `MFA_INVALID_CODE`
   - **Setup:** Enable MFA, trigger challenge, submit wrong code. Expect 400.
5. User deleted after MFA challenge succeeds → 500
   - **Setup:** Enable MFA, trigger challenge, then wrap `userStore.findById` to return null after MFA verification. Submit valid code. Expect 500 `User not found`.
6. Pending MFA setup expired → 400
   - **Setup:** Call `/mfa/setup` to create pending entry. Mock `Date.now()` to advance >10 minutes. Call `/mfa/verify-setup` with a code. Expect 400 `MFA_NOT_ENABLED` (pending entry found but expired, triggering the cleanup at line 1786). **Restore `Date.now()` after test.**
7. Passwordless account cannot disable MFA → 401
   - **Setup:** Create user via OAuth (no password hash), enable MFA, attempt `POST /mfa/disable`. The `stored.passwordHash` is null, so password verification fails.
8. Passwordless account cannot regenerate backup codes → 401
   - **Setup:** Same as above but for `POST /mfa/backup-codes`.
9. TOTP decryption failure during step-up → 500
   - **Setup:** Same corrupted secret approach as test #2, but target `/mfa/step-up` endpoint.

**Acceptance criteria:**
- Lines 1638-1641, 1647-1650, 1664, 1669-1672, 1678-1681, 1786-1793, 1798, 1856-1860, 1908-1912, 2019-2022 covered
- Re-verify line numbers at implementation time — some may have shifted

### Phase 4: Billing & Tenant Chain — Access Set, Webhooks, Chain Resolution

**Files:**
- `auth/__tests__/access-set-addons.test.ts` (new)
- `auth/__tests__/billing/webhook-metadata.test.ts` (new)
- `entity/__tests__/tenant-chain-edge-cases.test.ts` (new)

Tests (access-set):
1. Add-on features accumulated in access set
2. Add-on limits stack (10 + 5 = 15)
3. Unlimited limits (`max: -1`) report correctly
4. Lifetime limits (no `per`) use subscription start to far-future end

Tests (webhook — tested through public `createWebhookHandler` API, not private helpers):
5. Invoice event extracts tenant from nested `subscription_details.metadata`
6. Plan ID extracted from `items.data[0].price.metadata`
7. Checkout without `attachAddOn` method falls back to `assign`

Tests (tenant-chain):
8. Direct tenant scope (entity → root)
9. Broken chain returns null
10. PK defaults to `'id'` when no primary metadata

**Acceptance criteria:**
- access-set lines 200-203, 239-244, 252-259, 263-265 covered
- webhook-handler lines 44, 46, 60, 154 covered
- tenant-chain lines 63, 93, 135, 145, 158-160 covered

### Phase 5: Access Enforcer & CRUD Pipeline — SkipWhere, Tenant Traversal

**Files:**
- `entity/__tests__/access-enforcer-skipwhere.test.ts` (new)
- `entity/__tests__/crud-pipeline-tenant.test.ts` (new)

Tests (enforcer):
1. Unknown user marker resolves to undefined (requires type-cast: `{ __marker: 'user.unknown' } as UserMarker`)
2. `skipWhere` with `any()` composition passes when non-where sub-rule passes
3. `any()` with `skipWhere` denies when all sub-rules fail
4. Function rules evaluated normally with `skipWhere`

Tests (CRUD pipeline):
5. PK fallback to `'id'` when no primary metadata
6. Multi-hop tenant traversal (3-level chain: comments → tasks → projects)
7. Missing parent FK returns error on create
8. Non-existent parent returns error on create

**Acceptance criteria:**
- access-enforcer lines 35, 95, 135-139, 152-153 covered
- crud-pipeline lines 41, 185-190, 307-311 covered

### Dependency Graph

All 5 phases are fully independent. No dependencies between them.

### Definition of Done

- [ ] All 6 files at 99%+ line coverage (verified via `bun test --coverage`)
- [ ] All existing tests still pass
- [ ] Quality gates clean (test + typecheck + lint)
- [ ] Adversarial review completed
- [ ] PR to main with coverage before/after comparison

---

## Review History

### Rev 1 (2026-03-19)

**DX (josh):** APPROVE
- Minor: consider splitting Phase 1 if file grows large
- Minor: `access-set-addons.test.ts` could be `access-set-limits.test.ts`

**Product/Scope:** CHANGES REQUESTED → addressed in Rev 2
- BLOCKER: ~9 uncovered lines in auth/index.ts not in any phase → added to Phase 1
- SHOULD-FIX: Phase 3 criteria referenced possibly-covered lines → added re-verify note
- SHOULD-FIX: Non-Goals missing cloud-mode explanation → added

**Technical:** CHANGES REQUESTED → addressed in Rev 2
- BLOCKER: Phase 1 test #3 (grace period) needs custom sessionStore → documented
- BLOCKER: Phase 3 test #2 (corrupted MFA secret) needs custom mfaStore → documented
- BLOCKER: Phase 3 test #6 (pending MFA expired) needs Date.now() mocking → documented
- SHOULD-FIX: Phase 2 rollback tests need custom store wrappers → documented
- SHOULD-FIX: Phase 2 test #4 expected 302 not 400 for OAuth rollback → corrected
- SHOULD-FIX: Phase 1 test #4 needs specific store/endpoint for outer catch → documented
- SHOULD-FIX: Phase 2 test #1 needs garbage cookie data not wrong state → clarified
- SHOULD-FIX: Phase 2 test #2 needs encrypt() for expired state → documented
- MINOR: Phase 4 webhook tests go through public API → noted
- MINOR: Phase 5 unknown marker needs type-cast → noted
