---
'@vertz/server': patch
'@vertz/core': patch
'@vertz/ui-server': patch
'@vertz/cloudflare': patch
'@vertz/cli': patch
---

feat(server): allow customizing or removing the `/api/` route prefix (#2131)

- `createServer({ apiPrefix: '/v1' })` changes all generated routes from `/api/*` to `/v1/*`
- API-only apps can use `apiPrefix: ''` to mount routes at the root
- Full-stack apps require a non-empty prefix (enforced at dev server and Cloudflare handler)
- Auth cookie paths (`Path=`) automatically follow the resolved prefix
- Cloudflare handler reads `app.apiPrefix` at runtime when not explicitly configured
- `basePath` option in `@vertz/cloudflare` renamed to `apiPrefix` for consistency
