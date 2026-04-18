# Phase C: Typed generators — service types + typed SDK signatures

## Context

Design doc: `plans/codegen-service-sdk.md`.

Phase B surfaces `inputSchema`, `outputSchema`, and `resolved*Fields` on `CodegenServiceAction`. This phase makes the emitted code use them:

- New `ServiceTypesGenerator` emits `types/{serviceName}.ts` with input/output interfaces (parallels `EntityTypesGenerator`).
- Existing `ServiceSdkGenerator` rewritten to import those types and replace all `unknown` with the real `${InputType}`/`${OutputType}`.
- Generator pipeline updated so `ServiceTypesGenerator` runs before `ServiceSdkGenerator` (so imports resolve at type-check time).

## Tasks

### Task C1: `ServiceTypesGenerator`

**Files (max 5):**
- `packages/codegen/src/generators/service-types-generator.ts` (new)
- `packages/codegen/src/generators/__tests__/service-types-generator.test.ts` (new)
- `packages/codegen/src/generators/entity-types-generator.ts` (read-only; reuse `TS_TYPE_MAP` by lifting to a util if needed — see Task C1a)

**What to implement:**

```ts
export class ServiceTypesGenerator implements Generator {
  readonly name = 'service-types';

  generate(ir: CodegenIR): GeneratedFile[] {
    const services = (ir.services ?? []).filter((s) =>
      s.actions.some((a) => a.resolvedInputFields?.length || a.resolvedOutputFields?.length),
    );
    if (!services.length) return [];
    const files = services.map((s) => this.generateServiceTypes(s));
    return files;
  }

  private generateServiceTypes(svc: CodegenServiceModule): GeneratedFile {
    // For each action:
    //   if resolvedInputFields → export interface ${InputType} { ...fields }
    //   if resolvedOutputFields → export interface ${OutputType} { ...fields }
    // Path: types/{serviceName}.ts
  }
}
```

Reuse the `TS_TYPE_MAP` (`string`, `number`, `boolean`, `date → string`, `unknown → unknown`) — if copying feels wrong, lift it to `packages/codegen/src/utils/ts-type-map.ts` in a 3-line helper module.

Consider collision with entity type names (e.g. entity `Notifications` + service `Notifications`). For this phase: document the collision risk in the generator header comment but do not implement collision detection — services/entities live in separate namespaces (`types/entities/…` vs `types/services/…`). **Service type files go in `types/services/{serviceName}.ts`** to avoid any overlap with entity types.

Update `EntityTypesGenerator` if needed so its index doesn't collide — actually don't; it already writes `types/{entityName}.ts` and we're adding `types/services/{serviceName}.ts`, distinct paths.

**Acceptance criteria (BDD):**

```ts
describe('Feature: ServiceTypesGenerator', () => {
  describe('Given a service with an action that has resolvedInputFields + resolvedOutputFields', () => {
    describe('When the generator runs', () => {
      it('Then emits types/services/{serviceName}.ts', () => {});
      it('Then file exports `export interface ${ActionPascal}${ServicePascal}Input { ...fields }`', () => {});
      it('Then file exports `export interface ${ActionPascal}${ServicePascal}Output { ...fields }`', () => {});
      it('Then field types follow TS_TYPE_MAP (date → string for JSON transport)', () => {});
      it('Then optional fields are marked with `field?: T`', () => {});
    });
  });

  describe('Given a service with only GET actions that have no body schema', () => {
    it('Then no Input interface is emitted', () => {});
    it('Then Output interfaces are emitted for responses with resolvedOutputFields', () => {});
  });

  describe('Given a service with no resolved fields at all', () => {
    it('Then no file is emitted for that service', () => {});
  });

  describe('Given the IR has no services at all', () => {
    it('Then generate() returns []', () => {});
  });
});
```

---

### Task C2: Typed `ServiceSdkGenerator`

**Files (max 5):**
- `packages/codegen/src/generators/service-sdk-generator.ts` (rewritten)
- `packages/codegen/src/generators/__tests__/service-sdk-generator.test.ts` (extended — add typed-SDK test suite)

**What to implement:**

Rewrite the generator so that for each action:
- Emit a `import type { ${InputType}, ${OutputType} } from '../types/services/{serviceName}';` block listing every in-use type exactly once.
- If `action.inputSchema` is set and there is a body parameter: `(body: ${InputType})` replaces `(body: unknown)`.
- `client.${method}<${OutputType ?? 'unknown'}>(...)` replaces `client.<method><unknown>(...)`.
- Path params keep `string` typing (design doc §Unknown 4).
- Keep the `Object.assign(fn, { url, method, queryKey })` shape exactly — downstream consumers rely on it.
- All actions stay on `createDescriptor` (per design §Non-Goals — no `createMutationDescriptor` for services).
- Preserve existing behavior when an action has no inputSchema/outputSchema (fallback to `unknown`, no type import).

**Acceptance criteria (BDD):**

```ts
describe('Feature: typed ServiceSdkGenerator', () => {
  describe('Given an action with inputSchema + outputSchema', () => {
    describe('When the generator runs', () => {
      it('Then emits `import type { ParseAiInput, ParseAiOutput } from "../types/services/ai"`', () => {});
      it('Then the function signature is `(body: ParseAiInput)`', () => {});
      it('Then the client call is `client.post<ParseAiOutput>(...)`', () => {});
    });
  });

  describe('Given a GET action with outputSchema but no inputSchema and no path params', () => {
    it('Then the function signature takes no parameters', () => {});
    it('Then the client call is `client.get<StatusOutput>(...)`', () => {});
  });

  describe('Given a GET action with outputSchema and one path param', () => {
    it('Then the function signature is `(id: string)`', () => {});
    it('Then the path uses a template literal with ${id}', () => {});
  });

  describe('Given an action without inputSchema or outputSchema', () => {
    it('Then no type import is emitted', () => {});
    it('Then the signature falls back to `body: unknown` / `client.post<unknown>`', () => {});
  });

  describe('Given multiple services each with typed actions', () => {
    it('Then each service produces a single type-import line listing only that service\'s types', () => {});
  });
});
```

Keep the existing generator-level test file; add the new suite alongside the legacy one so regression coverage remains.

---

### Task C3: Wire `ServiceTypesGenerator` into the pipeline + update client generator imports

**Files (max 5):**
- `packages/codegen/src/generate.ts` (modified — register `ServiceTypesGenerator` before `ServiceSdkGenerator`)
- `packages/codegen/src/generators/client-generator.ts` (verify services are already wired — likely no change; if README listing service methods is missing, add it)
- `packages/codegen/src/__tests__/integration.test.ts` (extended to assert the full pipeline emits `types/services/{name}.ts` plus typed SDK)

**What to implement:**

- `generate.ts`: instantiate and push `ServiceTypesGenerator().generate(ir, config)` into the returned files, in dependency order relative to `ServiceSdkGenerator` (types first so imports resolve).
- Client generator: leave `services` wiring as-is; do not add `#generated/services` subpath (per design Phase 4 decision).

**Acceptance criteria (BDD):**

```ts
describe('Feature: codegen pipeline emits typed service SDKs', () => {
  describe('Given an AppIR with a service that defines body + response schemas', () => {
    describe('When generate() runs', () => {
      it('Then output includes types/services/{name}.ts', () => {});
      it('Then output includes services/{name}.ts importing from ../types/services/{name}', () => {});
      it('Then output includes client.ts with createClient() returning the service SDK', () => {});
    });
  });

  describe('Given an AppIR with zero services', () => {
    it('Then no services/ or types/services/ files are emitted', () => {});
  });
});
```

## Files touched (Phase C total)

Task C1: 2 new, up to 1 modified.
Task C2: 1 rewritten + 1 extended test file.
Task C3: 2 modified, 1 extended test file.

## Quality gates

```bash
vtz test packages/codegen
vtz run typecheck
vtz run lint
```

## Adversarial review location

`reviews/codegen-service-sdk/phase-C-<reviewer-bot>.md`.
