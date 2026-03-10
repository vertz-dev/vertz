# Phase 1: Font System — Adversarial Review (ben)

- **Author:** implementation agent
- **Reviewer:** ben (core/types)
- **Branch:** `feat/font-system`
- **Date:** 2026-03-09

## Changes

- `packages/ui/src/css/font.ts` (new)
- `packages/ui/src/css/__tests__/font.test.ts` (new)
- `packages/ui/src/css/theme.ts` (modified)
- `packages/ui/src/css/__tests__/theme.test.ts` (modified)
- `packages/ui/src/css/index.ts` (modified)
- `packages/ui/src/css/public.ts` (modified)
- `packages/ui/src/index.ts` (modified)
- `packages/ui-server/src/ssr-render.ts` (modified)
- `packages/ui-server/src/ssr-html.ts` (modified)
- `packages/ui-server/src/bun-dev-server.ts` (modified)
- `packages/ui-server/src/ssr-handler.ts` (modified)
- `sites/landing/src/styles/theme.ts` (modified)
- `sites/landing/src/styles/globals.ts` (modified)
- `sites/landing/src/app.tsx` (modified)
- `sites/landing/src/dev-server.ts` (modified)
- `sites/landing/scripts/build.ts` (modified)
- `sites/landing/src/styles/fonts.ts` (deleted)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues (injection, XSS, etc.)
- [ ] Public API changes match design doc

## Findings

### BLOCKER: XSS via unsanitized font values in CSS and HTML output

**Severity: Blocker**

**File:** `packages/ui/src/css/font.ts`

The `compileFonts()` function has zero input sanitization. While `compileTheme()` applies `sanitizeCssValue()` to color and spacing tokens, the font pipeline generates CSS and raw HTML from user-provided strings with no escaping whatsoever.

Specific injection vectors:

1. **CSS injection via `family`**: The family name is interpolated directly into `@font-face` blocks and CSS custom property values with single quotes:
   ```ts
   `  font-family: '${family}';`
   ```
   A family name containing `'; } body { display: none; } @font-face { font-family: 'x` would break out of the `@font-face` rule. The `sanitizeCssValue()` function from theme.ts strips `;`, `{`, `}`, but it is never called in font.ts.

2. **HTML injection via `src` paths in preload tags**: The `preloadTags` string is built by interpolating `src` paths directly into HTML attributes:
   ```ts
   `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin>`
   ```
   A path containing `" onload="alert(1)` would break out of the `href` attribute and inject arbitrary HTML event handlers. This is a textbook reflected XSS vector. The `preloadTags` string is injected raw into `<head>` via `ssr-html.ts` and `bun-dev-server.ts`.

3. **CSS injection via `weight`**, **`unicodeRange`**: These values are interpolated directly into `@font-face` rules without sanitization. A `unicodeRange` of `; } * { display: none; } @font-face {` would break out.

**Fix required:**
- Apply `sanitizeCssValue()` (or a font-specific variant) to all CSS-interpolated strings (`family`, `weight`, `style`, `display`, `unicodeRange`).
- Apply HTML attribute escaping (at minimum: `"`, `<`, `>`, `&`) to all values interpolated into HTML tags (preload `href`). Use the existing `escapeAttr()` from `html-serializer.ts`.

---

### BLOCKER: Production SSR handler silently drops `headTags` (font preloads never render in production)

**Severity: Blocker**

**File:** `packages/ui-server/src/ssr-handler.ts`

The production SSR handler (`createSSRHandler`) calls `injectIntoTemplate()` but the *existing* code (before this diff) only passes 4 arguments to `injectIntoTemplate`. The diff adds a `headTags` parameter as the 6th positional argument:

```ts
function injectIntoTemplate(
  template: string,
  appHtml: string,
  appCss: string,
  ssrData: Array<{ key: string; data: unknown }>,
  nonce?: string,
  headTags?: string,  // <-- NEW
): string {
```

The `handleHTMLRequest` function correctly passes `result.headTags` now. However, in production, the SSR handler uses a *template-based* approach: it receives an `index.html` template and does string replacements. This template is produced by the build script (`sites/landing/scripts/build.ts`) which renders via the dev server and captures its HTML output.

The problem: the build script captures SSR output from the dev server at build time, which includes the preload tags in `<head>`. Then it strips dev scripts and injects production assets. The font preload tags from the dev server SSR output survive this process, but only if the dev server was properly producing them. However, if someone uses `createSSRHandler` directly (not via the landing site build script), they rely on `injectIntoTemplate` to add font preloads -- and this is the only path that works.

This is inconsistent: the dev server path combines user-provided `headTags` with theme preload tags, but `createSSRHandler` only gets theme preload tags (from `result.headTags`). There is no way to pass custom `headTags` through `createSSRHandler`. This is a minor inconsistency now but will become a real issue when users want to add custom `<head>` tags in production.

**Downgraded from blocker to should-fix** after re-reading: the `injectIntoTemplate` diff does pass `result.headTags`, so font preloads DO work in production SSR. The inconsistency about user-level `headTags` in production is a design gap, not a broken feature.

---

### SHOULD-FIX: `FontDescriptor.__brand` is structurally matchable -- not a true nominal type

**Severity: Should-fix**

**File:** `packages/ui/src/css/font.ts`, line 34

```ts
export interface FontDescriptor {
  readonly __brand: 'FontDescriptor';
  // ...
}
```

This uses a structural brand pattern, but `__brand` is a real runtime property with a string literal type. The `readonly` modifier prevents reassignment but does NOT prevent construction of a conforming plain object:

```ts
const fake: FontDescriptor = {
  __brand: 'FontDescriptor' as const,
  family: "'; } * { display: none; } .x { font-family: '",
  weight: '400',
  style: 'normal',
  display: 'optional',
  fallback: [],
  subsets: ['latin'],
};
compileFonts({ sans: fake }); // Compiles, no error
```

This is acceptable for internal use where `font()` is the only factory, but with zero sanitization in `compileFonts()` (see BLOCKER above), the brand offers no safety guarantee. A `unique symbol` brand with a type-only declaration would make spoofing impossible at the type level:

```ts
declare const FontBrand: unique symbol;
export interface FontDescriptor {
  readonly [FontBrand]: true;
  // ...
}
```

The current pattern works only if sanitization is added to `compileFonts()`. Without sanitization, the brand is security theater.

---

### SHOULD-FIX: `compileFonts()` assumes woff2 format unconditionally

**Severity: Should-fix**

**File:** `packages/ui/src/css/font.ts`, line 99

```ts
`  src: url(${src}) format('woff2');`
```

Every `@font-face` block hardcodes `format('woff2')`. The `FontOptions` interface has no `format` field, so there is no way to specify `woff`, `truetype`, `opentype`, or `collection`. The `preloadTags` also hardcodes `type="font/woff2"`.

This is fine as a v0 constraint, but it should be documented as a deliberate limitation (in a comment or in the `FontOptions` JSDoc). If a user passes a `.woff` or `.ttf` path, the `@font-face` rule will declare `format('woff2')` which causes the browser to skip the font entirely (format mismatch). No runtime error, no warning -- just silent font loading failure.

**Fix:** At minimum, add a validation check that throws if the `src` path does not end in `.woff2`. Better: add an optional `format` field to `FontSrc`.

---

### SHOULD-FIX: No test coverage for SSR `headTags` field

**Severity: Should-fix**

**Files:**
- `packages/ui-server/src/__tests__/ssr-render.test.ts` -- no test asserts `result.headTags`
- `packages/ui-server/src/__tests__/ssr-html.test.ts` -- no test for `headTags` option
- `packages/ui-server/src/__tests__/bun-dev-server.test.ts` -- no test for combined headTags

The `SSRRenderResult` interface gained a `headTags: string` field, and `GenerateSSRHtmlOptions` gained a `headTags?: string` option. Neither has test coverage:

1. The existing SSR render test `'returns { html, css, ssrData } shape'` does not assert `result.headTags` exists.
2. There is no test that renders a module with `theme.fonts` and verifies `result.headTags` contains preload tags.
3. The `generateSSRHtml` tests do not test the `headTags` option being injected before CSS.
4. The `bun-dev-server` tests do not test that user-provided `headTags` and theme preload tags are combined.

---

### SHOULD-FIX: No `.test-d.ts` type tests for `font()` / `FontDescriptor`

**Severity: Should-fix**

Per project rules (tdd.md), every phase with type-level guarantees must include `.test-d.ts` tests. The `FontDescriptor` brand, `FontOptions` constraints, and `ThemeInput.fonts` typing have no type-level tests.

Minimum required:
- `@ts-expect-error` on passing a plain object where `FontDescriptor` is expected (validates the brand)
- `@ts-expect-error` on `font()` with missing `weight` (required field)
- `@ts-expect-error` on `FontOptions.style` with invalid value (e.g., `'bold'`)
- `@ts-expect-error` on `FontOptions.display` with invalid value
- Positive test: `font()` return type assignable to `FontDescriptor`
- Positive test: `defineTheme({ colors: {}, fonts: { sans: fontResult } })` compiles

---

### SHOULD-FIX: `toCssWeight()` is too naive -- replaces ALL `..` occurrences

**Severity: Should-fix**

**File:** `packages/ui/src/css/font.ts`, line 81

```ts
function toCssWeight(weight: string): string {
  return weight.replace('..', ' ');
}
```

`String.prototype.replace()` with a string pattern only replaces the first occurrence, which is correct for the `100..1000` case. However, there is no validation that the weight format is sensible. Values like `'100..200..300'`, `'..400'`, `'400..'`, or `'abc'` would all silently produce invalid CSS weight values. No test covers malformed weight inputs.

**Fix:** Add validation for the weight field -- either a regex check or explicit parsing. At minimum, add a test for edge cases.

---

### NICE-TO-HAVE: `compileFonts()` generates duplicate `:root` blocks when used via `compileTheme()`

**Severity: Nice-to-have**

**File:** `packages/ui/src/css/theme.ts`, lines 164-183

When `theme.fonts` is provided, `compileFonts()` produces a `cssVarsCss` string that contains `:root { --font-sans: ...; }`. Then `compileTheme()` separately produces `:root { --color-primary-500: ...; }` for color tokens. The resulting CSS has two separate `:root` blocks:

```css
:root {
  --font-sans: 'DM Sans', system-ui, sans-serif;
}

:root {
  --color-primary-500: #3b82f6;
}
```

While this is valid CSS (the browser merges `:root` blocks), it produces unnecessarily verbose output. Consider merging the font CSS vars into the main `:root` block.

---

### NICE-TO-HAVE: `headTags` in `generateSSRHtml` is not HTML-escaped

**Severity: Nice-to-have**

**File:** `packages/ui-server/src/ssr-html.ts`, line 37

```ts
    ${headTags}
```

The `headTags` string is interpolated raw into the HTML template. This is intentional (it contains complete HTML tags), but there's no documentation or type-level indication that this must be trusted HTML. In the dev server, `headTags` comes from two sources:
1. User-provided via `BunDevServerOptions.headTags` (trusted -- developer controls this)
2. `result.headTags` from `ssrRenderToString` -> `compileFonts` -> `preloadTags` (NOT trusted -- see BLOCKER about unsanitized paths)

This compounds the XSS vector from the blocker finding. Even if `compileFonts` is fixed, the `headTags` passthrough should be documented as expecting pre-sanitized HTML.

---

### NICE-TO-HAVE: Empty `headTags` string leaves whitespace artifact in HTML

**Severity: Nice-to-have**

**File:** `packages/ui-server/src/ssr-html.ts`, line 37 and `packages/ui-server/src/bun-dev-server.ts`, line 486

When `headTags` is empty (the default), the template interpolation `${headTags}` leaves an empty line between `<title>` and `${css}`. This produces:

```html
    <title>Vertz App</title>

    <style>...</style>
```

The extra whitespace is harmless but makes the HTML output less clean. Consider `${headTags ? headTags + '\n' : ''}` or similar conditional formatting.

---

### NICE-TO-HAVE: `subsets` field is stored but never used

**Severity: Nice-to-have**

**File:** `packages/ui/src/css/font.ts`

The `FontDescriptor` stores `subsets: string[]` (default `['latin']`), but `compileFonts()` never reads it. The `subsets` field is populated by `font()` but has no effect on the generated CSS. Either:
- Remove it (don't store unused data)
- Document it as reserved for future use
- Implement subset-based unicode-range generation (out of scope for Phase 1, but the unused field is misleading)

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| XSS via unsanitized font values in CSS/HTML | **Blocker** | Changes Requested |
| `FontDescriptor.__brand` is structurally spoofable | Should-fix | Changes Requested |
| `compileFonts()` hardcodes woff2 format | Should-fix | Changes Requested |
| No SSR test coverage for `headTags` | Should-fix | Changes Requested |
| No `.test-d.ts` type tests | Should-fix | Changes Requested |
| `toCssWeight()` lacks validation for malformed input | Should-fix | Changes Requested |
| Duplicate `:root` blocks | Nice-to-have | |
| `headTags` raw HTML interpolation undocumented | Nice-to-have | |
| Empty headTags whitespace artifact | Nice-to-have | |
| `subsets` field stored but unused | Nice-to-have | |

### Changes Requested

The XSS blocker must be fixed before merge. Font family names, src paths, weight, and unicodeRange values are interpolated into CSS and HTML without sanitization. The `sanitizeCssValue()` function already exists in `theme.ts` -- apply it (or a dedicated variant) to CSS interpolations, and use `escapeAttr()` for HTML attribute interpolations in preload tags.

The should-fix items (brand pattern, woff2 assumption, test gaps, type tests, weight validation) represent real quality gaps that reduce confidence in the implementation. The lack of SSR integration tests for `headTags` is particularly concerning -- this is a new field on a public interface with no coverage proving it works end-to-end.

## Resolution

*Pending author fixes.*
