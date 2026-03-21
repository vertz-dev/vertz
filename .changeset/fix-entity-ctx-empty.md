---
'@vertz/server': patch
---

Fix entity route handlers receiving empty `ctx.entity` instead of actual entity operations from the registry. The `makeEntityCtx` helper now always resolves entity operations via `registry.get()` instead of silently falling back to an empty object. Hooks (`before.create`, `after.update`, etc.) and action handlers now correctly receive `ctx.entity` with all CRUD methods populated.
