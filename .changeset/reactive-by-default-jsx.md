---
'@vertz/ui-compiler': patch
---

Replace reactive-vs-static classification with literal-vs-non-literal for JSX codegen decisions.

Previously, the compiler used static analysis to determine if an expression was reactive (depends on signals) and only wrapped reactive expressions in `__child()` / `__attr()` / getters. This broke when reactive values flowed through function boundaries (callback parameters, HOFs, proxy-backed objects) because the parameter was classified as static.

Now, the compiler only checks if an expression is a **literal** (string, number, boolean, null). All non-literal expressions get reactive wrappers (`__child`, `__attr`, getters), and the runtime (`domEffect`) handles actual tracking. Idle effects with no signal dependencies have zero ongoing cost.

This fixes `.map()` render function parameters, `queryMatch` data handler parameters, and any user-defined HOF that receives reactive data — without workarounds.
