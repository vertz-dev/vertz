# Phase 2: CodegenIR Types + IR Adapter

## Context

Phase 1 added services to AppIR. This phase adds the codegen-side types and wires the IR adapter to transform `AppIR.services` into `CodegenIR.services`.

Link to design doc: `plans/codegen-service-sdk.md`

## Tasks

### Task 2a: CodegenIR Types

**Files:**
- `packages/codegen/src/types.ts` (modified)

**What to implement:**

Add `CodegenServiceModule` and `CodegenServiceAction` types:
```typescript
export interface CodegenServiceModule {
  serviceName: string;
  actions: CodegenServiceAction[];
}

export interface CodegenServiceAction {
  name: string;
  method: string;
  path: string;
  inputSchema?: string;
  outputSchema?: string;
  pathParams?: string[];
  resolvedInputFields?: CodegenResolvedField[];
  resolvedOutputFields?: CodegenResolvedField[];
}
```

Add `services?: CodegenServiceModule[]` to `CodegenIR` (optional to avoid breaking existing fixtures).

**Acceptance criteria:**
- [ ] `CodegenServiceModule` and `CodegenServiceAction` types exist
- [ ] `CodegenIR.services` is optional `CodegenServiceModule[]`
- [ ] Typecheck passes

---

### Task 2b: IR Adapter

**Files:**
- `packages/codegen/src/ir-adapter.ts` (modified)
- `packages/codegen/src/__tests__/ir-adapter.test.ts` (modified)

**What to implement:**

Update `adaptIR()` to process `appIR.services`:
- Iterate services, for each: iterate actions
- Filter by access: skip `'none'` and `'false'`, include `'function'`
- Resolve schema names: `${ActionPascal}${ServicePascal}Input/Output`
- Extract path params from action paths using `/:([a-zA-Z][a-zA-Z0-9]*)/g`
- Compute default path: `/${serviceName}/${actionName}` when no custom path
- Extract resolvedFields from inline schema refs (same pattern as entity actions)

**Acceptance criteria:**
- [ ] `adaptIR()` returns `services` array in CodegenIR
- [ ] Actions with no access rule (`'none'`) are excluded
- [ ] Actions with `access: false` (`'false'`) are excluded
- [ ] Actions with function access rules (`'function'`) are included
- [ ] Schema names follow `${ActionPascal}${ServicePascal}Input/Output` convention
- [ ] Path params extracted from `:paramName` segments
- [ ] Default path computed when action has no custom path
- [ ] Resolved fields extracted from inline schemas
