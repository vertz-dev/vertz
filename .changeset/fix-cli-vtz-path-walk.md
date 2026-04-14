---
'@vertz/runtime': patch
---

Fix cli.sh to walk full PATH when resolving native binary, so nested vtz invocations in CI find the binary even when self-referencing symlinks shadow it
