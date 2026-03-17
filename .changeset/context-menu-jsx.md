---
'@vertz/ui-primitives': patch
'@vertz/theme-shadcn': patch
'@vertz/ui': patch
---

feat(theme-shadcn): convert contextMenu factory to JSX component

Convert the `contextMenu` primitive from an imperative factory function to a
declarative JSX component with `.Trigger`, `.Content`, `.Item`, `.Group`,
`.Label`, and `.Separator` sub-components.

- Add `ComposedContextMenu` in `@vertz/ui-primitives` (context-based sub-component wiring)
- Replace imperative `createThemedContextMenu` factory with `withStyles()` wrapper
- Promote from lowercase `contextMenu` factory to PascalCase `ContextMenu` compound proxy
- Importable from `@vertz/ui/components` as `ContextMenu`
- No `document.createElement` — fully declarative JSX
