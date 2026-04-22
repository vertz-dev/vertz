---
'@vertz/ui-server': patch
'@vertz/native-compiler': patch
'vtz': patch
---

fix(compiler): disambiguate context stable ids when two `createContext` calls share a variable name in the same file

Closes [#2786](https://github.com/vertz-dev/vertz/issues/2786).

`injectContextStableIds` generated the id as `{filePath}::{varName}`. Two `createContext()` calls in the same file with the same variable name (e.g. an inlined/formatted pair on one line, or a code-generated module) produced the same id, so the runtime context registry silently returned the same object for both — breaking Provider/useContext pairing.

Both the Rust transform (`native/vertz-compiler-core/src/context_stable_ids.rs`) and the TypeScript sibling (`packages/ui-server/src/build-plugin/context-stable-ids.ts`) now track a per-name occurrence counter and suffix `@N` on repeats. The first occurrence of a name keeps the original `{filePath}::{varName}` id (so existing single-context files are unchanged); the second becomes `{filePath}::{varName}@1`, the third `@2`, and so on.

A per-name counter is used rather than a source span because counters only shift when contexts are added or removed, whereas spans shift on any edit to earlier code — counters are more HMR-stable.
