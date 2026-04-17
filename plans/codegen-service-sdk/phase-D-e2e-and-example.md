# Phase D: E2E acceptance + example app

## Context

Design doc: `plans/codegen-service-sdk.md` (§E2E Acceptance Test).

Phases A–C make the pipeline emit typed service SDKs. This phase proves the chain end-to-end and updates one example so the new API is actually exercised.

## Tasks

### Task D1: Compiler → codegen → emitted files integration test

**Files (max 5):**
- `packages/codegen/src/__tests__/service-sdk-e2e.test.ts` (new)
- `packages/codegen/src/__tests__/fixtures/service-sdk-app/app.ts` (new — minimal synthetic app containing a standalone `service()`)
- `packages/codegen/src/__tests__/fixtures/service-sdk-app/schemas.ts` (new — `s.object({...})` literals referenced by actions)

**What to implement:**

The fixture declares:
```ts
// schemas.ts
import { s } from '@vertz/schema';
export const parseInput = s.object({ projectId: s.string(), message: s.string() });
export const parseOutput = s.object({ parsed: s.boolean(), tokens: s.number().optional() });
export const statusOutput = s.object({ status: s.string(), updatedAt: s.string() });

// app.ts
import { action, service } from '@vertz/server';
import { parseInput, parseOutput, statusOutput } from './schemas';
export const ai = service('ai', {
  access: { parse: () => true, status: () => true },
  actions: {
    parse: action({ body: parseInput, response: parseOutput, handler: async () => ({ parsed: true }) }),
    status: action({ method: 'GET', path: '/ai/status/:requestId', response: statusOutput, handler: async () => ({ status: 'queued', updatedAt: '' }) }),
  },
});
```

The test runs the real `Compiler` against the fixture, calls `adaptIR`, runs `runTypescriptGenerator`, and asserts on the generated file map.

**Acceptance criteria (BDD):**

```ts
describe('Feature: service SDK end-to-end pipeline', () => {
  describe('Given a fixture app with one standalone service and two actions', () => {
    describe('When the full codegen pipeline runs', () => {
      it('Then types/services/ai.ts exists and exports ParseAiInput, ParseAiOutput, StatusAiOutput', () => {});
      it('Then services/ai.ts imports those types from ../types/services/ai', () => {});
      it('Then services/ai.ts parse signature is (body: ParseAiInput) and the client call is client.post<ParseAiOutput>', () => {});
      it('Then services/ai.ts status signature is (requestId: string) and the client call is client.get<StatusAiOutput>', () => {});
      it('Then services/index.ts re-exports createAiSdk', () => {});
      it('Then client.ts wires `ai: createAiSdk(client)` into createClient()', () => {});
    });
  });
});
```

---

### Task D2: Type-flow `.test-d.ts`

**Files (max 5):**
- `packages/codegen/src/__tests__/service-sdk.test-d.ts` (new)

**What to implement:**

Build a generated-file snapshot in memory from the fixture above, then run typescript compilation against the emitted `services/*.ts` + `types/services/*.ts` in a temp dir, or — simpler — write hand-authored negative cases mirroring the expected generated shape:

```ts
interface ParseAiInput { projectId: string; message: string }
interface ParseAiOutput { parsed: boolean; tokens?: number }

declare function parse(body: ParseAiInput): { data: ParseAiOutput };

// @ts-expect-error missing `message`
parse({ projectId: 'x' });
// @ts-expect-error wrong type for projectId
parse({ projectId: 42, message: 'hi' });
// Valid call — no @ts-expect-error
const ok = parse({ projectId: 'x', message: 'hi' });
const _tokens: number | undefined = ok.data.tokens;
```

**Acceptance criteria (BDD):**

```ts
describe('Feature: generated service SDK type flow', () => {
  describe('Given the generated ParseAiInput shape', () => {
    it('Then the compiler rejects calls missing required fields', () => {});
    it('Then the compiler rejects calls with wrong field types', () => {});
    it('Then the compiler accepts valid calls and exposes typed output fields', () => {});
  });
});
```

Run via `vtz run typecheck` — `@ts-expect-error` directives fail the type check if they become unnecessary (signature got loose).

---

### Task D3: Update one example to call a service via the generated SDK

**Files (max 5):**
- `examples/entity-todo/src/api/actions/webhooks/webhooks.service.ts` (verify — likely no change)
- `examples/entity-todo/src/api/actions/webhooks/__tests__/webhooks-sdk.test.ts` (new — uses the generated `api.webhooks.sync(...)`)
- Possibly `examples/entity-todo/.vertz/generated/*` (regenerated, committed if tracked; if gitignored, the test should run codegen in setup)

**What to implement:**

Add a small test (vtz test or integration test) that imports the generated client from `#generated`, calls `api.webhooks.sync({ event: 'task.created', task: {...} })` against a mock `FetchClient`, and asserts the body + path. This proves typed service SDKs from real end-user code.

If `.vertz/generated/` is gitignored, the test setup runs `vtz codegen` first; reuse whatever helper `examples/entity-todo` already has for regeneration in tests.

**Acceptance criteria (BDD):**

```ts
describe('Feature: examples/entity-todo calls webhooks service through generated SDK', () => {
  describe('Given a generated webhooks SDK', () => {
    describe('When the example test calls api.webhooks.sync()', () => {
      it('Then the body parameter is typed as SyncWebhooksInput', () => {});
      it('Then the fetch call hits POST /webhooks/sync with the body payload', () => {});
      it('Then the return value is typed as SyncWebhooksOutput', () => {});
    });
  });
});
```

## Files touched (Phase D total)

At most 5 in D1, 1 in D2, up to 3 in D3.

## Quality gates

```bash
vtz test
vtz run typecheck
vtz run lint
```

On `examples/entity-todo`:
```bash
(cd examples/entity-todo && vtz test && vtz run typecheck)
```

## Adversarial review location

`reviews/codegen-service-sdk/phase-D-<reviewer-bot>.md`.

## Wrap-up after D

- Changeset (`patch`) under `.changeset/` describing the service SDK codegen improvement.
- Update `packages/mint-docs/` if/when service SDK usage is documented (check existing `services.mdx`).
- Retrospective under `plans/post-implementation-reviews/codegen-service-sdk.md` after merge.
