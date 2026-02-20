# Entity Analyzer Design Review — Compiler Expert

**Reviewer:** Compiler Expert (Subagent)
**Date:** 2026-02-20
**Design Doc:** `plans/entity-analyzer-design.md`
**Rating:** Approve with Changes

---

## Summary

The design is well-structured and follows existing compiler patterns. The approach of injecting entity-generated routes into the existing IR pipeline is sound. However, there are several edge cases in AST extraction, gaps in IR design, and concerns about schema resolution that need to be addressed before implementation.

**Key concerns:**
1. AST extraction misses critical edge cases (aliased/namespace imports, barrel files)
2. IR lacks schema references needed for typed SDK generation
3. Custom action routes aren't filtered by access rules
4. Schema resolution approach is underspecified

---

## 1. AST Extraction Correctness

### 1.1 Import Detection — Partial Coverage

**Finding:** The design's `isEntityFile()` checks for imports from `@vertz/server` with named import `entity`, but doesn't handle all valid import patterns.

**Edge cases NOT addressed:**

| Pattern | Current Handling | Will Detect? |
|---------|-----------------|--------------|
| `import { entity } from '@vertz/server'` | ✅ Handled | ✅ Yes |
| `import { entity as e } from '@vertz/server'` | ⚠️ Partial (alias works in `isFromImport`, but `isEntityFile` uses `imp.getName()` which returns original name) | ❌ No |
| `import * as server from '@vertz/server'` | ⚠️ `getNamespaceImport()` handled in `isFromImport` but NOT in `isEntityFile` | ❌ No |
| `import server from '@vertz/server'` (default) | ❌ Not handled | ❌ No |
| Re-export via barrel: `export { entity } from '@vertz/server'` | ❌ Not handled | ❌ No |
| Import from alias path: `import entity from '@vertz/srv'` (alias in tsconfig) | ❌ Not handled | ❌ No |

**Impact:** Significant. Any project using namespace imports, default imports, or barrel files will have their entities silently missed by the analyzer.

**Recommendation:** 
- Update `isEntityFile()` to also check for namespace imports and default imports
- For barrel file detection: walk export symbols and trace them back to their source (the `import-resolver.ts` already has `resolveExport()` which handles re-exports)
- Add a diagnostic `ENTITY_IMPORT_NOT_DETECTED` when entity-like calls exist but don't resolve to `@vertz/server`

### 1.2 Call Expression Detection — Missing Symbol Resolution

**Finding:** The design uses `expr.getText() === 'entity'` which only matches the literal identifier "entity". This fails when:
- Import is aliased: `import { entity as e } from '@vertz/server'` → call is `e(...)`
- Namespace import: `import * as server from '@vertz/server'` → call is `server.entity(...)`

**Recommendation:** Use `resolveIdentifier()` from `import-resolver.ts` to resolve the call expression's symbol to verify it came from `@vertz/server`. This is more robust than string matching:

```typescript
private findEntityCalls(file: SourceFile): CallExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const expr = call.getExpression();
      if (!expr.isKind(SyntaxKind.Identifier)) return false;
      
      // Resolve to check if it's the entity from @vertz/server
      const resolved = resolveIdentifier(expr, this.project);
      return resolved !== null && 
             resolved.sourceFile.getFileName().includes('@vertz/server');
    });
}
```

### 1.3 Destructured Re-export Edge Case

**Finding:** If a developer creates an intermediate barrel:
```typescript
// src/entities/index.ts
export { entity } from '@vertz/server';

// src/entities/user.ts
import { entity } from '../index';
entity('users', { ... });
```

The second file imports from `../index`, not `@vertz/server`. The design acknowledges this as an open question but doesn't propose a solution.

**Recommendation:** Add a diagnostic warning for "entities detected via re-export - ensure direct import from @vertz/server for full compatibility". This is a known limitation but should be documented.

---

## 2. IR Design

### 2.1 EntityIR — Generally Good

The core structure is well-designed. However:

**Missing fields:**
- **`modelRef.importSource`** — Already present ✅, but should also add `resolvedTypeName` for when the model type can be resolved
- **`modelRef.tableName`** — Already present ✅
- **`$response/$create_input/$update_input` references** — NOT present, see section 4

**Potentially missing:**
- **`sourceFile` in nested types** — EntityActionIR and EntityRelationIR have `SourceLocation`, but the inner refs (inputSchemaRef, outputSchemaRef) are just SchemaRef, not including source location

### 2.2 EntityModelRef — Needs Enhancement

```typescript
export interface EntityModelRef {
  variableName: string;
  importSource?: string;
  tableName?: string;
  // ADD:
  resolvedTypeName?: string;  // TypeScript type name if resolvable
  schemaRefs?: {
    response?: SchemaRef;
    createInput?: SchemaRef;
    updateInput?: SchemaRef;
  };
}
```

**Recommendation:** Add schema refs to EntityModelRef. This is critical for typed SDK generation (see section 4).

### 2.3 EntityRelationIR — Under-specified

The current design:
```typescript
export interface EntityRelationIR {
  name: string;
  selection: 'all' | string[];
}
```

**Missing:**
- `targetEntity` — Which entity this relation points to
- `relationType` — 'one-to-one' | 'one-to-many' | 'many-to-many'

**Recommendation:** Add target and type. The runtime `RelationDef` has this info - the compiler just needs to extract it.

---

## 3. Route Injection

### 3.1 Approach — Sound

The approach of injecting into existing `ModuleIR → RouteIR` pipeline is correct. It ensures existing generators (OpenAPI, route-table, codegen) work without modification.

### 3.2 Custom Actions — Not Filtered by Access Rules

**Finding:** The design generates routes for custom actions unconditionally, but it should check if access rules exist for them:

```typescript
// Design says:
const custom = Record<string, EntityAccessRuleKind>;  // access.custom

// But in Route Injection:
for (const action of entity.actions) {
  // Generates route regardless of access.custom[actionName]
}
```

**Recommendation:** Filter custom action routes when `access.custom?.[actionName] === false`:

```typescript
const actionAccess = entity.access.custom?.[action.name];
if (actionAccess === false) continue; // Skip disabled actions
```

### 3.3 Naming Collision Risk

**Finding:** If a developer manually defines a route with the same operationId as an entity route (e.g., `getUsers`), there will be a collision.

**Recommendation:** Document this as a limitation. In v0.2, consider adding a prefix like `entity_getUsers` for auto-generated routes.

---

## 4. Schema Resolution

### 4.1 Critical Gap — No Schema Extraction

**Finding:** The design defers schema extraction as an "open question" (section 4.8), but this is critical for the stated goal of "typed SDK generation."

The runtime entity types show:
```typescript
interface EntityConfig<TModel extends ModelDef> {
  model: TModel;  // Has $response, $create_input, $update_input
}
```

If the analyzer can't extract these, the SDK will have `unknown` types instead of proper types.

### 4.2 Recommended Approach

The model reference is a variable (e.g., `usersModel`). The analyzer should:

1. **Find the variable declaration** — `file.getVariableDeclaration('usersModel')`
2. **Get its type** — `decl.getType()` or `decl.getTypeNode()`
3. **Extract $response/$create_input/$update_input** — These are type aliases on the model type

```typescript
// Approach:
const modelDecl = file.getVariableDeclaration(modelRef.variableName);
if (modelDecl) {
  const modelType = modelDecl.getType();
  
  // Look for $response, $create_input, $update_input properties
  const responseType = modelType.getProperty('$response');
  const createInputType = modelType.getProperty('$create_input');
  const updateInputType = modelType.getProperty('$update_input');
  
  // Convert to SchemaRef...
}
```

**Limitation:** TypeScript's type system is complex. If the model is imported from another file, type resolution may fail.

**Recommendation:** 
1. Implement the above approach for in-file models
2. For imported models, emit a warning diagnostic: `ENTITY_MODEL_UNRESOLVABLE`
3. In IR, mark schema refs as `unresolved: true` so generators know to use `unknown`

---

## 5. Performance

### 5.1 Scanning All Source Files

**Finding:** The design scans all source files (`for (const file of this.project.getSourceFiles())`). For large codebases, this could be slow.

**Mitigation already present:**
- `isEntityFile()` filter before call detection ✅
- `getDescendantsOfKind()` is reasonably efficient ✅

### 5.2 Potential Optimizations

1. **Skip node_modules** — Already handled by ts-morph project setup ✅
2. **Add caching** — Not needed for v0.1
3. **Parallel processing** — Could analyze files in parallel, but likely overkill for v0.1

**Verdict:** Performance is acceptable for v0.1. Monitor in production and optimize if needed.

---

## 6. Additional Findings

### 6.1 Diagnostic Coverage

The design has good diagnostics, but missing:
- `ENTITY_IMPORT_NOT_DETECTED` — When entity-like calls exist but don't resolve
- `ENTITY_MODEL_UNRESOLVABLE` — When model type can't be analyzed
- `ENTITY_BARREL_REEXPORT` — Warning about barrel file usage

### 6.2 Test Plan Gap

The test plan mentions "Handles re-exported entity function" but doesn't specify HOW this should work. Need to define expected behavior.

### 6.3 Compiler Wiring — Minor Concern

In `compiler.ts`, the design shows:
```typescript
const entityResult = await analyzers.entity.analyze();
ir.entities = entityResult.entities;
injectEntityRoutes(ir);
```

This adds entities to IR, but the existing analyzers run sequentially. If entity routes need module context, ensure execution order is correct.

---

## 7. Summary of Recommendations

### Must Fix (before implementation)
1. **Import detection** — Handle aliased, namespace, default imports, and barrel re-exports
2. **Call detection** — Use symbol resolution instead of text matching
3. **Schema refs** — Add to EntityModelRef for typed SDK generation
4. **Custom action filtering** — Filter routes when access is `false`

### Should Fix (v0.1)
5. **EntityRelationIR** — Add targetEntity and relationType
6. **Diagnostics** — Add unresolved/undetected warnings

### Consider for v0.2
7. **Route collision handling** — Add prefix for auto-generated routes
8. **Domain grouping** — Group entities within domain() calls

---

## Rating: Approve with Changes

The design is solid and follows established patterns. The core approach is sound. However, the AST extraction edge cases and schema resolution gaps are significant enough to require changes before implementation.

**Required changes:**
- Section 4.1: Enhance import and call detection to handle all import patterns
- Section 4.2: Add schema refs to EntityModelRef  
- Section 4.5: Filter custom action routes by access rules

With these fixes, the design is ready for implementation.
