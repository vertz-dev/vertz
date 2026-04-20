---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

fix(ui,ui-server): unwrap function thunks in __conditional and SSR normalizeChildren [#2899]

The compiler wraps `children ?? value` as `__conditional(..., () => children, () => value)`, but `children` can itself be a reactive getter (`() => __staticText("Apple")`). `trueFn()` then returns a function instead of a Node, which `String()` stringifies into the function's source code and ships as visible text — breaking every `<Select.Item>Apple</Select.Item>` on the component-docs site.

Fix: `insertContentBefore` / `appendBranchContent` in `@vertz/ui`'s `__conditional` now unwrap nested function thunks before inserting. Same fix landed on `@vertz/ui-server`'s SSR `normalizeChildren` so library code that uses classic JSX factories (ui-primitives) is safe too.
