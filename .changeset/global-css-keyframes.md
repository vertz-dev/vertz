---
'@vertz/ui': patch
---

fix(ui): let `globalCss()` accept nested at-rules (`@keyframes`, `@media`, `@supports`)

`globalCss({ '@keyframes spin': { from: {...}, to: {...} } })` used to fail
typecheck with `TS2353` because the block value type only allowed CSS
declarations. `GlobalStyleBlock` is now a union — either a declarations map
or a selector → declarations map — and the runtime wraps nested blocks
inside their parent at-rule.

```ts
globalCss({
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
  '@media (min-width: 768px)': {
    body: { fontSize: '18px' },
  },
});
```

Closes #2776.
