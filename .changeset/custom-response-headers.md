---
"@vertz/server": patch
---

Add `response()` helper for custom response headers and status codes in service and entity action handlers. Handlers can now return `response(data, { headers, status })` to customize the HTTP response while keeping backward compatibility with plain return values.
