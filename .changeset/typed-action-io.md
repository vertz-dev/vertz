---
'@vertz/server': patch
---

Add `action()` helper for typed action I/O in entity and service definitions.

- `action()` wraps action configs to infer `input` type from `body` schema and check `return` type against `response` schema
- Fix service `TCtx` constraint: `ctx` is now typed as `ServiceContext<TInject>` for inline service actions (without `action()`)
- Add `__actions` phantom type to `EntityDefinition` for downstream type extraction
- New exports: `action`, `ActionDef`, `ActionDefNoBody`
