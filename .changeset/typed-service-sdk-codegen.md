---
'@vertz/codegen': patch
'@vertz/compiler': patch
---

feat(codegen): generate typed SDK for services (#2759)

`vtz codegen` now emits fully typed SDKs for `service()` definitions, not just
entities. The compiler walks `action({ body, response })` schemas via the
`SchemaLike<T>.parse()` contract and surfaces the resolved field shapes on
the IR. The codegen pipeline then emits:

- `types/services/{name}.ts` — `${ActionPascal}${ServicePascal}Input` /
  `Output` interfaces with TS_TYPE_MAP (date → string for JSON transport).
- `services/{name}.ts` — SDK with `(body: InputType)` signatures and
  `client.<method><OutputType>()` calls. Falls back to `unknown` when a
  schema can't be resolved.

Callers like `api.ai.parse({ projectId, message })` now get full compile-time
type safety, preserving SSR integration, caching, and optimistic updates
without falling back to raw `fetch()`.

Also includes a deny-by-default access filter: service actions with no
`access` entry resolved to `'function'` are now excluded from generated
SDKs (previously they leaked through).
