# Phase B: Codegen types + IR adapter resolve service schemas

## Context

Design doc: `plans/codegen-service-sdk.md`.

After Phase A, `ServiceActionIR.body`/`.response` carry `SchemaRef { kind: 'inline', resolvedFields, jsonSchema }`. The codegen side must surface that info to generators.

Current `CodegenServiceAction` (`packages/codegen/src/types.ts:226-231`) has only `{ name, method, path, operationId }`. The IR adapter at `packages/codegen/src/ir-adapter.ts:308-325` builds that shape and drops schemas entirely.

Mirror how entity actions are handled (`ir-adapter.ts:118-154`): carry `inputSchema`/`outputSchema` schema *names* plus `resolvedInputFields`/`resolvedOutputFields` shapes. Also record `pathParams` (extracted with `/:([a-zA-Z][a-zA-Z0-9_]*)/g`) for downstream use by the SDK generator.

## Tasks

### Task B1: Extend `CodegenServiceAction`

**Files (max 5):**
- `packages/codegen/src/types.ts` (modified)

**What to implement:**

```ts
export interface CodegenServiceAction {
  name: string;
  method: HttpMethod;
  path: string;
  operationId: string;
  inputSchema?: string;
  outputSchema?: string;
  pathParams?: string[];
  resolvedInputFields?: CodegenResolvedField[];
  resolvedOutputFields?: CodegenResolvedField[];
}
```

All new fields are optional — existing fixtures stay valid.

**Acceptance criteria (BDD):**

```ts
describe('Feature: CodegenServiceAction type extension', () => {
  describe('Given a CodegenServiceAction literal', () => {
    it('Then accepts optional inputSchema/outputSchema strings', () => {});
    it('Then accepts optional resolvedInputFields/resolvedOutputFields arrays', () => {});
    it('Then accepts optional pathParams string[]', () => {});
    it('Then continues to accept the minimal { name, method, path, operationId }', () => {});
  });
});
```

Type-level only — no runtime tests. Use `.test-d.ts` with `expectTypeOf` or `@ts-expect-error`.

---

### Task B2: Enrich `ir-adapter` service mapping

**Files (max 5):**
- `packages/codegen/src/ir-adapter.ts` (modified)
- `packages/codegen/src/__tests__/ir-adapter.test.ts` (modified)

**What to implement:**

Rewrite the service mapping at `ir-adapter.ts:308-325`:

```ts
const PATH_PARAM_RE = /:([a-zA-Z][a-zA-Z0-9_]*)/g;

const services: CodegenServiceModule[] = (appIR.services ?? []).map((svc) => {
  const svcPascal = toPascalCase(svc.name);
  const actions: CodegenServiceAction[] = svc.actions
    .filter((a) => svc.access[a.name] === 'function')
    .map((a) => {
      const actionPascal = toPascalCase(a.name);
      const rawPath = a.path ?? `/${svc.name}/${a.name}`;
      const actionPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

      const pathParams = [...actionPath.matchAll(PATH_PARAM_RE)].map((m) => m[1]);

      const inputFields =
        a.body?.kind === 'inline'
          ? (a.body as InlineSchemaRef).resolvedFields?.map((f) => ({
              name: f.name,
              tsType: f.tsType,
              optional: f.optional,
            }))
          : undefined;

      const outputFields =
        a.response?.kind === 'inline'
          ? (a.response as InlineSchemaRef).resolvedFields?.map((f) => ({
              name: f.name,
              tsType: f.tsType,
              optional: f.optional,
            }))
          : undefined;

      return {
        name: a.name,
        method: a.method,
        path: actionPath,
        operationId: `${a.name}${svcPascal}`,
        inputSchema: a.body ? `${actionPascal}${svcPascal}Input` : undefined,
        outputSchema: a.response ? `${actionPascal}${svcPascal}Output` : undefined,
        pathParams: pathParams.length > 0 ? pathParams : undefined,
        resolvedInputFields: inputFields,
        resolvedOutputFields: outputFields,
      };
    });
  return { serviceName: svc.name, actions };
});
```

Access rule filter: keep only `access === 'function'` (matches the design doc Unknown #5 decision — deny-by-default, `'false'` excluded).

**Acceptance criteria (BDD):**

```ts
describe('Feature: ir-adapter maps services with schemas', () => {
  describe('Given a service with an action containing body + response schemas', () => {
    describe('When adaptIR runs', () => {
      it('Then CodegenServiceAction.inputSchema is `${ActionPascal}${ServicePascal}Input`', () => {});
      it('Then CodegenServiceAction.outputSchema is `${ActionPascal}${ServicePascal}Output`', () => {});
      it('Then resolvedInputFields mirror body.resolvedFields', () => {});
      it('Then resolvedOutputFields mirror response.resolvedFields', () => {});
    });
  });

  describe('Given a service action whose path has :messageId and :userId params', () => {
    it('Then pathParams is ["userId", "messageId"] in source order', () => {});
  });

  describe('Given a service action without a custom path', () => {
    it('Then path defaults to /{serviceName}/{actionName}', () => {});
    it('Then pathParams is undefined', () => {});
  });

  describe('Given a service with access: false on one action', () => {
    it('Then that action is excluded from the generated module', () => {});
  });

  describe('Given a service with no access rule on an action (`none`)', () => {
    it('Then that action is excluded (deny-by-default)', () => {});
  });

  describe('Given a service action with body but no response', () => {
    it('Then inputSchema is set and outputSchema is undefined', () => {});
  });
});
```

## Files touched (Phase B total)

- `packages/codegen/src/types.ts`
- `packages/codegen/src/ir-adapter.ts`
- `packages/codegen/src/__tests__/ir-adapter.test.ts`
- `packages/codegen/src/types.test-d.ts` (new — tiny, type-only)

## Quality gates

```bash
vtz test packages/codegen
vtz run typecheck
vtz run lint
```

## Adversarial review location

`reviews/codegen-service-sdk/phase-B-<reviewer-bot>.md`.
