# Entity Analyzer Design Review — Devil's Advocate

**Reviewer:** Devil's Advocate (sub-agent)  
**Date:** 2026-02-20  
**Design Doc:** `entity-analyzer-design.md`  
**Rating:** **Request Changes**

---

## Executive Summary

The Entity Analyzer design fills a legitimate gap — the compiler currently has no awareness of `entity()` definitions. However, the proposed implementation has **significant architectural and practical issues** that must be addressed before approval. The core problem is that the design makes incorrect assumptions about downstream consumers (especially `ir-adapter.ts`) and uses a brittle abstraction (synthetic ModuleIR) that creates more problems than it solves.

---

## 1. Architectural Risk

### 1.1 The "No Changes to ir-adapter.ts" Claim is False

**The design states:** "By injecting entity-generated routes as standard RouteIR nodes, no changes to ir-adapter.ts are needed for v0.1."

**Reality:** The ir-adapter.ts **only processes `appIR.modules`**. Look at line 38:

```typescript
const modules: CodegenModule[] = appIR.modules.map((mod) => ({
  name: mod.name,
  operations: mod.routers.flatMap    router.routes.map((route) => { /* ... */((router) =>
 }),
  ),
}));
```

There is **no handling of `appIR.entities`** anywhere in the adapter. If you add `entities: EntityIR[]` to `AppIR` but don't inject entity routes into real `ModuleIR` objects, **they will be completely ignored by codegen**.

**The design tries to work around this** by saying "These routes are injected into a synthetic ModuleIR (or appended to an existing entity module)". This is the wrong solution:

1. **Confusion**: Entity routes have entity-specific semantics (access rules, hooks, actions) that standard module routes don't have. Conflating them in the IR makes the data model misleading.

2. **Lost semantics**: The `EntityIR` carries rich metadata (access rules, hooks, custom actions, relations) that gets flattened into generic `RouteIR`. Codegen loses the ability to generate entity-specific SDK features.

3. **Adapter still needs changes**: Even with synthetic ModuleIR, the adapter needs to know these are *entity* routes to generate proper SDK methods (`.list()`, `.get()`, etc.) vs generic REST operations.

### 1.2 Synthetic ModuleIR Creates Semantic Confusion

The design creates a "synthetic" module for entity routes. This violates the principle that `ModuleIR` represents explicitly-defined modules in user code. Now you have:

- **Real modules**: Defined in source, explicit routers/routes
- **Synthetic modules**: Generated from entity definitions, injected at compile time

This dual nature is error-prone:
- Validators may reject "unexpected" modules
- Generators may make wrong assumptions about source
- Debugging is harder (where did this route come from?)

**Verdict:** The abstraction is leaky and creates coupling between entity semantics and module semantics that shouldn't be coupled.

---

## 2. Scalability

### 2.1 IR Size Explosion

| Entities | Routes per Entity | Total Routes |
|----------|-------------------|--------------|
| 10       | 5 (CRUD)          | 50           |
| 50       | 5 (CRUD)          | 250          |
| 100      | 5 (CRUD)          | 500          |
| 100 + 10 actions each | 5 + 10 | 1,500   |

Each `RouteIR` is a non-trivial object (~15 fields). With 500-1500 routes, you're looking at significant IR bloat. The design doesn't account for:

- Memory pressure during compilation
- Serialization/deserialization costs
- Generator iteration costs

### 2.2 Route Naming Collisions

The design specifies operationIds like `listUsers`, `getUsers`. With 50+ entities:
- What if a module already has a route named `listUsers`?
- The design doesn't mention collision detection between entity routes and module routes

### 2.3 Extraction Performance

The analyzer uses ts-morph to traverse all source files looking for `entity()` calls. With 100+ entities across many files:
- Each file needs import resolution (`isFromImport`)
- Each call expression needs argument extraction
- Nested config objects need recursive traversal

The design estimates 1 day for EntityAnalyzer, but doesn't account for large codebases.

---

## 3. Versioning

### 3.1 Import Path Fragility

The detection logic relies on:
```typescript
decl.getModuleSpecifierValue() === '@vertz/server'
```

If the entity runtime moves to `@vertz/entity` (which would be a more logical home), **every existing entity definition breaks** until users update imports. The design doesn't address:

- Migration path
- Backward compatibility
- Warning users of upcoming changes

### 3.2 Config Object Structure Coupling

The extraction assumes a specific config shape:
```typescript
{ model: usersModel, access: {...}, before: {...}, actions: {...} }
```

But the runtime `EntityConfig` allows:
- `access` to have any key (including custom action names)
- `actions` to be any record of `EntityActionDef`
- `relations` to be complex nested objects

The extraction logic in section 4.4 only handles a subset. What happens when:
- A new field is added to `EntityConfig`?
- The access rule format changes?
- New hook types are added?

### 3.3 Model Variable Extraction is Brittle

```typescript
const modelProp = configObj.getProperty('model');
const variableName = modelProp.getInitializer().getText();
```

This extracts the **source text**, not the resolved value. Problems:
- `model: usersModel` → "usersModel" (works)
- `model: getModel()` → "getModel()" (not a variable reference!)
- `model: condition ? modelA : modelB` → ternary text (not resolvable!)
- TypeScript stripping removes types but this still runs after type-checking

The design acknowledges in Open Question #2 that "Schema extraction from model" is needed but defers it. This is a **critical gap** — without model schema, codegen can't generate typed SDKs.

---

## 4. Alternative Approaches

### 4.1 Option A: First-Class EntityIR in Codegen (Recommended)

Instead of shoehorning entities into ModuleIR/RouteIR, make entities a first-class concept:

```typescript
// In AppIR
export interface AppIR {
  // ... existing ...
  entities: EntityIR[];
  entityRoutes: RouteIR[];  // Separate, explicitly from entities
}
```

**Pros:**
- Preserves entity semantics through the pipeline
- Clear separation between user-defined and generated routes
- Codegen can detect entity routes and generate specialized SDK methods
- Easier debugging (know the source of each route)

**Cons:**
- Requires changes to ir-adapter.ts (add entity handling)
- More IR types to maintain
- Generators need to handle two route sources

### 4.2 Option B: Entity Module Convention

Enforce that entities must be in a specific module (e.g., `entities.ts` or `src/entities/`). The analyzer only scans those files:

**Pros:**
- Narrower scope for analysis
- Clearer semantics (these ARE the entity routes)
- Less collision with user modules

**Cons:**
- Less flexible (migration burden)
- Doesn't solve the semantic conflation problem
- Users may resist the convention

### 4.3 Option C: Skip RouteIR Entirely, Generate Direct Codegen

Instead of generating RouteIR and flowing through existing pipelines, generate entity SDK code directly from EntityIR:

**Pros:**
- No IR bloat
- Direct control over output
- No adapter/modification needed

**Cons:**
- Abandon existing OpenAPI/RouteTable generators (they won't see entity routes)
- More code to maintain
- "Wow moment" demo requires OpenAPI to show entity routes

---

## 5. What Could Go Wrong

### 5.1 Most Likely Failure Modes

| Failure Mode | Probability | Impact |
|--------------|-------------|--------|
| **ir-adapter.ts doesn't process entity routes** | HIGH | Entity routes silently ignored, SDK generation fails |
| **Import path changes break detection** | MEDIUM | Entities not detected, no SDK generated |
| **Model not statically resolvable** | HIGH | Schema extraction fails, SDK has no types |
| **Name collisions between entity/module routes** | MEDIUM | Unpredictable codegen output |
| **Access rule functions not detected correctly** | MEDIUM | Routes generated when they shouldn't be |
| **Performance degradation with 50+ entities** | MEDIUM | Slow compilation, high memory |

### 5.2 The ir-adapter Problem is Critical

The design explicitly claims no adapter changes needed. This is **the single most likely failure**. The adapter MUST be updated to either:

1. Process `appIR.modules` for synthetic entity modules (if you go that route), OR
2. Process `appIR.entities` directly with entity-aware logic

Without this, the entire "SDK generation from entity definitions" goal fails silently.

### 5.3 Custom Actions Path Collision

The design specifies custom action routes:
```
POST /{entity-name}/:id/{action}
```

What if an entity has a custom action named `delete`? Collision with the built-in DELETE route. The design doesn't address this.

---

## 6. Recommendations

### MUST Fix (Blocking Issues)

1. **Update ir-adapter.ts to handle entity routes**
   - Either inject routes into real ModuleIR objects (and mark them somehow)
   - Or add first-class entity handling to the adapter
   - Document exactly how entity routes flow through the system

2. **Fix model schema extraction**
   - The current approach extracts variable names, not actual schemas
   - Need to resolve the model type and extract `$response`, `$create_input`, `$update_input`
   - Without this, typed SDK generation is impossible

3. **Add collision detection**
   - Entity route operationIds must not collide with module routes
   - Must detect and report errors, not silently overwrite

4. **Document the synthetic module semantics**
   - If using synthetic ModuleIR, document why this was chosen
   - Ensure validators don't reject synthetic modules
   - Make the source clear in debugging output

### SHOULD Fix (Strongly Recommended)

5. **Add migration path for import changes**
   - If `@vertz/server` → `@vertz/entity` is planned, add deprecation warnings
   - Support both import paths during transition

6. **Handle custom action name collisions**
   - Detect when action names collide with CRUD operation names
   - Error or warn, don't silently generate broken routes

7. **Add performance limits**
   - Consider max entity count warning
   - Profile with 100+ entities to validate approach

### NICE to Have

8. **Consider first-class EntityIR approach** (Option A above)
   - More work upfront, but cleaner long-term
   - Preserves entity semantics through pipeline

9. **Add entity grouping** (mentioned as v0.2 in design)
   - If entities use `domain()`, group them logically
   - Makes debugging/understanding easier

---

## Conclusion

The Entity Analyzer design addresses a real need, but the implementation plan has critical gaps. The most serious is the **incorrect assumption about ir-adapter.ts** — without changes there, entity routes will be silently ignored and the entire feature will fail to deliver its promise of SDK generation from entity definitions.

**Rating: Request Changes**

The design must be revised to either:
1. (Preferred) Add first-class entity handling in ir-adapter.ts with explicit entity route processing
2. Or document exactly how synthetic ModuleIR routes flow through existing code and prove it works with a prototype

Either way, model schema extraction must be solved — extracting variable names is insufficient for typed SDK generation.

---

## Appendix: Questions for Design Authors

1. How exactly do entity routes flow through ir-adapter.ts? Show the code path.
2. What happens when `config.model` is not a simple variable reference?
3. How do you detect and handle operationId collisions?
4. Why not make EntityIR a first-class concept in codegen instead of flattening to RouteIR?
