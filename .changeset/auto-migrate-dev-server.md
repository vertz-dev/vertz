---
'@vertz/cli': patch
'@vertz/db': patch
---

Wire auto-migrate into the dev server pipeline. Schema file changes now automatically sync the database during `vertz dev`, with graceful skipping for UI-only projects and destructive change warnings.
