# Post-Implementation Review: Core Schema Validation Gap

**Date**: 2026-02-07
**Reviewer**: Claude (Haiku 4.5)
**Context**: Discovered while fixing typecheck issues after compiler Phase 9 implementation

---

## Gap Summary

**Schema validation was defined but never wired up to request handling.**

Routes can define schemas for params, query, headers, and body, but these schemas were stored in `RouteConfig` and then **completely dropped** during route registration. Handlers received raw, unvalidated string values instead of parsed, typed values.

---

## What Was Missing

### 1. Schemas Not Stored in RouteEntry

**Location**: `packages/core/src/app/app-runner.ts:72-77`

```typescript
// BEFORE (gap):
const entry: RouteEntry = {
  handler: route.config.handler,
  options: options ?? {},
  services: resolvedServices,
  // ❌ Schemas from route.config are lost here
};
```

**Impact**: Schemas defined in routes were thrown away, never reaching the request handler.

### 2. No Validation in Request Flow

**Location**: `packages/core/src/app/app-runner.ts:143-159`

```typescript
// BEFORE (gap):
const ctx = buildCtx({
  params: match.params,        // ❌ Raw strings from URL
  body,                         // ❌ Raw parsed JSON
  query: parsed.query,          // ❌ Raw query strings
  headers: parsed.headers,      // ❌ Raw header strings
  // ...
});

const result = await entry.handler(ctx); // Handler gets unvalidated data
```

**Impact**: Handlers received raw values. No type safety. Runtime errors instead of 400 Bad Request.

### 3. Type Mismatch Hidden the Problem

**Location**: `packages/core/src/types/context.ts:11-14`

```typescript
// BEFORE (wrong types):
export interface HandlerCtx {
  params: Record<string, string>;   // ❌ Should be unknown (post-validation)
  query: Record<string, string>;    // ❌ Should be unknown
  headers: Record<string, string>;  // ❌ Should be unknown
  body: unknown;                     // ✅ Correct
  // ...
}
```

**Impact**: TypeScript accepted raw strings being passed where parsed types should be, hiding the gap.

---

## Root Cause Analysis

### Why Did This Happen?

1. **Feature scaffolding without integration**: The schema system was built, but integration points were never connected
2. **Lack of end-to-end tests**: Unit tests passed for individual components, but no test verified the full request → validation → handler flow
3. **Type system didn't catch it**: `Record<string, string>` is assignable to `Record<string, unknown>`, so the mismatch went unnoticed
4. **Implementation before tests**: Core request handling was implemented before schema validation tests existed

### When Did It Happen?

- `RouteConfig` was defined with schema fields (params, query, headers, body)
- Route registration was implemented
- **Gap**: The connection between these two was never made

---

## How We Found It

While fixing typecheck issues after compiler Phase 9:
1. Noticed `CtxConfig` had `Record<string, unknown>` but `HandlerCtx` expected `Record<string, string>`
2. Traced back to understand what the correct types should be
3. Realized schemas exist in route config but are never used
4. Searched for where `route.config.params` is accessed → **nowhere in the runtime code**

---

## The Fix

### Minimal Implementation (TDD Approach)

**Test First** (RED):
```typescript
it('validates params using schema when provided', async () => {
  const paramsSchema = {
    parse: (value: unknown) => {
      const params = value as Record<string, string>;
      const id = Number(params.id);
      if (Number.isNaN(id)) throw new BadRequestException('Invalid id');
      return { id }; // Parsed to number
    },
  };

  router.get('/:id', {
    params: paramsSchema,
    handler: (ctx) => {
      receivedParams = ctx.params;
      return { success: true };
    },
  });

  const response = await app.handler(new Request('http://localhost/users/123'));

  expect(receivedParams).toEqual({ id: 123 }); // Should be number, not "123"
});
```

**Implementation** (GREEN):
1. Add `paramsSchema` to `RouteEntry`
2. Store schema during route registration
3. Validate before `buildCtx`: `entry.paramsSchema?.parse(match.params)`
4. Pass validated value to handler

**Status**: ✅ One test passing. More tests needed for query, headers, body, error handling.

---

## Lessons Learned

### What Went Wrong

1. **No integration tests**: Unit tests for schemas ✅, unit tests for routing ✅, but no test for schemas + routing together
2. **TDD violation**: Implementation written before tests, allowing gaps to slip through
3. **Incomplete planning**: Route registration implementation didn't include schema handling in the spec

### What Would Have Caught This

✅ **End-to-end test** showing a route with a schema and verifying the handler receives parsed values
✅ **Type-level test** using `@ts-expect-error` to verify handler ctx has inferred types
✅ **Integration test** in the plan: "Route with param schema → handler receives number, not string"
✅ **Strict TDD**: Writing test first would have immediately revealed the gap

### What We're Doing Differently

1. **Strict TDD going forward**: One test at a time, red-green-refactor
2. **Integration tests in plans**: Every phase must include at least one end-to-end test
3. **Type-level tests**: Use `@ts-expect-error` and `.test-d.ts` files to verify type inference
4. **Explicit integration checkpoints**: Plans must call out where components connect

---

## Remaining Work

### Immediate (Current PR)
- [ ] Add test: query validation
- [ ] Add test: headers validation
- [ ] Add test: body validation
- [ ] Add test: validation error handling (BadRequestException)
- [ ] Add test: multiple schemas at once
- [ ] Add test: no schema = no validation (backward compat)

### Next PR (Task #86)
- [ ] Add type inference so `ctx.params` is typed based on schema
- [ ] Make `RouteConfig` generic over schema types
- [ ] Create `TypedHandlerCtx` computed type
- [ ] Write type-level tests to verify inference works

---

## Prevention Strategy

### For Future Phases

1. **Add integration tests to every phase plan**
   - Don't just test components in isolation
   - Test the full flow through the system

2. **Use type-level tests proactively**
   - Don't wait for typecheck failures
   - Write `@ts-expect-error` tests as part of TDD

3. **Review connections between phases**
   - Before marking a phase complete, check: "Does the next phase assume something I didn't deliver?"
   - Explicitly test integration points

4. **Enforce strict TDD**
   - Red → Green → Refactor, one test at a time
   - No exceptions, even for "obvious" implementations

### Questions to Ask During Implementation

- [ ] "Is there a test that exercises the full path through the system?"
- [ ] "Are all the pieces connected, or did I just build them?"
- [ ] "If I'm storing config, where does it get used?"
- [ ] "Do my types reflect the actual runtime behavior?"

---

## Conclusion

This gap existed because we built components without connecting them. The fix is straightforward, but the lesson is critical: **unit tests alone are not enough**. We need integration tests that verify the pieces work together, not just in isolation.

Going forward: strict TDD + integration tests in every phase plan + type-level tests for inference.
