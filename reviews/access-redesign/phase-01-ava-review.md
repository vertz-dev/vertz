# Phase 01 Review — ava (Quality/Tests)

## Scope
Test coverage, TDD compliance, quality gates, integration test rewrites.

## Findings

### Blockers
None.

### Should-Fix

1. **No runtime enforcement of lowercase entity names** — Tests use lowercase entity names by convention, and the test `entity names are lowercase in the new API` checks that the hierarchy output contains lowercase names. But there's no validation in `defineAccess()` that rejects `Organization` (uppercase). A user could pass uppercase names and it would work fine at the `defineAccess()` level but break integration with closure/role stores if they used different casing. Consider adding a validation rule that entity names must be lowercase.

### Observations

- **TDD compliance**: 31 unit tests in `define-access.test.ts` covering all 11 validation rules plus callback format, flags preservation, plans passthrough, hierarchy inference, and freeze behavior. Each behavior has its own test.
- **Type-level tests**: Both `define-access.test-d.ts` (server) and `resource-hierarchy.test-d.ts` (integration) include `@ts-expect-error` negative tests for invalid inputs.
- **Integration test coverage**: 3 integration test files updated:
  - `resource-hierarchy.test.ts` (17 tests) — full E2E with ctx.can/check/authorize/canAll
  - `auth-access-set.test.ts` (10 tests) — JWT, access-set endpoint, encode/decode, client-side
  - `reactive-invalidation.test.ts` (10 tests) — feature flags, access event broadcaster
- **All tests use public imports** (`@vertz/server`, `@vertz/ui/auth`) — no internal imports in integration tests.
- **Quality gates all pass**: 104 auth tests, 37 integration tests, typecheck clean for both `@vertz/server` and `@vertz/integration-tests`.
- **Pre-existing failures**: 3 MFA test timeouts are pre-existing and unrelated to this change.

### Verdict
**Pass.** Test coverage is thorough. Minor enforcement gap for lowercase entity names can be addressed as a follow-up validation rule.
