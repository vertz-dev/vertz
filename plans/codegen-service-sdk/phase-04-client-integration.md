# Phase 4: Client Integration + Orchestrator

## Context

Phase 3 generated service SDK files. This phase wires them into the client generator and orchestrator so they appear in `createClient()`.

Link to design doc: `plans/codegen-service-sdk.md`

## Tasks

### Task 4a: Client Generator

**Files:**
- `packages/codegen/src/generators/client-generator.ts` (modified)
- `packages/codegen/src/__tests__/generators.test.ts` (modified)

**What to implement:**

- Import `create${Pascal}Sdk` from `./services/${name}` for each service
- Add services to `createClient()` return object: `${camelCase}: create${Pascal}Sdk(client)`
- Services don't receive `optimistic` handler
- Update README generator to list service methods
- No new subpath imports (`#generated/services`)

**Acceptance criteria:**
- [ ] `client.ts` imports service SDKs
- [ ] `createClient()` returns service SDKs alongside entity SDKs
- [ ] Services don't receive optimistic handler
- [ ] README lists service methods
- [ ] No `#generated/services` subpath in package.json

---

### Task 4b: Orchestrator Wiring

**Files:**
- `packages/codegen/src/generate.ts` (modified)
- `packages/codegen/src/__tests__/generate.test.ts` (modified)

**What to implement:**

- Add `ServiceTypesGenerator` and `ServiceSdkGenerator` to `runTypescriptGenerator()`
- Service types generated alongside entity types
- Service SDKs generated alongside entity SDKs

**Acceptance criteria:**
- [ ] `runTypescriptGenerator()` runs service generators
- [ ] Service files appear in generate result
- [ ] Existing entity generation unaffected
