---
'vtz': patch
---

fix(compiler): shorthand method definitions no longer trigger false import injection

`contains_standalone_call()` now detects shorthand method definitions like `{ batch(items) { } }` by matching the closing `)` and checking for a following `{`. Previously, these were incorrectly treated as standalone function calls, causing spurious `import { batch } from '@vertz/ui'` injections.
