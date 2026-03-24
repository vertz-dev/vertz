---
'@vertz/core': patch
---

Add `.env` file loading to `createEnv()` via the `load` property. Files listed in `load` are parsed and merged in order, overriding `process.env`. Missing files are silently skipped.
