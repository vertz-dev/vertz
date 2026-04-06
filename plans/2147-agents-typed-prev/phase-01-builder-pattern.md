# Phase 1: Builder Pattern for Typed `ctx.prev`

## Context

Replace `workflow()` config-object API with a builder pattern so `ctx.prev` is strongly typed. This is the only phase — the change is contained to `packages/agents/src/` (4 files).

Design doc: `plans/2147-agents-typed-prev.md`

## Tasks

### Task 1: Type tests (RED)

**Files:**
- `packages/agents/src/types.test-d.ts` (modified)

**What to implement:**
Replace the existing step/workflow type tests (lines 210-276) with builder-pattern type tests covering all E2E acceptance criteria from the design doc.

**Acceptance criteria:**
- [ ] Positive: typed prev accumulation across 3+ steps
- [ ] Positive: single-step workflow
- [ ] Positive: workflow input typed in step callbacks
- [ ] Positive: step without output schema gives `{ response: string }`
- [ ] Positive: explicit `output: undefined` gives `{ response: string }`
- [ ] Negative: `@ts-expect-error` on nonexistent step
- [ ] Negative: `@ts-expect-error` on wrong property
- [ ] Negative: `@ts-expect-error` on wrong type assignment
- [ ] Negative: `@ts-expect-error` on approval-only step in prev
- [ ] All `@ts-expect-error` directives are "unused" (RED state)

---

### Task 2: Builder implementation (GREEN)

**Files:**
- `packages/agents/src/workflow.ts` (modified)

**What to implement:**
1. Add `Prettify<T>` utility type
2. Update `StepContext` to carry `TPrev` generic (with backward-compatible default)
3. Update `StepApprovalConfig` to carry generics (with backward-compatible defaults)
4. Create `WorkflowBuilder` class with `.step()` and `.build()` methods
5. Update `workflow()` to return `WorkflowBuilder`
6. Remove standalone `step()` factory
7. Remove `StepConfig` and `WorkflowConfig` interfaces

**Acceptance criteria:**
- [ ] All new type tests pass (GREEN)
- [ ] `workflow().step().build()` produces `WorkflowDefinition`
- [ ] `.step()` validates name eagerly (throws on invalid)
- [ ] `.step()` detects duplicate names eagerly
- [ ] `.build()` validates at least one step
- [ ] `build()` returns frozen `WorkflowDefinition`

---

### Task 3: Runtime test migration + export updates

**Files:**
- `packages/agents/src/workflow.test.ts` (modified)
- `packages/agents/src/index.ts` (modified)

**What to implement:**
1. Rewrite all `step()` factory tests as builder tests
2. Rewrite all `workflow()` factory tests as builder + `.build()` tests
3. Rewrite all `runWorkflow()` tests to construct workflows with builder
4. Remove `as` casts on `ctx.prev` and `ctx.workflow.input` in callbacks
5. Update `index.ts`: remove `step`, `StepConfig`, `WorkflowConfig` exports; add `WorkflowBuilder` type export

**Acceptance criteria:**
- [ ] All runtime tests pass
- [ ] All type tests pass
- [ ] `index.ts` exports updated
- [ ] No `as` casts in test callbacks for prev/input access
- [ ] Quality gates pass: `vtz test`, `vtz run typecheck`, `vtz run lint`
