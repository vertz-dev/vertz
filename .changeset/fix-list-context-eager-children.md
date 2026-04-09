---
'@vertz/theme-shadcn': patch
---

fix(theme-shadcn): preserve children getter descriptors in themed List wrapper to prevent eager evaluation before ListContext.Provider is active
