# Phases 1-4: SSR Delivery Optimizations

- **Author:** Implementation agent
- **Reviewer:** Adversarial review agent
- **Commits:** 52c8563f..04bafa9d
- **Date:** 2026-03-11

## Changes

- `packages/ui/src/css/font.ts` (modified) -- added `PreloadItem` interface, `preloadItems` to `CompiledFonts`
- `packages/ui/src/css/theme.ts` (modified) -- propagates `preloadItems` through `CompiledTheme`
- `packages/ui/src/css/index.ts` (modified) -- re-exports `PreloadItem`
- `packages/ui/src/css/public.ts` (modified) -- re-exports `PreloadItem`
- `packages/ui/src/index.ts` (modified) -- re-exports `PreloadItem`, removes Image component
- `packages/ui-server/src/ssr-render.ts` (modified) -- CSS consolidation: 1 style tag per category
- `packages/ui-server/src/render-to-html.ts` (modified) -- CSS consolidation: single style tag for all CSS
- `packages/ui-server/src/ssr-handler.ts` (modified) -- Link headers, modulepreload, cacheControl
- `packages/ui-server/src/ssr-html.ts` (modified) -- modulepreload support in `generateSSRHtml`
- `packages/ui-server/src/bun-dev-server.ts` (modified) -- removed image serving route
- `packages/ui-server/src/bun-plugin/plugin.ts` (modified) -- removed image transform pipeline
- `packages/ui/src/image/*` (deleted) -- Image component removed
- `packages/ui-server/src/bun-plugin/image-*` (deleted) -- image processing removed
- `packages/cloudflare/tests/handler.test.ts` (modified) -- mock fix for stream reuse
- `packages/vertz/package.json` (modified) -- switched from dist to src exports
- Various test files (new/modified) -- tests for all new behavior

## CI Status

- [ ] `dagger call ci` passed at `<pending>`

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases (see Findings)
- [ ] No security issues (see Findings)
- [x] Public API changes match design doc

## Findings

### BUG (severity: medium) -- Link header `href` values are not escaped

**File:** `packages/ui-server/src/ssr-handler.ts`, lines 102-111

The `buildLinkHeader()` function interpolates `item.href` directly into the Link header value without any escaping:

```typescript
const parts = [`<${item.href}>`, 'rel=preload', `as=${item.as}`];
```

If a font `src` path contains characters meaningful in HTTP headers (e.g., `>`, `,`, `;`, newlines), they could break the Link header format or enable header injection. While font paths are typically developer-controlled and come from `font()` descriptors, the `PreloadItem` interface is public -- any consumer could construct items with malicious hrefs.

The `preloadTags` HTML path uses `escapeHtmlAttr()` for the same paths. The Link header path has no equivalent sanitization.

**Recommendation:** At minimum, validate/reject hrefs containing `>`, `,`, `;`, `\r`, `\n`. Ideally, percent-encode unsafe characters per RFC 8288.

**Risk assessment:** Low in practice (font paths are developer-controlled static strings), but the interface is public, and the defense-in-depth principle applies. An `href` of `</foo>; rel=preload; as=script, <https://evil.com/track>` would inject an arbitrary preload.

### BUG (severity: medium) -- `cacheControl` applied to ALL HTML responses including errors... wait, actually it's NOT

Looking more carefully at `handleHTMLRequest` (line 218-244): the `cacheControl` header is only set inside the `try` block (line 236), before the `return new Response(html, ...)` on line 238. The `catch` block returns a plain 500 response without `Cache-Control`. This is correct behavior -- **error responses should not be cached**. The test at line 318 ("does not set Cache-Control on error responses") confirms this. Well done.

### OBSERVATION (severity: low) -- `compileTheme` is called twice per request cycle in production

In the production SSR handler flow:

1. **Once at initialization** in `createSSRHandler()` (line 138) -- extracts `preloadItems` for the Link header.
2. **Once per request** in `ssrRenderToString()` (line 179 of `ssr-render.ts`) -- extracts `css` and `preloadTags`.

The per-request call was pre-existing and is needed because `ssrRenderToString` is a general-purpose function used by both the production handler and the dev server. The initialization call is new but runs only once.

This is acceptable but worth noting: `compileTheme` is a pure function of its inputs (theme + fallbackMetrics), so its result could be cached and passed through to `ssrRenderToString` to avoid the per-request call entirely. This is an optimization opportunity, not a bug.

### OBSERVATION (severity: low) -- CSS consolidation uses different strategies in `ssr-render.ts` vs `render-to-html.ts`

- **`ssr-render.ts` (`collectCSS`):** Keeps 3 separate `<style data-vertz-css>` tags (theme, globals, components) to preserve cascade order.
- **`render-to-html.ts` (`twoPassRender`):** Merges everything into a single `<style>` tag (no `data-vertz-css` attribute).

This inconsistency is actually **intentional and correct**: `ssr-render.ts` is used by the production handler which has a template with existing styles, so cascade order matters. `render-to-html.ts` generates a standalone HTML document from scratch where all CSS is controlled. However, the `render-to-html.ts` path loses the `data-vertz-css` attribute that the other path uses, which could matter for tooling that queries these attributes (e.g., HMR CSS replacement).

**Recommendation:** Add `data-vertz-css` to the style tag in `render-to-html.ts` for consistency, or document the intentional difference.

### APPROVED -- CSS cascade order is preserved in `ssr-render.ts`

The `collectCSS()` function correctly maintains cascade order: theme vars first, then global resets, then component styles. Each category gets its own `<style>` tag, and they are joined in order. The deduplication logic (`alreadyIncluded` Set) correctly prevents component CSS from duplicating theme or global CSS.

### APPROVED -- `PreloadItem` type is properly exported through the full chain

Export chain: `font.ts` (definition) -> `index.ts` -> `public.ts` -> `@vertz/ui` barrel. The type is used in `CompiledFonts`, `CompiledTheme`, and imported in `ssr-handler.ts`. No `as any` or type gaps found.

### APPROVED -- `modulepreload` paths are properly escaped

`buildModulepreloadTags()` uses `escapeAttr()` from `html-serializer.ts` which escapes `&` and `"`. `generateSSRHtml()` uses `escapeAttr()` from the same module. Both paths are safe against attribute injection.

### APPROVED -- Empty array edge cases are handled

- `compileFonts` with no src: returns `preloadItems: []` -- tested.
- `compileTheme` with no fonts: returns `preloadItems: []` -- tested.
- `buildLinkHeader` with empty array: returns `''` -- the caller checks `.length > 0` before calling.
- `buildModulepreloadTags` with empty array: returns `''` -- the caller checks `?.length`.
- `collectCSS` with no component CSS: returns no component tag -- the `.filter(Boolean)` handles it.

### OBSERVATION (severity: low) -- Breaking change: `CompiledFonts` and `CompiledTheme` have new required `preloadItems` field

Any external code that constructs `CompiledFonts` or `CompiledTheme` objects manually (unlikely but possible) will get a TypeScript error because `preloadItems` is required. Since these are return types from `compileFonts()`/`compileTheme()` and all packages are pre-v1, this is acceptable per the breaking changes policy. No action needed.

### OBSERVATION (severity: info) -- Unrelated changes bundled in this PR

This branch includes significant unrelated changes:
- Removal of the entire Image component (`packages/ui/src/image/`)
- Removal of image transform pipeline (`packages/ui-server/src/bun-plugin/image-*`)
- Removal of image serving route from dev server
- Removal of `diagnostics-collector` field miss tracking
- Removal of `field-selection-tracker` from `@vertz/ui`
- `packages/vertz/package.json` switched from `dist/` to `src/` exports (significant change)
- Cloudflare handler test mock fixes (`.mockImplementation(() => new Response(...))` -> `.mockResolvedValue(new Response(...))`)

While the image removal is referenced in the issue description context (it was a previous PR that's being cleaned up), these changes are not part of issue #1172's scope. The `package.json` export change from `dist/` to `src/` is particularly notable -- it fundamentally changes how the meta-package works.

**Recommendation:** Consider splitting unrelated removals into a separate commit or PR for cleaner git history.

### TEST QUALITY -- Coverage is good but missing one edge case

**Covered:**
- CSS consolidation: single tag per category (ssr-render), single tag total (render-to-html)
- At-most-3-style-tags scenario (theme + globals + components)
- Link header with font preloads
- modulepreload injection in head
- Cache-Control default (absent), set when provided, absent on error
- `preloadItems` for single font, multiple fonts, no-src font, no fonts

**Missing:**
- No test for `buildLinkHeader` with multiple fonts (the test uses a single font)
- No test for `modulepreload` with XSS-attempt paths (e.g., `href` containing `"` or `>`)
- No test for `generateSSRHtml` (ssr-html.ts) `modulepreload` option -- only the handler path is tested
- No test for `buildLinkHeader` with `type: undefined` or `crossorigin: false` to verify those branches

### NITS

1. **Stale JSDoc:** `ssr-handler.ts` line 92-99 has the old JSDoc comment for `createSSRHandler` immediately followed by the `buildLinkHeader` JSDoc. The old JSDoc block is now orphaned:
   ```typescript
   /**
    * Create a web-standard SSR request handler.
    * ...
    * Does NOT serve static files -- that's the adapter/platform's job.
    */
   /** Build an HTTP Link header value from structured preload items. */
   function buildLinkHeader(items: PreloadItem[]): string {
   ```
   The first JSDoc comment is now attached to nothing (or worse, to `buildLinkHeader`). The `createSSRHandler` function definition is on line 118, far below.

2. **`handleHTMLRequest` parameter count:** 9 positional parameters is unwieldy. Consider an options object.

## Resolution

### Changes Requested

1. **Must fix:** Sanitize `item.href` in `buildLinkHeader()` -- at minimum reject or strip `>`, `,`, `;`, `\r`, `\n` characters.
2. **Must fix:** Remove the orphaned JSDoc comment block at lines 92-99 of `ssr-handler.ts`.
3. **Should fix:** Add test for `buildLinkHeader` with multiple preload items.
4. **Should fix:** Add test for `generateSSRHtml` modulepreload option.
5. **Consider:** Add `data-vertz-css` attribute to the style tag in `render-to-html.ts` for consistency.
6. **Consider:** Refactor `handleHTMLRequest` to accept an options object instead of 9 positional parameters.
