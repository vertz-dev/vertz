---
'@vertz/cli': patch
---

Fix AOT routes bundle importing react/jsx-dev-runtime instead of Vertz JSX runtime, which caused loadAotManifest() to silently return null and degrade to single-pass SSR
