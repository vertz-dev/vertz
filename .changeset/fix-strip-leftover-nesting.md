---
'@vertz/runtime': patch
---

Fix scoping bug where object properties inside nested parentheses were incorrectly stripped as TypeScript type annotations, causing `await expect(fn({key: Value})).rejects.toThrow()` to fail with "key is not defined"
