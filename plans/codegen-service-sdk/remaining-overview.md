# Service SDK Codegen — Remaining Work

Design doc: `plans/codegen-service-sdk.md` (approved, 3 agent sign-offs).

Phases 1–4 of the original plan are partially implemented. See audit in PR #2759. This file enumerates what is left to close issue #2759 and make `api.<service>.<action>(input)` fully typed.

## Status snapshot (as of branch creation)

| Original phase | Status | Gap |
| --- | --- | --- |
| 1 — Compiler IR | 90% | `ServiceAnalyzer.parseActions` never reads `body`/`response`/`inject`; `ServiceActionIR.body`/`.response` always `undefined`. |
| 2 — Codegen IR | 40% | `CodegenServiceAction` lacks `inputSchema`/`outputSchema`/`resolvedInputFields`/`resolvedOutputFields`; adapter drops schema info. |
| 3 — Generators | 40% | `service-sdk-generator.ts` hard-codes `body: unknown`; no `service-types-generator.ts`; pipeline never emits service types. |
| 4 — Client integration | done | `ClientGenerator` wires services into `createClient()`. |
| 5 — E2E + example | 0% | No `.test-d.ts` for services, no example app using a typed service SDK. |

## Remaining phases

- `phase-A-analyzer-schema-extraction.md` — compiler analyzer populates `ServiceActionIR.body`/`.response` with resolved fields.
- `phase-B-codegen-schema-resolution.md` — extend `CodegenServiceAction` and teach `ir-adapter` to resolve names, fields, and path params.
- `phase-C-typed-generators.md` — add `ServiceTypesGenerator`, rewrite `ServiceSdkGenerator` to emit typed signatures, wire into pipeline.
- `phase-D-e2e-and-example.md` — integration test across the whole pipeline, `.test-d.ts` for generated types, update an example to call a service through the generated SDK.

Each phase is self-contained; an agent must read only the phase file plus the files it lists.
