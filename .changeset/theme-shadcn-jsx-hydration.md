---
'@vertz/theme-shadcn': patch
---

Rewrite all theme-shadcn components from document.createElement to JSX for hydration compatibility. Components now use JSX elements which compile to __element() calls that correctly participate in SSR hydration node claiming.
