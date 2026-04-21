---
'@vertz/schema': patch
---

fix(schema): user-friendly invalid-type messages for `s.number()` / `s.bigint()` / `s.date()`

Closes [#2809](https://github.com/vertz-dev/vertz/issues/2809).

The form-data coercion layer (`coerceLeaf` in `@vertz/ui`) deliberately passes non-numeric / unparseable strings through to the schema unchanged so the schema's own validator owns the error message. That rested on the schema producing something end-user-readable, which it didn't — `s.number().parse('42a')` produced `"Expected number, received string"`, which is technically accurate but useless in a form field. `#2771` made FormData coercion implicit (users write `s.number()`, not `s.coerce.number()`), which put these messages directly in front of end users.

The default messages are now:

- `s.number()` → `"Must be a number"` (covers non-number values, NaN, and pass-through strings like `"42a"`)
- `s.bigint()` → `"Must be an integer"`
- `s.date()` → `"Must be a valid date"` (covers non-Date values and invalid `Date` objects with `NaN` time)

Each schema also gets a `.message(msg)` chainable method so apps can localise or customise:

```ts
s.number().message('Age must be a number')
s.date().message('Pick a valid date').min(new Date('2024-01-01'))
```

The custom message is preserved across clones (e.g. after `.gte()`, `.min()`).
