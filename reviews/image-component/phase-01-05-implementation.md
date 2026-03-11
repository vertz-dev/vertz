# Phase 1-5: Image Component Implementation

- **Author:** Claude (Opus 4.6)
- **Reviewer:** Claude (adversarial review)
- **Date:** 2026-03-11

## Changes

### Phase 1: Runtime Image Component
- `packages/ui/src/image/types.ts` (new) — ImageProps interface
- `packages/ui/src/image/image.ts` (new) — Runtime `<Image>` component
- `packages/ui/src/image/__tests__/image.test.ts` (new) — 14 BDD tests
- `packages/ui/src/image/__tests__/image.test-d.ts` (new) — 5 type-level tests
- `packages/ui/src/index.ts` (modified) — Added Image exports

### Phase 2: AST Transform
- `packages/ui-server/src/bun-plugin/image-transform.ts` (new) — ts-morph + MagicString transform
- `packages/ui-server/src/bun-plugin/__tests__/image-transform.test.ts` (new) — 18 BDD tests

### Phase 3: Image Processor
- `packages/ui-server/src/bun-plugin/image-processor.ts` (new) — Sharp-based resize + WebP
- `packages/ui-server/src/bun-plugin/__tests__/image-processor.test.ts` (new) — 10 tests

### Phase 4: Pipeline Integration
- `packages/ui-server/src/bun-plugin/plugin.ts` (modified) — Step 2.7 image transform
- `packages/ui-server/src/bun-dev-server.ts` (modified) — `/__vertz_img/` route
- `packages/ui-server/package.json` (modified) — Added sharp dependency

### Phase 5: Landing Page Integration
- `sites/landing/src/components/founders.tsx` (modified) — Use `<Image>` from `@vertz/ui`

## CI Status

- [x] Tests pass: 1880 (ui) + 573 (ui-server) = 2453 total
- [x] Typecheck clean: ui, ui-server, landing
- [x] Lint clean (only pre-existing warnings)

## Review Findings

### Blocking (Fixed)

1. **B1: Path traversal in `/__vertz_img/` route** — `imgName` could contain `../` to escape the images directory. Fixed: added `..` and null byte checks + `startsWith(imagesDir)` guard.

2. **B2: XSS via unescaped attributes** — User-provided string values (alt, class, style, etc.) were interpolated into generated HTML without escaping. Fixed: added `escapeAttr()` function that escapes `&`, `"`, `<`, `>`. Applied to all interpolated attribute values.

3. **B3: Operator precedence in content-type detection** — `ext === 'jpg' || ext === 'jpeg' ? ...` had wrong operator precedence due to `||` vs `?:`. Fixed: replaced nested ternary with a `Record<string, string>` lookup table.

4. **B4: Silent class loss** — Transform would silently drop dynamic `class` attributes. Fixed: `extractStaticProps` now bails on dynamic `class`, `style`, and `pictureClass` to avoid silent attribute loss.

## Resolution

All blocking bugs fixed and tested. Added test for XSS escaping and dynamic class bail-out. Quality gates re-run and passing.
