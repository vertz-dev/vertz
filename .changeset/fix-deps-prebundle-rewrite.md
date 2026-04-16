---
'@vertz/runtime': patch
---

fix(vtz): rewrite bare imports inside pre-bundled `/@deps/` files

The dev server's pre-bundle short-circuit previously served files from
`.vertz/deps/` verbatim. When a bundle still contained bare specifiers
(e.g. an `@vertz/theme-shadcn` bundle with `import { css } from "@vertz/ui"`),
the browser rejected it with `Failed to resolve module specifier "@vertz/ui"`.
The pre-bundle branch now runs the same import rewriter used by the direct
`node_modules/` serve path. Closes #2730.
