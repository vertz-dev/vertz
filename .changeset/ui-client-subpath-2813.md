---
'@vertz/ui': patch
'vertz': patch
---

feat(ui): add `@vertz/ui/client` subpath for UI-only consumers of `import.meta.hot` types [#2813]

Apps that install `@vertz/ui` directly — component-library authors, or frontends that don't use the server/db layers — can now type `import.meta.hot` without pulling in the `vertz` meta-package:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["@vertz/ui/client"],
  },
}
```

The canonical augmentation now lives in `@vertz/ui/client.d.ts`. `vertz/client` continues to work and resolves to the same shape — it re-exports `@vertz/ui/client` via a triple-slash reference, so the two subpaths cannot drift.
