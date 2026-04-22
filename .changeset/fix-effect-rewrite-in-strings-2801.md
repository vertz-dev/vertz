---
'@vertz/runtime': patch
---

fix(vtz): compiler no longer rewrites `effect` → `domEffect` inside string literals or comments

Closes [#2801](https://github.com/vertz-dev/vertz/issues/2801).

The post-processing shim that renames the compiler-emitted `effect` identifier to `domEffect` used naive string replacement, so the rewrite leaked into `.test.ts` files wherever `effect(` appeared inside string literals, template literals, or comments. The most visible symptom was `it('flags effect() call', ...)` showing up in the test runner as `it('flags domEffect() call', ...)`, which broke `oxlint-plugins/__tests__/vertz-rules.test.ts > no-wrong-effect > flags effect() call`.

The shim now walks the source byte-wise and skips single-/double-/backtick-quoted strings (including escape sequences), line comments, and block comments, only rewriting standalone `effect` identifiers outside those regions. All pre-existing import- and call-site rewrites are preserved; string and comment content round-trips unchanged.
