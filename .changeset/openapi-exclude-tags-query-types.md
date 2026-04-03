---
'@vertz/openapi': patch
---

fix(openapi): show raw tag names in duplicate method error, add index signature to query types

The duplicate-method-names error now includes the raw OpenAPI tag names
(e.g. `tags: "internal"`) so users know the exact value to pass to
`excludeTags`. Previously only the sanitized resource name was shown.

Generated query parameter interfaces now include `[key: string]: unknown`
so they are assignable to `Record<string, unknown>` as expected by
`FetchClient.get()`.
