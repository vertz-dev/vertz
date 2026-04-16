---
'@vertz/runtime': patch
---

Add `codegen` subcommand to the vtz CLI, fixing `vtz run codegen` and `vtz dev` codegen step that broke when `@vertz/runtime` bin entry shadowed `@vertz/cli`
