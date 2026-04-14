---
'@vertz/cli': patch
'@vertz/runtime': patch
---

Fix runtime detection tests to support vtz as a valid runtime, fix path.dirname("/") returning "." instead of "/" in the vtz runtime, and fix version-check tests to explicitly chmod shell scripts
