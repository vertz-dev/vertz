---
'@vertz/openapi': patch
---

fix(openapi): generate correct types for SSE streaming endpoints

- Streaming operations now emit `*Event` type names (matching resource imports) instead of `*Response`
- `oneOf`/`anyOf` schemas at the top level generate union type aliases instead of empty interface stubs
