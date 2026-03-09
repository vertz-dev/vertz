# Phase 1: Font System — Architecture Review

- **Author:** implementation agent
- **Reviewer:** mike (tech lead / architecture)
- **Date:** 2026-03-09

## Changes

- `packages/ui/src/css/font.ts` (new)
- `packages/ui/src/css/__tests__/font.test.ts` (new)
- `packages/ui/src/css/theme.ts` (modified)
- `packages/ui/src/css/index.ts` (modified)
- `packages/ui/src/css/public.ts` (modified)
- `packages/ui/src/index.ts` (modified)
- `packages/ui-server/src/ssr-render.ts` (modified)
- `packages/ui-server/src/ssr-html.ts` (modified)
- `packages/ui-server/src/bun-dev-server.ts` (modified)
- `packages/ui-server/src/ssr-handler.ts` (modified)
- `sites/landing/src/styles/fonts.ts` (deleted)
- `sites/landing/src/styles/theme.ts` (modified)
- `sites/landing/src/styles/globals.ts` (modified)
- `sites/landing/src/app.tsx` (modified)
- `sites/landing/src/dev-server.ts` (modified)
- `sites/landing/scripts/build.ts` (modified)

## Review Checklist

- [x] Delivers what the ticket asks for (Phase 1: descriptor + compilation + SSR injection)
- [x] TDD compliance (font.test.ts + theme.test.ts cover the new code)
- [ ] No type gaps or missing edge cases (see findings)
- [ ] No security issues (see findings)
- [x] Public API changes match design doc intent

## Findings

### BLOCKER: Production SSR handler drops headTags/preloadTags

**File:** `packages/ui-server/src/ssr-handler.ts`

The `injectIntoTemplate` function now accepts a `headTags` parameter and injects it before `</head>`. However, the injection ordering is wrong -- `headTags` is injected before CSS, which means the string replacement chain looks like:

```
</head>  -->  ${headTags}\n</head>  -->  ${appCss}\n${headTags}\n</head>
```

This means CSS ends up ABOVE the preload hints. Preload hints should appear BEFORE CSS so the browser can start fetching fonts while parsing CSS. This is the opposite of what the dev server does (where `generateSSRPageHtml` puts `headTags` before `css` in the template literal). The inconsistency means dev/prod have different font loading behavior -- the exact problem the issue (#1079) says this feature should eliminate.

**Severity:** Blocker. The whole point of this feature is dev/prod parity.

**Fix:** Swap the injection order in `injectIntoTemplate` so `headTags` is injected first (closer to top of `<head>`), then CSS. Or better: inject `headTags` after `<head>` (or after `<meta charset>`) rather than before `</head>`, so they precede everything else regardless of later injections.

### BLOCKER: Production SSR handler silently drops headTags on error path

**File:** `packages/ui-server/src/ssr-handler.ts`, line 167

When `handleHTMLRequest` catches an SSR error, it returns a generic 500 response with no HTML at all. While this is the existing behavior, it means font preloads are lost on error. The dev server's error path (line 1240-1248 in `bun-dev-server.ts`) still passes `headTags` to the fallback HTML. These should be consistent.

**Severity:** Low (existing behavior, not introduced by this PR). Noting for consistency.

### SHOULD-FIX: Dual `:root` blocks when fonts + colors are both present

**File:** `packages/ui/src/css/theme.ts`, `compileTheme()`

`compileFonts()` generates its own `:root { --font-sans: ...; }` block. `compileTheme()` generates a separate `:root { --color-primary-500: ...; }` block. The compiled CSS output contains two `:root` blocks:

```css
:root {
  --font-sans: 'DM Sans', system-ui, sans-serif;
}

:root {
  --color-primary-500: #3b82f6;
  ...
}
```

While browsers handle multiple `:root` blocks correctly (they merge), this is suboptimal and atypical. It also means the font CSS vars are separated from the color CSS vars by the `@font-face` declarations (since `fontCss` is placed first in the blocks array).

**Fix:** Merge the font CSS vars into the same `:root` block as colors/spacing. Keep `@font-face` declarations outside `:root` (correct), but fold `--font-*` vars into the existing `rootVars` array in `compileTheme()`. This eliminates the second `:root` block and makes the output cleaner.

### SHOULD-FIX: No SSR integration test for headTags/preloadTags

**Files:** `packages/ui-server/src/__tests__/ssr-html.test.ts`, `packages/ui-server/src/__tests__/ssr-handler.test.ts`

The `generateSSRHtml()` function now accepts `headTags` but there is zero test coverage for this in `ssr-html.test.ts`. The `ssr-handler.test.ts` has no tests for headTags propagation either. The `ssrRenderToString` function now returns `headTags` but there is no test in the ui-server package validating this end-to-end.

The font.test.ts and theme.test.ts tests are solid for the @vertz/ui package side, but the @vertz/ui-server integration (where headTags flows from `compileTheme().preloadTags` through `ssrRenderToString().headTags` into the HTML document) is completely untested.

**Fix:** Add tests to `ssr-html.test.ts` verifying headTags injection placement. Add at least one integration test showing that a module with `theme.fonts` produces preload tags in the final HTML.

### SHOULD-FIX: Landing page `{ ...theme, fonts: { ... } }` spread is fragile

**File:** `sites/landing/src/styles/theme.ts`, line 44

```ts
export const landingTheme = { ...theme, fonts: { sans, display, mono } };
```

`configureTheme()` returns a `Theme` object from `defineTheme({ colors })`. The spread `{ ...theme, fonts: { ... } }` creates a new plain object that happens to satisfy the `Theme` interface (since `fonts` is optional). But this pattern has issues:

1. **Type safety is accidental.** There is no type annotation on `landingTheme`. If `Theme` gains a new required property in the future, this spread will silently create an invalid object that TypeScript won't catch.
2. **`configureTheme` should support fonts natively.** The issue (#1079) shows `defineTheme({ fonts: { sans, display, mono } })` as the intended API. The `ThemeConfig` in `@vertz/theme-shadcn` should accept a `fonts` field and thread it through to `defineTheme()`. The current spread pattern works but is a workaround, not the intended integration point.

**Fix (Phase 1):** Annotate the landing theme: `export const landingTheme: Theme = { ...theme, fonts: { ... } }`. This ensures type safety.

**Fix (Phase 2 / follow-up):** Add `fonts?: Record<string, FontDescriptor>` to `ThemeConfig` in `@vertz/theme-shadcn` so users can write:

```ts
const { theme } = configureTheme({
  palette: 'zinc',
  fonts: { sans, display, mono },
});
```

### NOTE: `font-display` and `font-style` values are not validated or sanitized

**File:** `packages/ui/src/css/font.ts`, `buildFontFace()`

The `style` and `display` fields are inserted directly into CSS without sanitization:

```ts
`  font-style: ${style};`,
`  font-weight: ${toCssWeight(weight)};`,
`  font-display: ${display};`,
```

The `style` field is typed as `'normal' | 'italic'` and `display` as `'auto' | 'block' | 'swap' | 'fallback' | 'optional'` in `FontOptions`, so TypeScript constrains the values at the call site. However, `FontDescriptor` stores these as `readonly style: string` and `readonly display: string`. If a descriptor is constructed manually (bypassing `font()`), arbitrary strings could be injected.

The `weight` field also goes through `toCssWeight()` which only does a `.replace('..', ' ')` -- no sanitization.

**Severity:** Low. The branded type (`__brand: 'FontDescriptor'`) makes manual construction unlikely but not impossible. The public API surface (`font()`) constrains inputs correctly.

**Fix:** Either tighten the `FontDescriptor` types to use the same union types as `FontOptions`, or sanitize `style`/`display`/`weight` in `buildFontFace()` the same way `family` and `src` are sanitized.

### NOTE: `preloadTags` uses unsanitized `href` values

**File:** `packages/ui/src/css/font.ts`, line 170

```ts
.map((p) => `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin>`)
```

The `href` value `p` comes from `FontSrc.path` or the string `src`, which are user-provided. While the `src` used in `buildFontFace` is sanitized via `sanitizeCssValue`, the preload tag `href` is **not** sanitized. An attacker-controlled font path like `" onload="alert(1)` would inject into the HTML attribute.

However, `sanitizeCssValue` would not catch this either (it targets CSS injection, not HTML attribute injection). The `href` needs HTML attribute escaping.

**Severity:** Medium. Font paths are developer-controlled (not user input), but the inconsistency in sanitization approach is a design smell. If this API is ever exposed to user-configurable themes (e.g., a CMS), this becomes an XSS vector.

**Fix:** Use `escapeAttr()` (already imported in `ssr-html.ts`) on the href value. Or sanitize at the `compileFonts` level by rejecting paths containing `"` or `>`.

### NOTE: `subsets` field is stored but never used

**File:** `packages/ui/src/css/font.ts`

The `FontOptions` accepts `subsets` (default: `['latin']`) and `FontDescriptor` stores it, but `compileFonts()` never reads `descriptor.subsets`. This field exists as a placeholder for Phase 2 (Google Fonts auto-download), but it's dead data in Phase 1.

**Severity:** Low. This is intentional forward-looking design for Phase 2. However, it means the field is part of the public API surface without any runtime effect, which can confuse users.

**Fix:** Either document that `subsets` has no effect in Phase 1, or defer adding it to the public API until Phase 2 when it actually does something.

### NOTE: `compileFonts()` duplicated from `compileTheme()` — font CSS vars could conflict

**File:** `packages/ui/src/css/font.ts`, `packages/ui/src/css/theme.ts`

`compileFonts()` is both a standalone export and called internally by `compileTheme()`. If a user calls both `compileFonts(fonts)` and `compileTheme(themeWithFonts)`, they get duplicate `@font-face` declarations and duplicate `--font-*` CSS vars. There is no guard against this.

**Severity:** Low. The intended usage path is `defineTheme({ fonts }) -> compileTheme()`, where compilation happens once. `compileFonts()` is exported for edge cases where users want font CSS without a full theme. But the docs/examples should make the primary path clear.

## Architecture Assessment

### 1. Architecture Fit

The `font()` as pure descriptor + `compileFonts()` as compilation step fits the existing theme architecture pattern well. It mirrors `defineTheme()` (descriptor) + `compileTheme()` (compilation). The integration into `compileTheme()` is clean -- fonts are compiled as part of theme compilation, and the results are threaded through the existing SSR pipeline. This is the right layering.

### 2. Breaking Changes

`CompiledTheme` now has `preloadTags: string`. This is additive (new field), not breaking. Existing code that destructures `{ css, tokens }` will still work.

`SSRRenderResult` now has `headTags: string`. Same -- additive. Existing consumers that destructure `{ html, css, ssrData }` will still work.

`GenerateSSRHtmlOptions` gets an optional `headTags?: string`. Non-breaking.

The `BunDevServerOptions.headTags` field already existed. No change there.

No breaking changes identified.

### 3. Separation of Concerns

Font *description* and *compilation* live in `@vertz/ui` (correct -- they're part of the theme system). Font *injection into HTML* happens in `@vertz/ui-server` (correct -- that's the rendering layer). The boundary is clean.

Phase 2 (Google Fonts auto-download) should live in `@vertz/ui-server` or `@vertz/cli` since it involves network I/O and file system writes -- this Phase 1 architecture supports that cleanly. The `FontDescriptor` has all the metadata Phase 2 needs (family name, subsets, weight ranges).

### 4. Phase 2 Readiness

The descriptor contains `family`, `subsets`, `weight`, and `src` (optional). Phase 2 can: (a) detect when `src` is absent, (b) download from Google Fonts using family + subsets + weight, (c) write to `dist/fonts/`, and (d) fill in the `src` paths before passing to `compileFonts()`. The architecture supports this without breaking changes.

One concern: Phase 2 will need an async step (downloading fonts), but `compileFonts()` is synchronous. This means Phase 2 will need to either pre-process descriptors before calling `compileFonts()`, or introduce an `async compileFonts()`. The current sync API is fine for Phase 1 but should be noted as a Phase 2 design constraint.

### 5. Cross-Cutting Risk: Production Builds

The landing page build script (`sites/landing/scripts/build.ts`) removed the manual font preload tags from `PRODUCTION_HEAD`. This is correct because the SSR render now includes them via `compileTheme().preloadTags`. However, this only works if the production build's SSR render executes `compileTheme()` on the theme with fonts -- which it does, because the landing dev server uses `ssrModule: true` and the app exports `theme = landingTheme` (which now includes fonts).

But there is a subtle issue: the build script fetches the SSR output from the dev server, which injects headTags into the HTML via `generateSSRPageHtml`. When the build script then strips dev scripts and re-injects production assets, it does **not** strip the font preload tags (they don't match any of the dev-reference patterns). This means the preload tags survive into the production build. Correct behavior, but it's fragile -- it works by omission rather than explicit intent.

### 6. Cloudflare / Edge Adapter Impact

The `createSSRHandler` in `ssr-handler.ts` is the production SSR handler used by adapters. It now correctly threads `result.headTags` through `injectIntoTemplate`. Edge adapters (Cloudflare Workers) that use this handler will get font preloads automatically. No adapter changes needed.

## Verdict

### Changes Requested

Two blockers must be resolved before merge:

1. **Fix preload injection order in `ssr-handler.ts`** -- preload hints must appear before CSS in the production handler, matching the dev server's behavior. Dev/prod parity is the core goal.

2. **Add SSR integration tests** for the headTags pipeline -- at minimum, `ssr-html.test.ts` should test that headTags appear in the generated HTML, and ideally an integration test showing the full theme-with-fonts -> SSR -> HTML-with-preloads flow.

Should-fix items (dual `:root` blocks, landing theme type annotation, preload href sanitization) are not blockers but should be addressed before the feature branch merges to main.

## Resolution

_Pending: awaiting fixes for the two blockers above._
