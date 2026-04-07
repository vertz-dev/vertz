# Phase 3: Service SDK Generator

## Context

Phase 2 added services to CodegenIR. This phase generates the actual SDK files — TypeScript types and SDK functions — following the entity SDK generator pattern.

Link to design doc: `plans/codegen-service-sdk.md`

## Tasks

### Task 3a: Service Types Generator

**Files:**
- `packages/codegen/src/generators/service-types-generator.ts` (new)
- `packages/codegen/src/__tests__/generators.test.ts` (modified)

**What to implement:**

`ServiceTypesGenerator` implements `Generator`, produces `types/{serviceName}.ts` + index:
- For each action with `resolvedInputFields`, emit an input interface
- For each action with `resolvedOutputFields`, emit an output interface
- GET actions with only path params generate no Input type
- Type names: `${ActionPascal}${ServicePascal}Input/Output`

**Acceptance criteria:**
- [ ] Generates `types/{serviceName}.ts` with input/output interfaces
- [ ] Generates `types/index.ts` re-exporting service types (alongside entity types)
- [ ] Only generates Input type when action has body schema
- [ ] Field types match resolved fields (string, number, boolean, date)

---

### Task 3b: Service SDK Generator

**Files:**
- `packages/codegen/src/generators/service-sdk-generator.ts` (new)
- `packages/codegen/src/__tests__/generators.test.ts` (modified)

**What to implement:**

`ServiceSdkGenerator` implements `Generator`, produces `services/{serviceName}.ts` + `services/index.ts`:
- Each action → method on SDK object
- All actions use `createDescriptor` (not `createMutationDescriptor`)
- Path params before body in function signature, ordered by path appearance
- POST/PUT/PATCH with body: `(pathParams..., body: InputType) => createDescriptor(method, path, () => client.post(..., body), body)`
- GET/DELETE without body: `(pathParams...) => createDescriptor(method, path, () => client.get/delete(...))`
- `Object.assign` with `{ url, method }` metadata
- Smart imports (only what's needed)

**Acceptance criteria:**
- [ ] Generates `services/{serviceName}.ts` with `create${Pascal}Sdk` function
- [ ] Generates `services/index.ts` re-exporting all service SDKs
- [ ] All actions use `createDescriptor`, never `createMutationDescriptor`
- [ ] Path params extracted and ordered by path appearance
- [ ] Body param only for POST/PUT/PATCH with body schema
- [ ] Type imports reference `../types/{serviceName}`
- [ ] `@vertz/fetch` imports only include what's needed
- [ ] `Object.assign` metadata has correct url and method
