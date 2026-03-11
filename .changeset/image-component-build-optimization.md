---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

feat(ui): Image component with build-time optimization

Add `<Image>` component to `@vertz/ui` that renders an `<img>` element with sensible defaults (lazy loading, async decoding). At build time, the Bun plugin detects static `<Image>` usage and replaces it with optimized `<picture>` markup containing WebP 1x/2x variants and an original-format fallback.

- Runtime `<Image>` component with priority prop, pass-through attributes
- AST-based transform using ts-morph for reliable detection
- Sharp-based image processor with content-hash caching
- `/__vertz_img/` route for serving optimized images with path traversal protection
- HTML attribute escaping to prevent XSS in generated markup
