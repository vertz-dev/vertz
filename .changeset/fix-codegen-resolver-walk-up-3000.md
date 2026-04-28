---
'@vertz/runtime': patch
---

fix(vtz): walk up parent directories when resolving `@vertz/cli` for codegen

Closes [#3000](https://github.com/vertz-dev/vertz/issues/3000).

`vtz codegen` previously only checked `<cwd>/node_modules/@vertz/cli/dist/vertz.js`,
so it failed inside any workspace package whose `node_modules` was hoisted to the
workspace root (common in monorepos and the framework's own examples). The
resolver now walks parent directories until it finds the binary or hits the
filesystem root, mirroring Node's resolution semantics.

This unblocks `vtz dev` in workspace examples — codegen runs on startup and a
failure there caused `.vertz/generated/client.ts` to go missing, falling back to
client-only rendering and breaking e2e tests in `entity-todo`, `linear`, and
`task-manager`.
