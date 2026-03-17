---
'@vertz/theme-shadcn': patch
---

Remove unnecessary type castings from themed primitive components. Eliminated `as ComposedProps` and `as ThemedComponent` casts across 23 files where proper type inference works naturally through `withStyles()` and `Object.assign`. Only JSX-to-HTMLElement narrowing casts (3 in drawer.tsx) remain with SAFETY comments.
