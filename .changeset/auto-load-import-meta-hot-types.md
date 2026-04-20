---
'vertz': patch
---

fix(vertz): auto-load `import.meta.hot` types when importing from any client-runtime subpath

Closes [#2893](https://github.com/vertz-dev/vertz/issues/2893).

The `vertz/client` type augmentation existed but required users to manually add `"types": ["vertz/client"]` to their tsconfig — a step easy to miss, leading to the TS2339 "Property 'hot' does not exist on type 'ImportMeta'" error reported in #2777 and then again in #2893.

The client-runtime subpath declarations (`dist/ui.d.ts`, `dist/ui-components.d.ts`, `dist/ui-primitives.d.ts`, `dist/ui-auth.d.ts`) now start with `/// <reference types="vertz/client" />`, injected by a post-`tsc` step (`scripts/inject-client-reference.mjs`). Any file that imports from one of those subpaths — which includes every `create-vertz-app` scaffold's `entry-client.ts` — pulls in the `ImportMeta.hot` augmentation automatically, so `import.meta.hot?.accept()` typechecks with no tsconfig changes. Declaration sourcemaps are shifted by one line to stay accurate.

The `"types": ["vertz/client"]` opt-in still works for cases where a file uses `import.meta.hot` without touching any of those subpaths.
