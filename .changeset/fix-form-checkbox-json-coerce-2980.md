---
'@vertz/ui': patch
'@vertz/schema': patch
---

fix(ui,schema): coerce form values for JSON bodies, drop fields not in the schema

Closes [#2980](https://github.com/vertz-dev/vertz/issues/2980).

`form()` was sending checkbox values as raw strings in JSON bodies (`"concluida":"true"`) when the SDK lacked `meta.bodySchema`, causing the server to reject the request with `422 Expected boolean, received string`.

Two changes:

- `form()` no-schema fallback now uses `formDataToObject(fd, { nested: true, coerce: true })`, so plain checkbox/number inputs serialize as `boolean` / `number` in the JSON body.
- `coerceFormDataToSchema` now treats the schema as the contract: only fields declared in the schema's shape are included in the result. Unknown form keys are dropped instead of being forwarded to the server. This prevents accidental leakage (e.g. an attacker injecting `tenantId` via DevTools, or a stale `<input>` from another form) and removes a class of `.strict()`-rejection footguns.

Custom non-Vertz schema adapters keep their existing behavior — values pass through untouched so user-supplied parsers stay in control.
