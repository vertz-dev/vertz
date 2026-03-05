---
'@vertz/create-vertz-app': patch
---

Add bunfig.toml and bun-plugin-shim.ts to scaffolded projects. Without these, Bun's dev server client bundler skips the Vertz compiler plugin, causing SSR content to vanish after hydration.
