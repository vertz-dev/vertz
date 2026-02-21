---
'@vertz/ui': patch
---

form() attrs() now returns onSubmit for declarative JSX form wiring.

- `attrs()` accepts optional `SubmitCallbacks` and returns `{ action, method, onSubmit }`
- Added `resetOnSuccess` option to reset form element after successful submission
- `__attr()` handles boolean values: `true` sets empty attribute, `false` removes it
