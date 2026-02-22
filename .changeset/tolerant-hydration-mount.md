---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
---

Add tolerant hydration mode for `mount()`. Use `mount(app, '#root', { hydration: 'tolerant' })` to walk existing SSR DOM and attach reactivity instead of clearing and re-rendering. Browser extension nodes are gracefully skipped during hydration. If hydration fails, automatically falls back to full CSR re-render. Compiler emits `__enterChildren`/`__exitChildren`/`__append`/`__staticText` for hydration cursor support.
