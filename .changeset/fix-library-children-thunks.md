---
'@vertz/ui-primitives': patch
'@vertz/theme-shadcn': patch
'@vertz/ui-server': patch
---

fix(build): use native compiler for library builds so Provider children are thunked

Library packages (ui-primitives, theme-shadcn) were compiled with Bun's JSX fallback
instead of the native Rust compiler. The fallback doesn't wrap JSX children in thunks,
causing context-based components (List, Tabs, Dialog, etc.) to throw "must be used
inside" errors because children evaluate before the Provider sets up context.
