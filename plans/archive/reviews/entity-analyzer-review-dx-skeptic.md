# DX Review: Entity Analyzer Design

**Reviewer:** Josh (DX Skeptic)  
**Date:** 2026-02-20  
**Files Reviewed:**
- `plans/entity-analyzer-design.md`
- `packages/server/src/entity/entity.ts`
- `packages/server/src/entity/types.ts`
- `packages/codegen/src/ir-adapter.ts`

---

## Rating: Request Changes

The design has solid foundations but lacks critical developer experience details that will determine whether this feature delights or frustrates developers. Several "unknown unknowns" need resolution before implementation.

---

## 1. SDK Output Quality

### What Works
- The generated method names (`list`, `get`, `create`, `update`, `delete`) follow intuitive REST conventions
- OperationId format (`listUsers`, `getTask`) is consistent with existing codegen patterns
- Custom actions like `sdk.tasks.archive(id, body)` map cleanly to routes

### Concerns

**Type Safety Gap (Critical)**
The design explicitly defers schema extraction from models to v0.2 (Open Question 2):

> "Should the analyzer resolve this to extract response/create/update schemas for route typing? Recommendation: Yes — follow the model variable... If unresolvable, emit a warning and use `unknown`."

This means the generated SDK will look typed but actually be `any` or have no meaningful type safety:

```typescript
// What we get (v0.1):
sdk.tasks.create(body: unknown): Promise<unknown>

// What developers expect (v0.2):
sdk.tasks.create(body: CreateTaskInput): Promise<TaskResponse>
```

**Recommendation:** This is the single most important DX issue. Without it, the SDK is a fake typing — it has the shape but not the substance. At minimum, emit a warning during SDK generation: "Entity '{name}' model types could not be resolved. SDK methods will use 'any' types."

**Custom Action Naming Ambiguity**
The design doesn't specify:
- How action names with underscores/kebab-case transform (`archive_old_tasks` → ?)
- Whether actions are PascalCase in SDK or preserved as-is

---

## 2. Error Messages

### Runtime vs Compiler Inconsistency

The runtime in `entity.ts` throws immediately:
```typescript
throw new Error(
  `entity() name must be a non-empty lowercase string matching /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
);
```

The compiler design emits a diagnostic:
```
ENTITY_INVALID_NAME: Entity name must match /^[a-z][a-z0-9-]*$/. Got: "{name}"
```

**Issues:**
1. **Different error sources** — Runtime throws, compiler warns. A developer with compiler-enabled CI won't catch runtime-thrown errors until deployment.
2. **Inconsistent patterns** — Some errors throw (missing model), others warn (config not object). Developer can't predict behavior.
3. **Error message duplication** — The regex pattern is in both runtime and compiler. If it changes, one will be wrong.

### Missing Diagnostic Cases

| Missing Case | Severity | Why It Matters |
|--------------|----------|----------------|
| Invalid model reference | Error | `model: notAModel` crashes at runtime with cryptic error |
| Malformed access rules | Warning only | `{ access: { list: "invalid" } }` silently ignored |
| Invalid relation config | Warning only | `{ relations: { owner: "invalid" } }` silently ignored |
| Action missing handler | None | `{ actions: { archive: { input, output } } }` — what happens? |
| Circular relations | None | No detection, runtime may hang |

**Recommendation:** Add these diagnostics before shipping. A "silent failure" DX is worse than a loud one.

---

## 3. Debugging

### The "What Happened?" Gap

When things go wrong, developers need to answer:
1. "Was my entity detected?" — No tooling to see detected entities
2. "Why wasn't a route generated?" — No "route skipped because access.delete === false" visibility
3. "What SDK was generated?" — No way to inspect codegen output locally

### What's Missing

**No Entity Debugging Story:**
- No `--verbose` flag to show entity extraction details
- No "entity detected" summary in compiler output
- No way to see the final `EntityIR` JSON

**Route Generation Opacity:**
The design says "Routes are only generated when `access[operation] !== 'false'`" but there's no log message when a route is skipped. A developer disabling delete must guess why `sdk.tasks.delete` doesn't exist.

**Recommendation:** Add a `--debug entities` / `VERTZ_DEBUG=entities` mode that outputs:
```
[entity-analyzer] Detected entity: "tasks" at tasks.ts:42
[entity-analyzer] Routes generated: listTasks, getTask, createTask, updateTask
[entity-analyzer] Route skipped: deleteTask (access.delete === false)
```

---

## 4. Edge Cases from DX Perspective

### Empty Entities (No CRUD, No Actions)
```typescript
const empty = entity('empty', { model: myModel, access: { list: false, get: false, create: false, update: false, delete: false } });
```

**Current behavior:** No routes generated.  
**SDK output:** `sdk.empty` — but with what methods? Empty object? Error?  
**DX issue:** Developer has an entity reference that does nothing. No warning that entity is effectively dead code.

**Recommendation:** Warn when entity has no generated routes: "Entity '{name}' has no accessible operations. Did you mean to disable all access rules?"

### Entities with Only Custom Actions
```typescript
const tasks = entity('tasks', { 
  model: myModel, 
  access: { list: false, get: false, create: false, update: false, delete: false },
  actions: { archive: { input, output, handler } }
});
```

**Current behavior:** Only `POST /tasks/:id/archive` route generated.  
**DX concern:** Is this a valid pattern? The design should explicitly call it out as supported.

### All CRUD Disabled But Has Relations
```typescript
const tasks = entity('tasks', { 
  model: myModel, 
  access: { list: false, get: false, create: false, update: false, delete: false },
  relations: { owner: { id: true, name: true } }
});
```

**Issue:** Relations are extracted but no routes exist to use them. Is this useful? Should it warn?

### Entities Inside domain() (Not Supported)
The design mentions this is v0.2:
> "Should entities within a `domain()` call get a module-level grouping? Recommendation: Yes, but v0.2."

**DX issue:** If developers use `domain()` now (from EDA), they won't understand why entities aren't detected. Add a warning: "Entities inside domain() are not yet supported. Place entities at module root for detection."

---

## 5. Consistency

### With Existing vertz Patterns

**Positive:**
- Diagnostic codes follow existing patterns (`ENTITY_*`)
- IR structure aligns with AppIR conventions
- Schema naming collision detection in ir-adapter is solid

**Concerns:**

**Synthetic "entities" Module**
All entity routes go to a synthetic `"entities"` module. This creates:
```
GET   /tasks         (module: entities)
POST  /tasks         (module: entities)
vs.
GET   /users         (module: users)  ← manually defined router
```

Inconsistent URL structure for developers. The design acknowledges this in Open Question 1 but defers.

**Route Path Convention**
Entity routes use lowercase with dashes:
- `GET /tasks` (entity: "tasks")
- `GET /task-items` (entity: "task-items")

Is this consistent with existing route conventions? No mention in design.

**Recommendation:** Document the routing conventions explicitly so developers know what URLs their entities will have.

---

## 6. Recommendations

### Must Fix (Before Implementation)

1. **Schema Extraction Priority**
   - Either implement full model type extraction for v0.1
   - Or emit clear warning in generated SDK that types are `any`
   - Document this limitation prominently

2. **Runtime/Compiler Error Alignment**
   - Make error messages identical between entity.ts and compiler
   - Decide: should compiler also throw (not just warn) for critical errors?
   - At minimum, ensure both report the same regex pattern

3. **Missing Diagnostics**
   - Add: Invalid model reference (not a variable)
   - Add: Invalid access rule value
   - Add: Action missing handler
   - Add: Empty entity (no routes)

4. **Debugging Story**
   - Add debug output for entity detection
   - Log when routes are skipped due to access rules
   - Document how to inspect generated SDK locally

### Should Fix (v0.1 or v0.2)

5. **Custom Action Naming Spec**
   - Document transformation rules
   - Add tests for edge cases ( underscores, numbers, etc.)

6. **domain() Support**
   - Warn when entities inside domain() aren't detected
   - Document workaround

7. **SDK Completeness**
   - Document what `sdk.{entity}` looks like for edge cases
   - Handle empty entities gracefully

### Nice to Have

8. **verbose Compiler Output**
   ```
   [compiler] Entity Analyzer
   [compiler]   ✓ Detected: 3 entities (tasks, users, orders)
   [compiler]   ✓ Routes generated: 12 (5 skipped due to access rules)
   ```

9. **IDE Integration Hints**
   - Add JSDoc to generated SDK? (`/** Get a task by ID */`)

---

## Summary

The Entity Analyzer design solves the core problem (compiler awareness of entities) but the DX details are thin. Without schema extraction, the SDK is a facade. Without debugging tools, developers are blind. Without edge case handling, production issues are likely.

**Verdict: Request Changes** — Address the schema extraction gap and add the debugging/diagnostic improvements before implementation.
