---
'vertz': patch
'create-vertz-app': patch
---

Rename `vertz/env` → `vertz/client` so tsconfig `types` discoverability matches
the Vite convention. The augmentation now correctly types `ImportMeta.hot` as
`ImportMetaHot | undefined` (it only exists in dev), adds the `accept(cb)`
callback overload for the in-repo HMR pattern, and drops the Bun-only
`ImportMeta.main` property. Migrate by updating `tsconfig.json` to
`"types": ["vertz/client"]` and call sites to `import.meta.hot?.accept()`.

Closes #2777.
