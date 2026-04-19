---
'@vertz/runtime': patch
---

fix(vtz): enrich compile errors from the file watcher with real diagnostics

The file-watcher loop in the dev server reported build errors as generic
`Compilation failed: <path>` strings with no compiler message, source
span, or code snippet. The `/__vertz_errors` WebSocket, the
`/__vertz_ai/errors` JSON endpoint, and the MCP `error_update` events
all exposed this degraded shape, forcing developers (and LLM agents) to
reverse-engineer compiler behavior by reading transpiled output.

The module-server request path already extracted structured diagnostics
(message, line, column, snippet, suggestion). That logic is now extracted
into `build_compile_error()` in `errors::categories` and shared with the
file-watcher loop, which previously used a brittle string-match on the
generated error module. Compile errors surfaced by both paths now carry
the real diagnostic from the compiler.

Closes #2818.
