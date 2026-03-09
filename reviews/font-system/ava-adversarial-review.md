# Phase 1: Font System — Adversarial Review (ava)

- **Author:** implementation agent
- **Reviewer:** ava (DX & quality engineer)
- **Branch:** `feat/font-system`
- **Date:** 2026-03-09

## Changes

- `packages/ui/src/css/font.ts` (new) -- `font()` descriptor + `compileFonts()` compiler
- `packages/ui/src/css/__tests__/font.test.ts` (new) -- 11 unit tests
- `packages/ui/src/css/theme.ts` (modified) -- `fonts` field in ThemeInput/Theme/CompiledTheme, font integration in `compileTheme()`
- `packages/ui/src/css/__tests__/theme.test.ts` (modified) -- 2 new font integration tests
- `packages/ui/src/css/index.ts` (modified) -- re-exports font types and functions
- `packages/ui/src/css/public.ts` (modified) -- public API re-exports
- `packages/ui/src/index.ts` (modified) -- barrel export additions
- `packages/ui-server/src/ssr-render.ts` (modified) -- `headTags` in SSRRenderResult, `preloadTags` extraction
- `packages/ui-server/src/ssr-html.ts` (modified) -- `headTags` option in generateSSRHtml
- `packages/ui-server/src/ssr-handler.ts` (modified) -- `headTags` passthrough in injectIntoTemplate
- `packages/ui-server/src/bun-dev-server.ts` (modified) -- combine user headTags with theme preloadTags
- `sites/landing/src/styles/theme.ts` (modified) -- migrated to `font()` API
- `sites/landing/src/styles/globals.ts` (modified) -- removed manual `--font-*` CSS vars
- `sites/landing/src/app.tsx` (modified) -- removed `fontFaces` import from styles array
- `sites/landing/src/dev-server.ts` (modified) -- removed manual font preload headTags
- `sites/landing/scripts/build.ts` (modified) -- removed manual font preload from PRODUCTION_HEAD
- `sites/landing/src/styles/fonts.ts` (deleted) -- replaced by `font()` API

## CI Status

- [ ] Quality gates not verified -- changes are uncommitted

---

## Findings

### BLOCKERS

#### B1. XSS in preload tag `href` attribute -- no HTML escaping on font paths

**File:** `packages/ui/src/css/font.ts`, line 170

```ts
.map((p) => `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin>`)
```

The path `p` is interpolated directly into an HTML `href` attribute without escaping double quotes or other HTML-special characters. A font path containing `"` (or `">` etc.) would break out of the attribute and allow arbitrary HTML injection.

`sanitizeCssValue()` strips `;{}`, `url(`, `expression(`, `@import` -- none of which protect against HTML attribute breakout. A path like `/fonts/evil" onload="alert(1)` would produce:

```html
<link rel="preload" href="/fonts/evil" onload="alert(1)" as="font" ...>
```

The same issue exists in the `cssVars` output where the `key` is interpolated into `--font-${key}` without validating it contains only CSS-safe characters (no spaces, no colons, etc.), but since the key comes from a JS object key, this is lower risk.

**Fix:** Apply HTML attribute escaping (at minimum escape `"`, `<`, `>`, `&`) to the `href` value. The `@vertz/ui-server` package already has `escapeAttr()` in `html-serializer.ts` -- either import it or duplicate the minimal escaping logic. Alternatively, add a dedicated `sanitizeHtmlAttr()` function in font.ts.

#### B2. Zero SSR-level test coverage for the new `headTags` pipeline

The entire SSR integration of headTags -- from `ssrRenderToString()` returning `headTags`, through `generateSSRHtml()` injecting them into `<head>`, through `injectIntoTemplate()` in the production handler, through `createBunDevServer()` combining user headTags with theme preloadTags -- has **zero test coverage**.

Specifically:

1. **`ssr-render.test.ts`**: No test verifying `ssrRenderToString()` returns `headTags` when the module exports a theme with fonts. The existing "includes compiled theme CSS" test (line 63) does not check `result.headTags`.

2. **`ssr-html.test.ts`**: No test verifying `generateSSRHtml()` injects `headTags` into `<head>`. The `headTags` option was added to the interface but never tested.

3. **`ssr-handler.test.ts`**: No test verifying `injectIntoTemplate()` passes through `headTags` to the HTML output.

4. **`bun-dev-server.test.ts`**: The `generateSSRPageHtml` tests do not exercise the `headTags` parameter at all.

This is a new code path that spans 4 files across 2 packages, and none of it is tested. A regression here (e.g., headTags not being injected, or being injected in the wrong place relative to CSS) would be invisible.

**Fix:** Add at minimum:
- A test in `ssr-render.test.ts` that passes a module with `theme: defineTheme({ colors: {}, fonts: { sans: font(...) } })` and asserts `result.headTags` contains a `<link rel="preload"` tag.
- A test in `ssr-html.test.ts` that passes `headTags: '<link rel="preload" ...>'` and verifies it appears in `<head>` before the CSS.
- A test in `bun-dev-server.test.ts` for `generateSSRPageHtml` with `headTags` populated.

### SHOULD-FIX

#### S1. No type-level tests (`.test-d.ts`) for the font API

The `css/` directory has type-level tests for `css()` (`css.test-d.ts`) and `variants()` (`variants.test-d.ts`), but none for `font()`, `compileFonts()`, or the updated `ThemeInput`/`CompiledTheme` types.

Missing type-level tests:

1. **`font()` type narrowing**: Verify that `font()` returns `FontDescriptor` (not a wider type). Verify that `FontOptions.display` rejects invalid string values.
2. **`defineTheme()` fonts field**: Verify that passing a non-FontDescriptor object to `fonts` is a type error. Currently `Record<string, FontDescriptor>` should reject `{ sans: { family: 'X' } }` (missing `__brand`), but this is not tested.
3. **`compileTheme()` return type**: Verify that `CompiledTheme` now includes `preloadTags: string`. A `@ts-expect-error` test should verify accessing `.preloadTags` as a number is rejected.

Per the project's TDD rules: "Every phase with generic type parameters MUST include `.test-d.ts` tests." While these types are not generic per se, the pattern of type-level tests for public API surfaces is established in this directory.

**Fix:** Create `packages/ui/src/css/__tests__/font.test-d.ts` with negative type tests.

#### S2. Duplicated `sanitizeCssValue()` function

`sanitizeCssValue()` is now duplicated verbatim in both `packages/ui/src/css/theme.ts` (line 67) and `packages/ui/src/css/font.ts` (line 83). The comment in `font.ts` even says "Same logic as theme.ts sanitizeCssValue."

If one copy is updated (e.g., to handle a new injection vector), the other will silently remain vulnerable.

**Fix:** Extract `sanitizeCssValue()` into a shared utility (e.g., `packages/ui/src/css/sanitize.ts`) and import it from both `theme.ts` and `font.ts`.

#### S3. `font-style` and `font-display` values in `buildFontFace()` are not sanitized

In `buildFontFace()` (line 96-120), `family` and `src` are sanitized via `sanitizeCssValue()`, and `unicodeRange` is sanitized. But `style` (line 110) and `display` (line 112) are interpolated raw:

```ts
`  font-style: ${style};`,
`  font-display: ${display};`,
```

While these come from the `FontDescriptor` which constrains `style` to `'normal' | 'italic'` and `display` to the union of 5 strings at the TypeScript level, the runtime has no validation. If someone bypasses TypeScript (or if the descriptor is constructed from untyped JSON), arbitrary CSS could be injected through these fields.

The `weight` is also interpolated without sanitization through `toCssWeight()`.

Given that `family`, `src`, and `unicodeRange` are already sanitized, the inconsistency is the real concern. Either sanitize everything or document that the type system is the only guard.

**Fix:** Apply `sanitizeCssValue()` to `style`, `display`, and `weight` in `buildFontFace()` for consistency.

#### S4. Landing page `landingTheme` bypasses `defineTheme()` type safety

In `sites/landing/src/styles/theme.ts` (line 44):

```ts
export const landingTheme = { ...theme, fonts: { sans, display, mono } };
```

This spreads `theme` (which is a `Theme` object from `configureTheme()`) and adds `fonts` manually. The type of `landingTheme` is inferred as `{ fonts: { sans: FontDescriptor; display: FontDescriptor; mono: FontDescriptor } } & Theme`, which satisfies the `Theme` interface. But this bypasses `defineTheme()` -- if `defineTheme()` ever gains validation logic (e.g., checking for font key collisions with color tokens), this usage would silently skip it.

**Fix:** Use `defineTheme()`:
```ts
export const landingTheme = defineTheme({ ...theme, fonts: { sans, display, mono } });
```

Or accept this as a known tradeoff and add a comment explaining why.

### NITPICKS

#### N1. `compileFonts({})` returns empty strings but the test for this case is weak

The test "returns empty strings when no fonts have src" (font.test.ts line 161) tests a font **without** `src`, not an empty record. There is no test for `compileFonts({})` (zero fonts). While the code handles it correctly (returns all empty strings), the empty-input edge case should be explicitly tested.

#### N2. `subsets` field is stored but never used

`FontDescriptor.subsets` (with default `['latin']`) is set in `font()` but never read by `compileFonts()`. If this is intentional (reserved for future use), it should be documented. If not, it is dead code.

#### N3. Missing test for `compileFonts` with `FontSrc` array where entries have no `weight`/`style` overrides

The test for array src (font.test.ts line 94) always provides explicit `weight` and `style` on each entry. There is no test for the fallback path where `entry.weight` is `undefined` (falls back to descriptor's weight) and `entry.style` is `undefined` (falls back to descriptor's style). This is the `entryWeight = entry.weight != null ? String(entry.weight) : weight` path on line 153.

#### N4. Font CSS ordering relative to `:root` color vars

`compileTheme()` puts font CSS (including `@font-face` and `:root { --font-* }`) before the color `:root` block. This means there are two separate `:root` blocks in the output: one from font vars, one from color vars. While browsers handle this fine (later `:root` blocks merge with earlier ones), it could be surprising. A test should assert the expected ordering.

#### N5. `headTags` injection ordering in `ssr-html.ts` vs `ssr-handler.ts`

In `ssr-html.ts` (production static), `headTags` is placed **before** CSS:
```
${headTags}
${css}
```

In `ssr-handler.ts`, `headTags` is injected via `replace('</head>', headTags + '\n</head>')` **before** the CSS injection (which also uses `replace('</head>', ...)`). This means headTags ends up **after** CSS in the final output (since CSS is appended later). The ordering is inconsistent between the two code paths.

For font preloads, being before CSS is better (browser starts preloading fonts before parsing CSS). The `ssr-handler.ts` ordering may cause fonts to load slightly later.

---

## Summary

| Category | Count | Items |
|----------|-------|-------|
| Blocker | 2 | B1 (XSS in preload href), B2 (zero SSR headTags test coverage) |
| Should-fix | 4 | S1 (no .test-d.ts), S2 (duplicated sanitize), S3 (unsanitized style/display), S4 (landing bypasses defineTheme) |
| Nitpick | 5 | N1-N5 |

**Verdict: Changes Requested**

The XSS vector in preload tag generation (B1) and the complete absence of SSR-level tests for the new headTags pipeline (B2) are blockers. The font.ts unit tests are solid for the core `font()` and `compileFonts()` functions, but the SSR integration -- which is the primary delivery mechanism for font preloads -- is entirely untested. Fix blockers, address should-fix items, and re-run quality gates.
