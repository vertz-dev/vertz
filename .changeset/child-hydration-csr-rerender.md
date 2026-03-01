---
'@vertz/ui': patch
---

Fix `__child()` reactive insert hydration: CSR re-render children instead of attempting to hydrate JSX runtime output.

During SSR hydration, `__child()` claims the `<span style="display:contents">` wrapper but previously skipped its first effect run, assuming SSR content was correct. However, JSX inside reactive callbacks (e.g., `queryMatch` data branch) goes through the JSX runtime which uses `document.createElement()` — not hydration-aware. This caused detached DOM nodes with dead event handlers.

The fix clears SSR children from the claimed span and re-renders them via CSR by pausing hydration during the first synchronous `domEffect` run. No visual flash occurs since `domEffect` executes synchronously on first call, before browser paint.
