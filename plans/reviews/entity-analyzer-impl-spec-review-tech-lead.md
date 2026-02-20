# Entity Analyzer Implementation Spec Review

**Reviewer:** Ben (Tech Lead)
**Date:** 2026-02-20
**Spec:** `plans/entity-analyzer-impl-spec.md`

---

## Summary

The spec is **mostly implementable** but has several blocking issues that would stop an agent. Below are the critical items that MUST be fixed before implementation.

---

## Blocking Issues (MUST FIX)

### 1. Missing `toPascalCase` Helper
**Location:** `entity-route-injector.ts`
**Issue:** The file uses `toPascalCase(entity.name)` but never imports or defines it. The codegen file imports from `../utils/naming`, but route injector doesn't have access.
```typescript
// Used but never imported:
const entityPascal = toPascalCase(entity.name);
```

### 2. Incomplete SchemaRef in `extractActions`
**Location:** `extractActions()` method
**Issue:** Always returns placeholder schema refs regardless of actual input/output:
```typescript
// Current (broken):
inputSchemaRef: inputExpr ? { kind: 'inline', sourceFile: loc.sourceFile } : { kind: 'inline', sourceFile: loc.sourceFile },
outputSchemaRef: outputExpr ? { kind: 'inline', sourceFile: loc.sourceFile } : { kind: 'inline', sourceFile: loc.sourceFile },
```
Should extract actual schema type info similar to `resolveModelSchemas()`.

### 3. Type Mismatch in `EntityHooksIR`
**Location:** IR types section
**Issue:** Type defines `before: ('create' | 'update')[]` but implementation checks for 'delete' in after hooks. More critically, `extractHooks` only validates 'create'/'update' for `before`, but if a user somehow passes 'delete' to `before`, it would be silently ignored. This is a type/implementation mismatch.

### 4. Missing `findImportForIdentifier` Utility
**Location:** `extractModelRef()` method
**Issue:** Called but never defined in the spec:
```typescript
const importInfo = findImportForIdentifier(modelExpr);
```
Agent needs this helper to resolve import sources.

### 5. Missing `HttpMethod` Import
**Location:** `entity-route-injector.ts`
**Issue:** Uses `HttpMethod` type but doesn't import it from `../ir/types`.

### 6. Undefined SchemaRef Fields
**Location:** `extractSchemaType()` and action extraction
**Issue:** Returns partial SchemaRef:
```typescript
return { kind: 'inline' as const, sourceFile: ..., jsonSchema: { __typeText: typeText } };
```
If SchemaRef requires other fields (e.g., `type`, `required`, etc.), this will fail typecheck.

### 7. Missing Duplicate Name Detection
**Location:** Extraction logic
**Issue:** Test 11 expects `ENTITY_DUPLICATE_NAME` diagnostic but no implementation is shown for detecting duplicates across files.

### 8. Missing `ENTITY_UNKNOWN_ACCESS_OP` Emission
**Location:** `extractAccess()` 
**Issue:** Test 24 expects diagnostic for unknown operation names, but code silently accepts them into `custom`:
```typescript
// Currently just adds to custom, never warns:
result.custom[name] = kind;
```

---

## Nice-to-Haves

### 1. SchemaRef Interface Documentation
The spec uses `SchemaRef` but doesn't show its interface. Implementer needs to know required fields for 'inline' kind to avoid type errors.

### 2. ts-morph Type Import
**Location:** `resolveModelSchemas()` 
**Issue:** Uses `Type` from ts-morph but import section doesn't show it:
```typescript
private extractSchemaType(parentType: Type, ...): SchemaRef
```

### 3. Debug Output Location
**Location:** EntityAnalyzer
**Issue:** Debug method is described but not wired into the analyzer flow. Should be called in detection/extraction loops.

### 4. Action Path Format
**Location:** `generateActionRoutes`
**Issue:** Currently generates `/:id/{action}` but actions might not always require an ID. Consider making path configurable.

### 5. Access Check for Actions in Route Injection
**Location:** `generateCrudRoutes` vs codegen
**Issue:** Route injection checks `accessKind === 'false'` but codegen checks `entity.access.custom[action.name] !== 'false'`. The logic is inverted between them—should be consistent.

---

## Test Plan Assessment

**Coverage:** 61 tests across 4 test files. Good breadth.

**Missing Cases:**
- Test for `VERTZ_DEBUG=entities` debug output behavior
- Test for empty file (no imports) - performance consideration
- Test for malformed entity config (e.g., non-object for access property)
- Integration test: entity IR through full pipeline to SDK output
- Test for `tableName` extraction in modelRef (mentioned in type but never extracted)

---

## File Structure Assessment

**Sensible:**
- `entity-analyzer.ts` - Detection/extraction logic
- `entity-route-injector.ts` - Route generation (separate from analyzer)
- `ir-adapter.ts` - IR transformation
- `entity-sdk-generator.ts` - Codegen output

**Potential Issue:** `entity-route-injector.ts` is in `ir/` but imports from `../ir/types`. Should be consistent with other IR utilities.

---

## Verdict

**NOT READY FOR IMPLEMENTATION** - Fix the 8 blocking issues above before an agent attempts this. The spec has good structure but missing critical implementation details that would cause immediate blockers.

---
