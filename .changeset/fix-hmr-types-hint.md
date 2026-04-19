---
'@vertz/runtime': patch
---

fix(vtz): point TS2339 on `ImportMeta.hot` at the `vertz/client` tsconfig fix

When TypeScript reports `Property 'hot' does not exist on type 'ImportMeta'`
— the common symptom of a tsconfig missing the `vertz/client` type
augmentation — the dev server now appends a Vertz-specific hint with the
exact fix and a link to `https://vertz.dev/guides/hmr-types`.

The hint only fires for the `'hot'` + `'ImportMeta'` shape, so other
TS2339 errors keep the generic suggestion. Set `VTZ_NO_HMR_HINT=1` to
suppress the hint if you don't want it.

Closes #2814.
