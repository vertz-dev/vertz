---
'@vertz/ui': patch
'@vertz/schema': patch
---

fix(ui,schema): coerce FormData to schema-declared types in `form()` (#2771)

`form()` now coerces FormData values to match the body schema's declared types
before validation and submission.

- Boolean fields: checked → `true`; unchecked → `false`; `value="false"`/`"0"`/`"off"` → `false`.
- Number/BigInt fields: numeric strings → numbers; empty strings dropped (let `optional()`/`default()` apply).
- Date fields: parseable strings → `Date`.
- String fields: never coerced, even if the value looks numeric.
- Multi-value fields: `<input type="checkbox" name="tags" value="..." />` produces `string[]`.
- The same coercion is applied to blur/change re-validation so live and submit
  errors agree.

Behavior change: (1) Custom `onSubmit` handlers that pre-coerce values should
remove that logic to avoid double-coercion. (2) User schemas that switched
fields to `s.coerce.boolean()` / `s.coerce.number()` as a workaround should
revert to strict `s.boolean()` / `s.number()` — the UI layer now handles the
conversion.

Adds a public `get element(): Schema<unknown>` accessor to `ArraySchema` in
`@vertz/schema` (additive; previously `_element` was private).
