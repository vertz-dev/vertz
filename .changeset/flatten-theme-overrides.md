---
'@vertz/theme-shadcn': patch
---

fix(theme-shadcn): flatten configureTheme override API — `colors` replaces `overrides.tokens.colors`

**BREAKING:** `ThemeConfig.overrides` is removed. Use `ThemeConfig.colors` instead:

```ts
// Before
configureTheme({ overrides: { tokens: { colors: { primary: { DEFAULT: '#7c3aed' } } } } })

// After
configureTheme({ colors: { primary: { DEFAULT: '#7c3aed' } } })
```
