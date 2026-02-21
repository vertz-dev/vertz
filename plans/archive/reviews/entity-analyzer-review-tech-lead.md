# Entity Analyzer Design Review — Tech Lead

**Reviewer:** Ben (Tech Lead)
**Date:** 2026-02-20
**Design Doc:** `entity-analyzer-design.md`
**Rating:** **Approve with Changes**

---

## Executive Summary

The design doc v2 has addressed most concerns from the three prior reviews. The approach is sound, and the schema resolution via ts-morph is feasible. However, there are several implementability gaps and one significant architectural concern that need resolution before an engineer can confidently implement this from the spec alone.

**Verdict:** Approve with Changes — Address the items below before handing off to implementation.

---

## 1. Implementability

### Can an engineer implement from this spec?

**Mostly yes**, but with significant gaps:

| Area | Status | Notes |
|------|--------|-------|
| EntityAnalyzer detection | ✅ Complete | `isEntityFile()` + `findEntityCalls()` with symbol resolution |
| EntityIR types | ✅ Complete | Full type definitions in §4.3 |
| Schema resolution | ⚠️ Partial | Approach is clear, but edge cases need more detail |
| Route injection | ✅ Complete | `entity-route-injector.ts` specified |
| Codegen integration | ⚠️ Partial | ir-adapter.ts changes specified, but SDK generator needs more detail |
| Compiler wiring | ✅ Complete | Clear sequence in §4.9 |

### What's Missing or Ambiguous

#### 1.1 `isFromImport()` Usage Not Shown

The design references `isFromImport()` from `import-resolver.ts` but doesn't show how it's used in practice:

```typescript
// The design shows this pattern:
if (expr.isKind(SyntaxKind.Identifier)) {
  return isFromImport(expr, '@vertz/server', 'entity');
}
```

**Problem:** We need to verify `isFromImport` actually handles aliased imports (`import { entity as e }`). Let me check the reference file...

From `schema-analyzer.ts` line 15:
```typescript
import { isFromImport } from '../utils/import-resolver';
```

This suggests `isFromImport` exists and is used. **Recommendation:** Show the actual `isFromImport` signature in the design or link to its implementation.

#### 1.2 Schema Resolution Code is Incomplete

The `resolveModelSchemas()` method in §4.5 is pseudo-code:

```typescript
const tableType = tableProp.getTypeAtLocation(modelExpr);
```

**Missing details:**
1. How do we get from `model: usersModel` to the actual type? The code assumes `modelExpr.getType()` works, but we need to verify ts-morph can resolve a variable reference to its type declaration.

2. The design says "look for table property" — but `ModelDef` has a `table` property containing `$response`, `$create_input`, `$update_input`. We need to verify this is accessible via ts-morph's type API.

3. **Edge case:** What if `model` is a type parameter or generic? The design says "unresolvable" but doesn't specify detection logic.

**Recommendation:** Add a subsection with "ts-morph API calls required" listing the exact methods needed.

#### 1.3 SDK Generator is Under-Specified

The design shows sample output:
```typescript
// Generated: sdk/entities/tasks.ts
export const tasks = {
  list: (params?: ListTasksParams) => client.get<TaskResponse[]>('/tasks', { params }),
  ...
};
```

**Missing:**
1. Where does `ListTasksParams` come from? From query schema?
2. What's the file structure? `sdk/entities/{name}.ts` or `sdk/{name}.ts`?
3. How is the client instantiated?
4. How do custom actions get typed?

**Recommendation:** Add a "SDK Generator Interface" subsection with the key function signatures.

#### 1.4 No `ir/builder.ts` Modification Details

The design adds `entities: EntityIR[]` to `AppIR` but doesn't show how to update `createEmptyAppIR()`.

From the reference `ir/types.ts`, `AppIR` currently is:
```typescript
export interface AppIR {
  app: AppDefinition;
  env?: EnvIR;
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
  schemas: SchemaIR[];
  dependencyGraph: DependencyGraphIR;
  diagnostics: Diagnostic[];
}
```

**Recommendation:** Show the exact diff to `ir/types.ts` and `ir/builder.ts`.

---

## 2. Review Concerns Addressed?

Let me evaluate each of the 10 review decisions from §8:

| # | Review Concern | Decision | Status |
|---|----------------|----------|--------|
| 1 | Import detection too naive | Use `isFromImport()` | ✅ Addressed — symbol resolution approach |
| 2 | Schema extraction deferred | Resolve model types in v0.1 | ✅ Addressed — §4.5 with fallback |
| 3 | Synthetic ModuleIR confusing | Entities first-class in IR | ✅ Addressed — `AppIR.entities` |
| 4 | ir-adapter doesn't process entities | Added entity handling | ⚠️ Partially — types added, but SDK generator needs work |
| 5 | Custom action routes not filtered | Filter by access | ✅ Addressed |
| 6 | No collision detection | `detectRouteCollisions()` | ✅ Addressed |
| 7 | No debugging story | `VERTZ_DEBUG=entities` | ✅ Addressed — §4.10 |
| 8 | No warning for dead entities | `ENTITY_NO_ROUTES` | ✅ Addressed |
| 9 | EntityRelationIR missing targetEntity | Deferred to v0.2 | ✅ Accepted |
| 10 | Import path versioning fragility | Accepted risk | ✅ Accepted |

**Remaining Open Items:**
- **#4:** The `CodegenEntityModule` type is defined but the SDK generator needs more specification
- **Schema resolution edge cases** (§4.5) — need verification that ts-morph can actually do what's claimed

---

## 3. Schema Resolution Feasibility

### Is the ts-morph approach realistic?

**Yes, with caveats.**

The approach in §4.5:
1. Get type of model expression (`modelExpr.getType()`)
2. Find `table` property
3. Extract `$response`, `$create_input`, `$update_input` properties
4. Convert to SchemaRef

### What the Reference Code Shows

From `packages/server/src/entity/types.ts`, `ModelDef` interface includes:
```typescript
interface ModelDef {
  table: {
    $response: Schema;
    $create_input: Schema;
    $update_input: Schema;
    // ... other table properties
  };
  relations: Record<string, RelationDef>;
}
```

So the type structure exists. The question is whether ts-morph can navigate it.

### Actual Limitations

1. **Imported models:** If `model: usersModel` imports `usersModel` from another file, ts-morph may fail to resolve the type without symbol tracing.

2. **Factory functions:** `model: createUserModel()` — the return type must be explicit, otherwise `getType()` returns `any` or `unknown`.

3. **Conditional expressions:** `model: env === 'prod' ? prodModel : devModel` — unresolvable, correctly falls back to unknown.

4. **Generic models:** `model: ModelDef<User>`. The `$response` type parameter needs instantiation.

### What Happens When Resolution Fails

The design correctly specifies:
1. Set `schemaRefs.resolved = false`
2. Emit `ENTITY_MODEL_UNRESOLVABLE` diagnostic
3. Codegen generates `unknown` types

This is the right fallback behavior. The SDK will work but be untyped.

### Verdict

**Feasible.** The approach will work for the common case (simple variable reference with explicit type). The fallback to `unknown` is acceptable for v0.1.

---

## 4. Test Plan Completeness

### Missing Test Cases

The test plan in §6 is comprehensive, but I found gaps:

| Gap | Severity | Missing |
|-----|----------|---------|
| Model from another file | High | No test for imported model type resolution |
| Factory model with return type | Medium | `model: createModel()` — needs explicit return type annotation |
| Model with generic params | Medium | `model: ModelDef<User>` — type parameter handling |
| Multiple entities, same model | Low | Two entities using the same model variable |
| Entity with no config object | Medium | `entity('name', someVariable)` — not object literal |
| Access rule dynamically constructed | Low | `access: getAccessRules()` — function call, not object literal |

### TDD Feasibility

**Yes, TDD is feasible from this spec**, but the engineer will need to add the edge cases above. The test structure is well-defined:

```typescript
// 6.1 Entity Detection & Extraction
// 6.2 Route Injection  
// 6.3 Codegen Integration
// 6.4 Debug Output
```

Each section has concrete assertions to write.

**Recommendation:** Add "Imported model resolution" and "Factory function model" to test plan.

---

## 5. Risk Areas

### What's Most Likely to Go Wrong

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **ts-morph type resolution fails on complex models** | High | Medium | Fallback to unknown works, but DX is poor |
| **ir-adapter doesn't handle entities correctly** | Medium | High | Must verify `entities` array flows through |
| **SDK generator not implemented** | Medium | High | Only types defined, generator not in scope |
| **Barrel re-export entities missed** | Medium | Low | Diagnostic emitted, documented limitation |
| **Route collision silently overwrites** | Low | High | Detection added, should catch at compile time |
| **Performance with 100+ entities** | Low | Medium | Should be acceptable, profile and optimize |

### The ir-adapter Gap

This is the most significant risk. Looking at `packages/codegen/src/ir-adapter.ts`:

```typescript
// Current: only processes modules
const modules: CodegenModule[] = appIR.modules.map((mod) => ({
  name: mod.name,
  operations: mod.routers.flatMap(...)
}));
```

The design adds `entities: CodegenEntityModule[]` to `CodegenIR`, but **the actual code path that populates this is not shown in detail**. The design shows sample output but not the implementation.

**Critical question:** Does the SDK generator exist, or does it need to be created?

The design says:
> "SDK generators produce entity-specific output"

But there's no `entity-sdk-generator.ts` in the file structure section (only listed in §5).

**Recommendation:** Confirm SDK generator is in scope and add to implementation plan.

---

## 6. Specific Nitpicks

### Naming Issues

1. **`entity-route-injector.ts`** — This name suggests it injects routes *for* entities, but it actually generates routes *from* entities. Consider `entity-route-generator.ts` or `entity-routes.ts`.

2. **`CodegenEntityOperation.kind`** — The design uses `'list' | 'get' | 'create' | 'update' | 'delete'`. Consider `'list' | 'get' | 'create' | 'update' | 'delete'` as `CRUDOperation` to match runtime terminology.

3. **Synthetic module name** — `__entities` with double underscore is odd. Consider `__entity_routes` or `:entities` (internal routing namespace style).

### Structural Issues

1. **§4.5 Schema Resolution** is pseudo-code, not implementable. Needs to be real TypeScript.

2. **Codegen IR types** (§4.8) define `CodegenEntityModule` but don't show how it integrates with the adapter's `adaptIR()` function.

3. **The "SDK Generator Interface"** section is missing entirely — should be in §4.8 or §5.

### Code Organization

The design lists files in §5 but doesn't specify:
- Where `entity-analyzer.ts` lives relative to other analyzers
- Whether `entity-route-injector.ts` is in `ir/` or a new `transforms/` directory
- Test file organization

---

## 7. Summary

### What's Good

- ✅ Review decisions adequately addressed (9/10)
- ✅ Schema resolution approach is sound with proper fallback
- ✅ First-class EntityIR design is clean
- ✅ Debug output story is complete
- ✅ Route filtering by access rules works
- ✅ Collision detection specified

### What Needs Work

1. **Implementability gaps:**
   - Show actual `isFromImport()` usage
   - Add "ts-morph API calls required" section
   - Detail SDK generator interface
   - Show `ir/types.ts` and `ir/builder.ts` diffs

2. **Testing gaps:**
   - Add imported model resolution tests
   - Add factory function model tests

3. **Risk mitigation:**
   - Confirm SDK generator is in scope
   - Verify ir-adapter entity handling works end-to-end

---

## Rating: Approve with Changes

The design is 90% ready. The remaining items are specification details, not fundamental design flaws. An engineer can proceed with confidence after these gaps are addressed.

**Required changes:**
1. Add §4.5.x: "ts-morph API Calls Required" with exact method signatures
2. Add §4.8.x: "SDK Generator Interface" with function signatures
3. Add §4.9.x: "IR Diff" showing exact changes to `ir/types.ts` and `ir/builder.ts`
4. Add §6.x: "Additional Test Cases" for imported models and factory functions
5. Confirm SDK generator implementation scope

**Estimated fix effort:** 0.5 day of spec work. Implementation can proceed in parallel once these are clarified.
