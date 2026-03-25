---
'@vertz/ui-compiler': patch
'@vertz/cli': patch
'@vertz/ui-server': patch
---

Fix AOT route extraction to handle dynamic imports, function calls, and bare identifiers alongside existing JSX patterns. Fix AOT bundle failures caused by missing helper imports and query variable scope leaks. Improve AOT bundle error logging with detailed messages and stack traces.
