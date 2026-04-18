# Phase A: Compiler analyzer extracts service action body/response schemas

## Context

Design doc: `plans/codegen-service-sdk.md`.

`ServiceActionIR` already carries optional `body: SchemaRef` / `response: SchemaRef`, but `ServiceAnalyzer.parseActions` never reads those properties from the `action({...})` config. Downstream (`ir-adapter`, generators) therefore cannot produce typed SDK inputs/outputs.

Entity analyzer does the identical resolution for model schemas in `EntityAnalyzer.extractSchemaType` (line 370-393 of `packages/compiler/src/analyzers/entity-analyzer.ts`), using a private helper `resolveFieldsFromSchemaType` that walks `SchemaLike<T>.parse()` return types. We reuse that pattern for service actions.

## Tasks

### Task A1: Lift `resolveFieldsFromSchemaType` + `buildJsonSchema` + `tsTypeToJsonSchema` into a shared utility

**Files (max 5):**
- `packages/compiler/src/analyzers/utils/schema-type-resolver.ts` (new)
- `packages/compiler/src/analyzers/entity-analyzer.ts` (modified — import from shared util)
- `packages/compiler/src/analyzers/__tests__/schema-type-resolver.test.ts` (new)

**What to implement:**

Move the three helpers from `entity-analyzer.ts` into a new module that exports:

```ts
export function resolveSchemaRefFromExpression(
  expr: Expression,
): SchemaRef;
```

`resolveSchemaRefFromExpression` encapsulates the full resolution:
1. Read the expression's type via `expr.getType()`.
2. Walk `.parse()` call signature return type to extract `data` shape (`resolveFieldsFromSchemaType` logic).
3. Build `jsonSchema` from resolved fields (`buildJsonSchema` logic, mapping `tsType → json schema type`).
4. Return `{ kind: 'inline', sourceFile, jsonSchema, resolvedFields }` — always inline (simpler downstream).
5. Fallback when the type has no `parse` method: return `{ kind: 'inline', sourceFile, jsonSchema: {} }` — do NOT return `kind: 'named'`, which loses all field info.

Refactor `EntityAnalyzer.extractSchemaType` to call the shared util.

**Acceptance criteria (BDD):**

```ts
describe('Feature: schema-type-resolver', () => {
  describe('Given an Identifier referencing `s.object({ foo: s.string() })`', () => {
    describe('When resolveSchemaRefFromExpression runs', () => {
      it('Then returns { kind: "inline", resolvedFields: [{ name: "foo", tsType: "string", optional: false }] }', () => {});
      it('Then returns jsonSchema with type: "object" and properties.foo.type: "string"', () => {});
      it('Then includes "foo" in required[]', () => {});
    });
  });

  describe('Given an expression whose type has no .parse method', () => {
    describe('When resolveSchemaRefFromExpression runs', () => {
      it('Then returns { kind: "inline", jsonSchema: {}, resolvedFields: undefined }', () => {});
    });
  });

  describe('Given optional fields (`s.string().optional()` or similar)', () => {
    describe('When resolveSchemaRefFromExpression runs', () => {
      it('Then marks optional: true and omits them from required[]', () => {});
    });
  });
});
```

Entity analyzer tests must continue to pass unchanged — this is a pure refactor.

---

### Task A2: Teach `ServiceAnalyzer.parseActions` to populate `body` and `response`

**Files (max 5):**
- `packages/compiler/src/analyzers/service-analyzer.ts` (modified)
- `packages/compiler/src/analyzers/__tests__/service-analyzer.test.ts` (modified)

**What to implement:**

Inside the `for` loop at line 104 of `service-analyzer.ts`, after reading `method`/`path`, read `body`/`response` from `actionConfig`:

```ts
const bodyExpr = getPropertyValue(actionConfig, 'body');
const responseExpr = getPropertyValue(actionConfig, 'response');
const body = bodyExpr ? resolveSchemaRefFromExpression(bodyExpr) : undefined;
const response = responseExpr ? resolveSchemaRefFromExpression(responseExpr) : undefined;

actions.push({ name: actionName, method, path, body, response });
```

Diagnostic parity with entity analyzer: emit `SERVICE_ACTION_MISSING_SCHEMA` (warning) when both `body` and `response` are absent. GET actions legitimately may have no body, so do not warn when only `body` is missing.

**Acceptance criteria (BDD):**

```ts
describe('Feature: service-analyzer extracts action schemas', () => {
  describe('Given service("ai", { actions: { parse: action({ body: parseInput, response: parseOutput, handler }) } })', () => {
    describe('When the analyzer runs', () => {
      it('Then ServiceActionIR.body is { kind: "inline", resolvedFields: [...projectId/message...] }', () => {});
      it('Then ServiceActionIR.response is { kind: "inline", resolvedFields: [...] }', () => {});
    });
  });

  describe('Given a GET action with only response (no body)', () => {
    describe('When the analyzer runs', () => {
      it('Then body is undefined and response is resolved', () => {});
      it('Then no SERVICE_ACTION_MISSING_SCHEMA diagnostic is emitted', () => {});
    });
  });

  describe('Given an action with no body and no response', () => {
    describe('When the analyzer runs', () => {
      it('Then body and response are both undefined', () => {});
      it('Then a SERVICE_ACTION_MISSING_SCHEMA warning is added', () => {});
    });
  });

  describe('Given an action whose body references an unresolvable expression', () => {
    describe('When the analyzer runs', () => {
      it('Then body is { kind: "inline", jsonSchema: {}, resolvedFields: undefined }', () => {});
    });
  });
});
```

## Files touched (Phase A total)

- `packages/compiler/src/analyzers/utils/schema-type-resolver.ts` (new)
- `packages/compiler/src/analyzers/entity-analyzer.ts` (refactor to import)
- `packages/compiler/src/analyzers/service-analyzer.ts` (populate body/response)
- `packages/compiler/src/analyzers/__tests__/schema-type-resolver.test.ts` (new)
- `packages/compiler/src/analyzers/__tests__/service-analyzer.test.ts` (extended)

## Quality gates (must all pass)

```bash
vtz test packages/compiler
vtz run typecheck
vtz run lint
```

## Adversarial review location

`reviews/codegen-service-sdk/phase-A-<reviewer-bot>.md`.
