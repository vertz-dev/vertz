---
'@vertz/runtime': patch
---

Add path traversal validation to both Rust deps resolver and JS CJS resolver to prevent malicious package.json exports from resolving files outside the package directory
