---
'@vertz/native-compiler': patch
'@vertz/ui-primitives': patch
---

fix(compiler): recognize regex literals in `strip_comments` so a backtick inside a regex body doesn't eat the rest of the file

Closes [#2878](https://github.com/vertz-dev/vertz/issues/2878).

The native compiler's `import_injection` pass scans source for helper usage via `strip_comments`, which replaces string-literal contents with spaces so `signal()` inside a template literal doesn't trigger a spurious `signal` import. A `` ` `` inside a regex literal like ``/`([^`]+)`/`` was being treated as a template-literal opener — the scanner then consumed everything to EOF looking for a closing backtick and erased every subsequent helper call (`__element`, `__flushMountFrame`, `__discardMountFrame`, …). Those helpers then never made it into the generated import block and the bundled component crashed at runtime with `ReferenceError: __flushMountFrame is not defined` as soon as it tried to render under SSR.

`strip_comments` now detects regex literals (using the preceding-token heuristic — `/` after `)`, `]`, `}`, or an expression-valued identifier is division; anything else that isn't a `//` or `/*` comment starts a regex) and copies the regex body verbatim. Fixes pre-render for routes that transitively rendered `packages/landing/src/components/features.tsx` (vertz.dev `/` and `/openapi`), which reached the landing page as the inner repro from #2878.

Also adds a List SSR regression test in `@vertz/ui-primitives` covering `<List><List.Item/></List>` end-to-end through `ssrRenderSinglePass` so the Provider/context flow the original ticket worried about is exercised on the server path.
