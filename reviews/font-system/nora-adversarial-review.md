# Phase 1: Font System — Adversarial Review (nora)

- **Author:** Implementation agent
- **Reviewer:** nora (frontend & API ergonomics)
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
- `sites/landing/src/styles/fonts.ts` (deleted)
- `sites/landing/scripts/build.ts` (modified)
- `sites/landing/src/dev-server.ts` (modified)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases
- [ ] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### BLOCKER: XSS via unsanitized font family name and src paths in preload tags

**Severity: Blocker**

`font.ts` does zero sanitization on the `family` string or `src` paths. These values are interpolated directly into:

1. `@font-face` CSS: `font-family: '${family}';` -- A family name containing `'; }  body { background: url(evil) }` would break out of the declaration.
2. `<link rel="preload" href="${p}">` -- A `src` value like `" onload="alert(1)` would inject arbitrary HTML attributes into the `<head>`.
3. CSS `url(${src})` -- Unquoted URL in the src declaration is vulnerable to CSS injection.

The `theme.ts` module has `sanitizeCssValue()` for color/spacing tokens, but `compileFonts()` bypasses it entirely. Font values flow directly from user code into rendered HTML via `ssrRenderToString` -> `headTags` -> `generateSSRPageHtml`/`generateSSRHtml`.

**Impact:** While the attack surface is limited (font descriptors come from developer code, not user input), Vertz's theme system is designed for composability -- themes can be shared packages (`@vertz/theme-shadcn`). A malicious or compromised theme package could inject arbitrary HTML/CSS.

**Fix:** Apply sanitization to `family` (strip quotes, semicolons, braces) and to `src` paths (escape `"` and `<` at minimum for HTML attribute context; strip CSS-breaking chars for the url() context). Consider using `escapeAttr()` from `html-serializer.ts` for the preload tag `href` values.

---

### SHOULD-FIX: Hardcoded `format('woff2')` makes the API a lie

**Severity: Should-fix**

`buildFontFace()` unconditionally emits `format('woff2')`:

```ts
`  src: url(${src}) format('woff2');`,
```

But nothing in the `FontOptions` or `FontSrc` types restricts the `path`/`src` to woff2 files. A developer could reasonably pass `/fonts/my-font.woff` or `/fonts/my-font.ttf` and get incorrect CSS. The preload tag also hardcodes `type="font/woff2"`.

The current API silently produces wrong output for non-woff2 fonts. Either:
1. Add a `format` field to `FontSrc` (preferred -- extensible), or
2. Infer format from file extension, or
3. At minimum, document that only woff2 is supported and add a runtime warning/error for non-woff2 paths.

---

### SHOULD-FIX: `subsets` field is dead -- stored but never compiled

**Severity: Should-fix (DX concern)**

The `FontOptions` interface accepts `subsets` with a default of `['latin']`. This value is stored on the `FontDescriptor` but `compileFonts()` never reads it. From a developer's perspective:

```ts
const sans = font('Noto Sans', {
  weight: '400..700',
  src: '/fonts/noto-sans-japanese.woff2',
  subsets: ['japanese'],  // <-- Does absolutely nothing
});
```

This is misleading. The developer thinks they're configuring subset behavior, but the field is a no-op. Either:
1. Remove `subsets` from the API until it has a concrete compilation target, or
2. Use it to generate per-subset `@font-face` blocks with appropriate `unicode-range` values (like Google Fonts does), or
3. Add a JSDoc comment explicitly stating it's reserved for future use and currently has no effect.

Option 1 is best for a pre-v1 framework -- dead fields confuse developers and set wrong expectations.

---

### SHOULD-FIX: CSS var quoting inconsistency in migration

**Severity: Should-fix**

The old `globals.ts` used double quotes for `DM Sans`:

```ts
'--font-sans': '"DM Sans", system-ui, sans-serif',
```

The new `compileFonts()` generates single quotes:

```ts
--font-sans: 'DM Sans', system-ui, sans-serif;
```

While both are valid CSS, this is a behavior change in the generated output. The `font-family` CSS property treats `"DM Sans"` and `'DM Sans'` identically, so this is functionally equivalent. But if any downstream code (e.g., snapshot tests, CSS comparison logic) depends on the exact string, it would break.

This is a minor concern since it's functionally identical, but worth noting that the migration is not output-identical.

---

### SHOULD-FIX: Two `:root` blocks when fonts are defined

**Severity: Should-fix (CSS quality)**

When fonts are provided, `compileTheme()` generates CSS with two separate `:root` blocks:

```css
@font-face { ... }

:root {
  --font-sans: 'DM Sans', system-ui, sans-serif;
}

:root {
  --color-primary-500: #3b82f6;
  --color-background: white;
}
```

`compileFonts()` generates its own `:root { --font-* }` block (via `cssVarsCss`), and then `compileTheme()` generates a second `:root { --color-* }` block. While browsers handle multiple `:root` blocks correctly, this produces suboptimal CSS output. A single merged `:root` block would be cleaner and slightly smaller.

**Fix:** In `compileTheme()`, instead of concatenating the entire `compileFonts().cssVarsCss` output, extract just the font CSS variable lines and merge them into the `rootVars` array. Keep the `@font-face` blocks separate (as they should be outside `:root`).

---

### NICE-TO-HAVE: No `font-family` shorthand token integration

**Severity: Nice-to-have**

The `font:` shorthand in the token system maps to `font-size` (e.g., `font:lg` -> `font-size: 1.125rem`). There's no shorthand for `font-family` using the theme's font tokens. Developers currently write:

```ts
css({ body: ['font-family:var(--font-sans)'] })  // raw CSS value
```

...or use `globalCss({ body: { fontFamily: 'var(--font-sans)' } })`.

A `family:sans` shorthand that resolves to `font-family: var(--font-sans)` would be the natural integration point. The font system defines `--font-sans`, `--font-mono`, etc. -- the token system should be able to reference them. This could be a follow-up issue.

---

### NICE-TO-HAVE: Missing test for `headTags` in `ssr-html.test.ts`

**Severity: Nice-to-have**

`generateSSRHtml` now accepts a `headTags` option (added in `ssr-html.ts`), but the test file `packages/ui-server/src/__tests__/ssr-html.test.ts` has zero tests for it. The `bun-dev-server.test.ts` tests `clearSSRRequireCache` but also has no test for the `headTags` combination logic (`combinedHeadTags`).

Similarly, `ssr-render.test.ts` has no tests verifying that `ssrRenderToString` returns `headTags` from theme font preloads.

The font compilation itself is well-tested in `font.test.ts` and `theme.test.ts`, but the SSR integration path from `compileTheme().preloadTags` -> `ssrRenderToString().headTags` -> `generateSSRPageHtml({ headTags })` is untested end-to-end.

---

### NICE-TO-HAVE: `DM Sans` italic font not preloaded

**Severity: Nice-to-have (performance)**

The landing site defines two `DM Sans` font files (normal + italic) in array `src`. `compileFonts()` intentionally preloads only the first entry:

```ts
// Preload only the first file (primary)
const first = src[0];
if (first) {
  preloadPaths.push(first.path);
}
```

This means `dm-sans-italic-latin.woff2` is never preloaded. The comment says "primary" which is reasonable -- italic is rarely used on page load. But this is a change from the old manual preload list which also didn't preload italic. Consistent behavior, just calling it out for awareness.

The more significant concern: `DM Serif Display` (the display font used for hero headings) IS preloaded by the new system (it's a single-src font), whereas the old manual `PRODUCTION_HEAD` in `build.ts` also preloaded it. So production behavior is preserved here.

---

### NICE-TO-HAVE: `font()` weight parameter is required even for system fonts

**Severity: Nice-to-have (DX)**

If a developer wants to declare a system font stack without self-hosted files:

```ts
const sans = font('system-ui', { weight: ???, fallback: ['sans-serif'] });
```

They're forced to provide `weight` even though it's meaningless for system fonts (no `@font-face` is generated without `src`). The `weight` field should be optional when `src` is not provided. Currently it's required in `FontOptions`, which is the only required field besides `weight` (since `weight` is non-optional).

---

### INFO: Production handler integration looks correct

The `ssr-handler.ts` diff correctly passes `result.headTags` to `injectIntoTemplate()`, which injects it before `</head>`. The injection order (headTags before CSS) is correct -- preload hints should appear early in `<head>` for maximum effectiveness.

The `dev-server.ts` landing page diff correctly removes the manual `headTags` option since preloads are now auto-generated from the theme's font descriptors. The `bun-dev-server.ts` correctly combines user-provided `headTags` with theme-generated ones via `[headTags, result.headTags].filter(Boolean).join('\n')`.

---

### INFO: API ergonomics assessment

The `font()` API is intuitive and mirrors Next.js font conventions, which is a good reference point. The progression from descriptor to theme to compiled CSS to SSR HTML is clean:

```ts
const sans = font('DM Sans', { weight: '100..1000', src: '...' });
const theme = defineTheme({ colors: {...}, fonts: { sans } });
// compileFonts() called internally by compileTheme()
// headTags flow through SSR pipeline automatically
```

A new developer would understand this quickly. The `font()` function name is well-chosen -- short, descriptive, matches the domain. The object spread pattern `{ ...theme, fonts: { sans } }` in the landing site is slightly awkward though -- it would be cleaner if `configureTheme()` accepted fonts directly, or if `defineTheme()` were used for the whole thing rather than spreading.

---

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| XSS via unsanitized font family/src in preload tags | Blocker | Open |
| Hardcoded `format('woff2')` for all fonts | Should-fix | Open |
| `subsets` field is dead (stored, never compiled) | Should-fix | Open |
| CSS var quoting inconsistency (single vs double quotes) | Should-fix | Open |
| Two `:root` blocks in compiled output | Should-fix | Open |
| No `font-family` shorthand token integration | Nice-to-have | Open |
| Missing `headTags` tests in ssr-html.test.ts / ssr-render.test.ts | Nice-to-have | Open |
| `font()` weight required even for system fonts | Nice-to-have | Open |

## Resolution

_Pending author response._
