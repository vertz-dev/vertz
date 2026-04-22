---
'@vertz/runtime': patch
---

fix(vtz): route splitting no longer silently drops non-bare-identifier route components

Closes [#2787](https://github.com/vertz-dev/vertz/issues/2787).

The route-splitting transform in `defineRoutes({...})` only lazified component factories whose body was a bare-identifier call (`() => Home()`) or a JSX reference (`() => <Home />`). Any other shape — member-access (`() => Pages.Settings()`), HOC wrap (`() => withAuth(Page)`), conditional (`() => flag ? A : B`) — was silently skipped. Developers saw no warning and shipped the route eagerly, degrading bundle-splitting wins on any non-trivial app.

HOC wraps also had a latent correctness bug: `() => withAuth(Page)` was rewritten to `() => m.withAuth()` (no args) because the transform took the call's callee identifier without inspecting its arguments. The route at runtime would invoke `withAuth()` with no component to wrap.

The compiler now:

- Unwraps parentheses so `() => (Home)()` lazifies just like `() => Home()`.
- Leaves HOC wraps, member-access factories, and conditional factories eager (no incorrect rewrite).
- Emits `warning[W0780]` at the factory arrow for each of those shapes, pointing the developer at the route that is shipping eagerly.

Non-arrow factories (`component: Home`) and block-body arrows (`component: () => { return Home(); }`) are treated as deliberate opt-outs and stay silent.
