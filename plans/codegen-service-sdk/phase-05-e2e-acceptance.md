# Phase 5: E2E Acceptance + Example App

## Context

All generators are wired. This phase validates the full pipeline end-to-end and updates the example app.

Link to design doc: `plans/codegen-service-sdk.md`

## Tasks

### Task 5a: Integration Test

**Files:**
- `packages/codegen/src/__tests__/integration.test.ts` (modified)
- `packages/codegen/src/__tests__/service-sdk.test-d.ts` (new)

**What to implement:**

- E2E test: construct AppIR with services, run full codegen pipeline, verify all generated files
- Test service with POST + body, GET + path params, DELETE + path params
- Test access rule filtering: no rule → excluded, false → excluded, function → included
- Type-level tests: `@ts-expect-error` on wrong types, missing fields
- Test multiple path params ordered correctly

**Acceptance criteria:**
- [ ] Full pipeline generates correct service SDK files
- [ ] Access filtering works end-to-end
- [ ] Path params extracted correctly in generated code
- [ ] Type-level tests pass with @ts-expect-error
- [ ] Services appear in client.ts output

---

### Task 5b: Example App Update

**Files:**
- `examples/entity-todo/` (modified — update to use generated webhook SDK)

**What to implement:**

- Verify entity-todo example has webhooks service definition
- If codegen is configured, verify it generates webhook SDK
- Update any manual fetch calls to use generated SDK

**Acceptance criteria:**
- [ ] entity-todo example uses generated webhooks SDK (or documents how to)
- [ ] Quality gates pass on example
