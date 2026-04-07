# Phase 1: Compiler IR Enhancement + Wiring

## Context

The codegen pipeline needs services in `AppIR` to generate SDK methods. Currently, `ServiceIR` is too shallow (old `methods` pattern), the `ServiceAnalyzer` looks for `moduleDef.service()` instead of standalone `service()`, and the analyzer isn't wired into the compiler pipeline at all. This phase fixes all three gaps.

Link to design doc: `plans/codegen-service-sdk.md`

## Tasks

### Task 1a: IR Types + Analyzer Restructure

**Files:**
- `packages/compiler/src/ir/types.ts` (modified)
- `packages/compiler/src/analyzers/service-analyzer.ts` (modified)
- `packages/compiler/src/analyzers/__tests__/service-analyzer.test.ts` (modified)

**What to implement:**

1. Add `ServiceActionIR` interface to IR types:
   ```typescript
   export interface ServiceActionIR {
     name: string;
     method: HttpMethod;
     path?: string;
     body?: SchemaRef;
     response?: SchemaRef;
   }
   ```

2. Update `ServiceIR` — replace `methods: ServiceMethodIR[]` with `actions: ServiceActionIR[]`, add `access`:
   ```typescript
   export interface ServiceIR extends SourceLocation {
     name: string;
     inject: InjectRef[];
     actions: ServiceActionIR[];
     access: Record<string, EntityAccessRuleKind>;
   }
   ```
   Note: drop `moduleName` — services are standalone, not module-scoped.

3. Add `services: ServiceIR[]` to `AppIR` (alongside `entities`).

4. Restructure `ServiceAnalyzer`:
   - Replace `analyzeForModule()` with global `analyze()` that scans all files
   - Find standalone `service('name', {...})` calls imported from `@vertz/server` — follow `EntityAnalyzer.findEntityCalls()` pattern
   - Extract service name from first string argument (not variable name)
   - Parse `actions:` property — iterate properties, find `action()` calls, extract `method`, `path`, `body`, `response`
   - Parse `access:` property — map action names to `EntityAccessRuleKind`

**Acceptance criteria:**
- [ ] `ServiceActionIR` type exists with name, method, path?, body?, response?
- [ ] `ServiceIR.actions` replaces `ServiceIR.methods`
- [ ] `AppIR.services` field exists
- [ ] Analyzer finds standalone `service()` calls from `@vertz/server`
- [ ] Analyzer extracts service name from first string argument
- [ ] Analyzer parses actions with body/response schema refs
- [ ] Analyzer parses access rules per action
- [ ] All existing service-analyzer tests updated to new pattern

---

### Task 1b: Wire into Compiler Pipeline

**Files:**
- `packages/compiler/src/compiler.ts` (modified)
- `packages/compiler/src/index.ts` (modified)

**What to implement:**

1. In `Compiler.analyze()`, call `analyzers.service.analyze()` and assign result to `ir.services`
2. Export `ServiceActionIR` from `@vertz/compiler` package index

**Acceptance criteria:**
- [ ] `Compiler.analyze()` populates `appIR.services` from ServiceAnalyzer
- [ ] `ServiceActionIR` exported from `@vertz/compiler`
- [ ] Existing compiler tests still pass
- [ ] Quality gates pass: `vtz test packages/compiler && vtz run typecheck`
