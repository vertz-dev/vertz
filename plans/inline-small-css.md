# Design: Inline Small CSS in Production Build

**Issue:** [#1142](https://github.com/vertz-dev/vertz/issues/1142)
**Author:** viniciusdacal
**Date:** 2026-03-11

## Problem

Lighthouse flags `vertz.css` as a **render-blocking resource** on vertz.dev. The file is only ~2.6 KiB — small enough to inline directly into a `<style>` tag, eliminating an extra network round-trip (DNS + TCP + TLS + HTTP).

## API Surface

No public API change. This is an internal optimization in the landing page build script (`sites/landing/scripts/build.ts`).

The build script gains a size-threshold check:

```ts
// In build.ts, after extracting CSS:
const CSS_INLINE_THRESHOLD = 10 * 1024; // 10 KiB raw (uncompressed)

if (extractedCss.length <= CSS_INLINE_THRESHOLD) {
  // Inline as <style> in the production head
  inlinedCssTag = `  <style data-vertz-css>${extractedCss}</style>`;
} else {
  // Write to file and link as before
  const cssPath = resolve(DIST_ASSETS, 'vertz.css');
  writeFileSync(cssPath, extractedCss);
  clientCssPaths.push('/assets/vertz.css');
}
```

Bun's built-in CSS outputs (from `output.kind === 'css'`) are always small chunks extracted from JS bundling — these are also inlined if under threshold, or linked if over.

### Build Output Changes

**Before:**
```html
<link rel="stylesheet" href="/assets/entry-client-abc123.css" />
<link rel="stylesheet" href="/assets/vertz.css" />
```

**After (when CSS ≤ threshold):**
```html
<style data-vertz-css>/* Bun CSS chunk contents */</style>
<style data-vertz-css>/* Component CSS contents */</style>
```

**After (when CSS > threshold):**
No change — same `<link>` tags as before.

## Manifesto Alignment

- **Principle 3 (Zero Config):** No new config. The threshold is a sensible default baked into the build script.
- **Principle 7 (Performance by Default):** Eliminates render-blocking resources automatically. Developers don't need to think about CSS delivery strategy.

## Non-Goals

- **Framework-level `inlineCss` option in `@vertz/ui-server`:** The SSR render pipeline already inlines CSS as `<style>` tags during dev. A framework-level production option (Option B in the issue) is deferred — it would require changes to the SSR render pipeline and build API. This can be revisited when we have production builds for multi-page apps.
- **Critical CSS extraction:** We don't split above-the-fold vs. below-the-fold CSS. The landing page CSS is small enough that inlining all of it is fine.
- **CSS minification:** Bun already minifies CSS when `minify: true`. No additional minification step needed.
- **CSP (Content Security Policy):** No CSP headers are currently configured for vertz.dev. If a `style-src` CSP directive is added in the future, it must allow `'unsafe-inline'` or use a nonce/hash for the inlined `<style>` tags.

## Unknowns

None identified. The change is a straightforward conditional in the build script.

## POC Results

N/A — no unknowns requiring a POC.

## Type Flow Map

N/A — no generics involved. This is a build script change with no type-level API.

## E2E Acceptance Test

```ts
describe('Feature: CSS inlining in production build', () => {
  describe('Given extracted CSS is under 10 KiB', () => {
    describe('When the production build runs', () => {
      it('Then the output HTML contains inline <style data-vertz-css> tags', () => {
        // Verify: output index.html includes <style data-vertz-css>...</style>
      });
      it('Then the output HTML does NOT contain <link> tags for that CSS', () => {
        // Verify: no <link rel="stylesheet" href="/assets/vertz.css">
      });
      it('Then no vertz.css file is written to dist/assets/', () => {
        // Verify: dist/assets/vertz.css does not exist
      });
    });
  });

  describe('Given extracted CSS exceeds 10 KiB', () => {
    describe('When the production build runs', () => {
      it('Then the output HTML uses <link> tags for the CSS', () => {
        // Verify: output includes <link rel="stylesheet" href="...">
      });
      it('Then the CSS file is written to dist/assets/', () => {
        // Verify: file exists on disk
      });
    });
  });

  describe('Given Bun outputs CSS chunks from bundling', () => {
    describe('When the chunks are under threshold', () => {
      it('Then they are also inlined as <style> tags', () => {
        // Verify: Bun CSS chunks become inline styles
      });
    });
  });
});
```

## `buildCssInjection()` Function Signature

```ts
interface CssSource {
  /** Raw CSS content */
  content: string;
  /** Path to reference in <link> if not inlined (e.g., '/assets/vertz.css') */
  href: string;
}

interface CssInjectionResult {
  /** HTML string of <style> and/or <link> tags */
  html: string;
  /** CSS sources that exceeded threshold and need to be written to disk */
  filesToWrite: Array<{ path: string; content: string }>;
}

function buildCssInjection(
  sources: CssSource[],
  threshold?: number, // defaults to CSS_INLINE_THRESHOLD
): CssInjectionResult;
```

The function is a pure function: given CSS sources, it decides which to inline and which to link, returning both the HTML tags and the list of files that still need writing. The caller handles disk I/O.

## Implementation Plan

### Phase 1: CSS Inlining in Build Script

**Scope:** Modify `sites/landing/scripts/build.ts` to inline small CSS.

**Changes:**

1. Add a `CSS_INLINE_THRESHOLD` constant (10 KiB raw/uncompressed)
2. Extract a `buildCssInjection()` pure function (signature above) into `sites/landing/scripts/build-css-injection.ts`
3. For extracted component CSS (`extractedCss`): use `await output.text()` on `BuildArtifact` (not filesystem read) to get Bun CSS chunk contents
4. Collect all CSS as `CssSource[]` and pass to `buildCssInjection()`
5. In the production head injection: insert the returned HTML (mix of `<style>` and `<link>` tags)
6. Write only the `filesToWrite` entries to disk
7. Delete orphaned `.css` files from `dist/assets/` that were inlined (Bun writes them to disk unconditionally via `outdir`; use `unlinkSync` to remove)

**Acceptance Criteria:**

```ts
describe('buildCssInjection()', () => {
  describe('Given CSS sources under threshold', () => {
    describe('When building CSS injection HTML', () => {
      it('Then returns <style> tags with the CSS content', () => {});
      it('Then marks tags with data-vertz-css attribute', () => {});
    });
  });

  describe('Given CSS sources over threshold', () => {
    describe('When building CSS injection HTML', () => {
      it('Then returns <link> tags referencing the file paths', () => {});
    });
  });

  describe('Given a mix of small inline CSS and large file CSS', () => {
    describe('When building CSS injection HTML', () => {
      it('Then inlines the small ones and links the large ones', () => {});
    });
  });
});
```

**Quality gates:** `bun test sites/landing`, `bun run typecheck`, `bun run lint`
