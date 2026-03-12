---
'@vertz/ui': patch
'@vertz/cloudflare': patch
'@vertz/ui-server': patch
---

Add runtime image optimization for dynamic images at the edge. The `<Image>` component now rewrites absolute HTTP(S) URLs through `/_vertz/image` when `configureImageOptimizer()` is called. The Cloudflare handler supports an `imageOptimizer` config option using `cf.image` for edge transformation. Dev server includes a passthrough proxy for development.
