---
'@vertz/ui': patch
---

Add `revalidateOn` option to `form()` for per-field re-validation after submit. Fields with errors now re-validate on blur (default), change, or only on submit. Includes single-field validation via schema `.shape` traversal with `OptionalSchema`/`DefaultSchema` unwrapping.
