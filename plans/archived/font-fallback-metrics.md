# Font Fallback Metrics — Zero-CLS Font Loading

**Status:** Draft (Rev 2 — addressing review feedback)
**Follow-up from:** PR #1146 (font-display: swap)
**Date:** 2026-03-11

## Problem

`font-display: swap` (PR #1146) improved performance scores but introduced Cumulative Layout Shift (CLS). When the browser loads a page:

1. Text renders immediately using fallback fonts (Arial, Georgia, etc.)
2. Custom fonts download and swap in
3. Different metrics (ascent, descent, character widths) cause text to reflow → layout shift

This is the exact problem Next.js solved with `adjustFontFallback` in `next/font`. We apply the same proven technique at the framework level so every Vertz app gets zero-CLS font loading by default.

## API Surface

### User API — zero configuration required

```ts
// No changes to user code. This works today and will automatically get zero-CLS:
const sans = font('DM Sans', {
  weight: '100..1000',
  src: '/fonts/dm-sans.woff2',
  fallback: ['system-ui', 'sans-serif'],
});
```

### Opt-out

```ts
const sans = font('DM Sans', {
  weight: '100..1000',
  src: '/fonts/dm-sans.woff2',
  fallback: ['system-ui', 'sans-serif'],
  adjustFontFallback: false, // disable fallback metric adjustment
});
```

### Explicit fallback base font

```ts
const display = font('DM Serif Display', {
  weight: 400,
  src: '/fonts/dm-serif.woff2',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: 'Times New Roman', // override auto-detection
});
```

### Generated CSS (automatic — no user involvement)

```css
/* Real font — same as today */
@font-face {
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 100 1000;
  font-display: swap;
  src: url(/fonts/dm-sans.woff2) format('woff2');
}

/* NEW: Auto-generated adjusted fallback */
@font-face {
  font-family: 'DM Sans Fallback';
  src: local(Arial);
  ascent-override: 94.52%;
  descent-override: 24.60%;
  line-gap-override: 0.00%;
  size-adjust: 104.88%;
}

/* CSS var now includes the adjusted fallback between real font and user fallbacks */
:root {
  --font-sans: 'DM Sans', 'DM Sans Fallback', system-ui, sans-serif;
}
```

> **Note:** `src: local(Arial)` uses unquoted font name — valid CSS and avoids the `sanitizeCssValue` quote-stripping issue (see Technical Notes).

### Internal API — `@vertz/ui`

```ts
// New types in font.ts
export type FallbackFontName = 'Arial' | 'Times New Roman' | 'Courier New';

export interface FontFallbackMetrics {
  /** CSS ascent-override value, e.g., '94.52%' */
  ascentOverride: string;
  /** CSS descent-override value, e.g., '24.60%' */
  descentOverride: string;
  /** CSS line-gap-override value, e.g., '0.00%' */
  lineGapOverride: string;
  /** CSS size-adjust value, e.g., '104.88%' */
  sizeAdjust: string;
  /** System font used as fallback base */
  fallbackFont: FallbackFontName;
}

// FontOptions gains adjustFontFallback
export interface FontOptions {
  weight: string | number;
  style?: 'normal' | 'italic';
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  src?: string | FontSrc[];
  fallback?: string[];
  subsets?: string[];
  unicodeRange?: string;
  /** Control automatic fallback font metric adjustment. Default: true.
   *  - true: auto-detect fallback base from `fallback` array
   *  - false: disable
   *  - 'Arial' | 'Times New Roman' | 'Courier New': explicit base */
  adjustFontFallback?: boolean | FallbackFontName;
}

// FontDescriptor stores the setting
export interface FontDescriptor {
  readonly __brand: 'FontDescriptor';
  readonly family: string;
  readonly weight: string;
  readonly style: FontStyle;
  readonly display: FontDisplay;
  readonly src?: string | FontSrc[];
  readonly fallback: string[];
  readonly subsets: string[];
  readonly unicodeRange?: string;
  readonly adjustFontFallback: boolean | FallbackFontName; // NEW
}

// compileFonts gains optional pre-computed metrics
export interface CompileFontsOptions {
  /** Pre-computed fallback metrics per font key. Provided by @vertz/ui-server at build/SSR time. */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
}

export function compileFonts(
  fonts: Record<string, FontDescriptor>,
  options?: CompileFontsOptions,
): CompiledFonts;

// compileTheme passes options through
export interface CompileThemeOptions {
  /** Pre-computed font fallback metrics. */
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
}

export function compileTheme(
  theme: Theme,
  options?: CompileThemeOptions,
): CompiledTheme;
```

### Internal API — `@vertz/ui-server`

```ts
// New module: packages/ui-server/src/font-metrics.ts
import type { FontDescriptor, FontFallbackMetrics } from '@vertz/ui';

/**
 * Extract font metrics from .woff2 files and compute CSS fallback overrides.
 *
 * Uses @capsizecss/unpack to read font metrics (pure JS, no native deps).
 * Only processes fonts with adjustFontFallback !== false and a valid src path.
 * Enforces woff2-only policy — rejects non-woff2 files (consistent with validateWoff2Src).
 *
 * @param fonts - Font descriptors from theme definition.
 * @param rootDir - Project root directory for resolving font file paths.
 * @returns Map of font key → computed fallback metrics.
 */
export function extractFontMetrics(
  fonts: Record<string, FontDescriptor>,
  rootDir: string,
): Record<string, FontFallbackMetrics>;

/**
 * Auto-detect which system font to use as fallback base.
 *
 * Scans the `fallback` array for generic CSS font family keywords:
 * - 'sans-serif' or 'system-ui' → Arial
 * - 'serif' → Times New Roman
 * - 'monospace' → Courier New
 *
 * Skips non-generic entries (e.g., 'Georgia', 'Helvetica').
 * If no generic keyword found, defaults to Arial.
 */
export function detectFallbackFont(fallback: string[]): FallbackFontName;
```

### SSR pipeline integration — metrics computed ONCE at startup

```ts
// In createBunDevServer() and createSSRHandler() — at startup, not per-request
let fontFallbackMetrics: Record<string, FontFallbackMetrics> | undefined;
if (module.theme?.fonts) {
  fontFallbackMetrics = extractFontMetrics(module.theme.fonts, rootDir);
}

// Per-request — just passes pre-computed metrics, no file I/O
if (module.theme) {
  const compiled = compileTheme(module.theme, { fallbackMetrics: fontFallbackMetrics });
  // ...
}
```

Both `ssr-render.ts` (dev) and `render-to-html.ts` (production) receive metrics from their respective server init paths. No per-request font file reading.

## Manifesto Alignment

**Correct by default.** Zero-CLS font loading is automatic. Users don't configure anything — the framework reads font files at server startup and generates the right CSS. This is the "pit of success" pattern the manifesto calls for.

**Performance without trade-offs.** `font-display: swap` gives fast text rendering. Fallback metrics eliminate the CLS cost. Users get both — fast initial render AND stable layout.

**No magic, inspectable output.** The generated CSS is standard `@font-face` with well-documented properties (`ascent-override`, `descent-override`, `line-gap-override`, `size-adjust`). Developers can inspect it in DevTools, understand what it does, and opt out if needed.

### What was rejected

1. **`font-display: optional`** — eliminates CLS but first-time visitors may never see custom fonts. Trades visual identity for stability. Not acceptable for a landing page framework.

2. **Client-side font metric detection** — using `FontFaceSet` API or canvas measurement at runtime. Adds JS to the client bundle, introduces FOUC, and can't prevent the first layout shift.

3. **Requiring users to manually specify metrics** — fragile, error-prone, and violates "correct by default." Next.js automates this; we should too.

4. **`fontkit` as dependency** — 5.6 MB unpacked, 9 dependencies including native-like Brotli bindings. Risky in Bun, heavy for extracting 4 numbers. Rejected in favor of `@capsizecss/unpack` (365 KB, pure JS, returns metrics directly including pre-computed `xWidthAvg`).

5. **Hardcoded metrics table for known fonts** — Considered as a lighter alternative. While it covers common fonts (DM Sans, Inter, Roboto), it doesn't work for custom/uncommon fonts and requires ongoing maintenance. `@capsizecss/unpack` at 365 KB is small enough that runtime extraction is the better default. Could add a hardcoded table later as a fast-path optimization if needed.

## Non-Goals

- **Font subsetting** — already deferred to a future phase (noted in font.ts). This design doesn't touch it.
- **Google Fonts fetching** — Vertz uses self-hosted fonts only. No runtime Google API calls.
- **Variable font axis-specific fallbacks** — the fallback is a system font; variable axes don't apply.
- **Non-woff2 formats** — the existing woff2-only policy (enforced by `validateWoff2Src`) remains. Even though `@capsizecss/unpack` supports TTF/OTF, `extractFontMetrics()` will enforce woff2-only to stay consistent.
- **Client-side font metric extraction** — metrics are computed at server startup only. Zero client JS added.

## Unknowns

1. **`@capsizecss/unpack` async API in sync context** — `fromFile()` is async. The SSR pipeline computes metrics at startup (async is fine there). `compileFonts()` remains sync — it only consumes pre-computed metrics, not raw font files. **Resolution:** no issue — async extraction at startup, sync consumption at render time.

2. **System font metric accuracy** — hardcoded Arial/Times New Roman/Courier New metrics assume specific font versions. Metrics are stable across OS versions (these fonts haven't changed metrics in 20+ years), and Next.js uses the same approach successfully. On Linux/Docker where system fonts may not be installed, `src: local(Arial)` is a no-op — the browser skips the rule (graceful degradation). **Resolution:** accepted risk — same as Next.js.

3. **`system-ui` cross-platform variance** — `system-ui` maps to San Francisco (macOS), Segoe UI (Windows), Roboto (Android). We use Arial as the metric base for `system-ui` / `sans-serif`. This is approximate — San Francisco != Arial in metrics. But the adjustment still dramatically reduces CLS vs. no adjustment at all. Next.js makes the same trade-off. **Resolution:** accepted — CLS improvement is approximate, not mathematically zero on all platforms.

## POC Results

No dedicated POC needed. Next.js has proven this technique across millions of sites since v13 (2022). The metric extraction algorithm uses `@capsizecss/unpack` which returns all needed values directly:

```ts
import { fromFile } from '@capsizecss/unpack';
const metrics = await fromFile('/path/to/font.woff2');
// Returns: { ascent, descent, lineGap, unitsPerEm, xWidthAvg, capHeight, ... }
```

The override calculation (matching Next.js):
1. `sizeAdjust = fontAvgWidth / fallbackAvgWidth`
2. `ascentOverride = ascent / (unitsPerEm × sizeAdjust) × 100%`
3. `descentOverride = |descent| / (unitsPerEm × sizeAdjust) × 100%`
4. `lineGapOverride = lineGap / (unitsPerEm × sizeAdjust) × 100%`

Where `fontAvgWidth` = `xWidthAvg` from capsize, and `fallbackAvgWidth` = hardcoded system font value.

## Technical Notes

### Fallback `@font-face` generation — new helper, not reusing `buildFontFace`

The existing `buildFontFace()` helper generates `src: url(...) format('woff2')`. The fallback needs `src: local(Arial)` with metric override properties (`ascent-override`, etc.) that `buildFontFace` doesn't support.

A new `buildFallbackFontFace()` helper will generate the adjusted fallback block. It does NOT pass values through `sanitizeCssValue()` because:
- The fallback font name comes from a hardcoded `FallbackFontName` union (trusted)
- The metric values are computed percentages (trusted, formatted by our code)
- The family name uses `sanitizeCssValue` for the `font-family` declaration
- `src: local(Arial)` uses unquoted font name syntax (valid CSS, avoids quote stripping)

### Fallback font auto-detection algorithm

`detectFallbackFont(fallback: string[])` scans the array for generic CSS font family keywords:
1. Skip non-generic entries (`Georgia`, `Helvetica`, `system-ui`, etc.)
2. `'sans-serif'` → Arial
3. `'serif'` → Times New Roman
4. `'monospace'` → Courier New
5. No generic keyword found → default to Arial

Special case: `'system-ui'` is treated as equivalent to `'sans-serif'` → Arial.

### Array `src` — which file for metrics?

When `src` is an array (e.g., normal + italic variants), metrics are extracted from the **first entry** only. This matches the existing preload heuristic (preload only the first file). Italic variants may have slightly different widths, but the normal variant is the primary rendering path.

### Existing `FontDescriptor` compatibility

`compileFonts()` defaults `adjustFontFallback` to `true` if the property is missing from a descriptor. This handles existing code that constructs descriptors without the new field (e.g., tests using cast-to-type).

## Type Flow Map

```
FontOptions.adjustFontFallback (boolean | FallbackFontName)
  → font() stores in FontDescriptor.adjustFontFallback
    → extractFontMetrics() reads descriptor, returns Record<string, FontFallbackMetrics>
      → compileTheme(theme, { fallbackMetrics }) passes to compileFonts()
        → compileFonts() uses FontFallbackMetrics to generate @font-face CSS string

FallbackFontName = 'Arial' | 'Times New Roman' | 'Courier New'
  → used in FontOptions.adjustFontFallback
  → used in FontFallbackMetrics.fallbackFont
  → used in SYSTEM_FONT_METRICS lookup table
  → used in @font-face { src: local(Arial) } output
```

No dead generics — all types are concrete string literals or interfaces consumed at the CSS generation boundary.

## E2E Acceptance Test

```ts
import { describe, it, expect } from 'bun:test';
import { font, compileFonts } from '@vertz/ui';
import type { FontFallbackMetrics } from '@vertz/ui';

describe('Feature: Zero-CLS font loading', () => {
  describe('Given a font descriptor with src and pre-computed fallback metrics', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
    });

    const metrics: Record<string, FontFallbackMetrics> = {
      sans: {
        ascentOverride: '94.52%',
        descentOverride: '24.60%',
        lineGapOverride: '0.00%',
        sizeAdjust: '104.88%',
        fallbackFont: 'Arial',
      },
    };

    describe('When compileFonts is called with fallback metrics', () => {
      const result = compileFonts({ sans }, { fallbackMetrics: metrics });

      it('Then generates a fallback @font-face with metric overrides', () => {
        expect(result.fontFaceCss).toContain("font-family: 'DM Sans Fallback'");
        expect(result.fontFaceCss).toContain('src: local(Arial)');
        expect(result.fontFaceCss).toContain('ascent-override: 94.52%');
        expect(result.fontFaceCss).toContain('descent-override: 24.60%');
        expect(result.fontFaceCss).toContain('line-gap-override: 0.00%');
        expect(result.fontFaceCss).toContain('size-adjust: 104.88%');
      });

      it('Then inserts fallback font name into CSS var value', () => {
        expect(result.cssVarLines[0]).toContain("'DM Sans Fallback'");
        // Full value: 'DM Sans', 'DM Sans Fallback', system-ui, sans-serif
        expect(result.cssVarLines[0]).toContain(
          "'DM Sans', 'DM Sans Fallback', system-ui, sans-serif"
        );
      });
    });
  });

  describe('Given a font with adjustFontFallback: false', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
      adjustFontFallback: false,
    });

    describe('When compileFonts is called with fallback metrics', () => {
      const result = compileFonts({ sans }, {
        fallbackMetrics: {
          sans: {
            ascentOverride: '94.52%',
            descentOverride: '24.60%',
            lineGapOverride: '0.00%',
            sizeAdjust: '104.88%',
            fallbackFont: 'Arial',
          },
        },
      });

      it('Then does NOT generate a fallback @font-face', () => {
        expect(result.fontFaceCss).not.toContain('DM Sans Fallback');
      });
    });
  });

  describe('Given a font with adjustFontFallback: "Times New Roman"', () => {
    const display = font('DM Serif Display', {
      weight: 400,
      src: '/fonts/dm-serif.woff2',
      fallback: ['Georgia', 'serif'],
      adjustFontFallback: 'Times New Roman',
    });

    describe('When extractFontMetrics auto-detects fallback base', () => {
      it('Then uses Times New Roman instead of auto-detecting', () => {});
    });
  });

  // @ts-expect-error — adjustFontFallback rejects invalid string
  font('Test', { weight: 400, adjustFontFallback: 'Helvetica' });
});
```

## Implementation Plan

### Phase 1: CSS generation + types (`@vertz/ui`)

Add `adjustFontFallback` to `FontOptions`/`FontDescriptor`, `FontFallbackMetrics` type, `buildFallbackFontFace()` helper, and enhance `compileFonts()` to generate adjusted fallback `@font-face` blocks when metrics are provided. Add `CompileThemeOptions` to `compileTheme()`.

**Acceptance criteria:**

```ts
describe('Phase 1: Fallback @font-face generation', () => {
  describe('Given a font with pre-computed fallback metrics', () => {
    describe('When compileFonts is called with fallbackMetrics option', () => {
      it('Then generates a fallback @font-face with ascent/descent/lineGap/size-adjust overrides', () => {});
      it('Then uses src: local(<fallbackFont>) in the fallback @font-face', () => {});
      it('Then names the fallback font "<Family> Fallback"', () => {});
      it('Then inserts the fallback font name between real font and user fallbacks in CSS var', () => {});
    });
  });

  describe('Given a font with adjustFontFallback: false', () => {
    describe('When compileFonts is called with fallbackMetrics', () => {
      it('Then skips fallback @font-face generation for that font', () => {});
      it('Then CSS var does not include fallback font name', () => {});
    });
  });

  describe('Given a font with no src (CSS-only font stack)', () => {
    describe('When compileFonts is called with fallbackMetrics', () => {
      it('Then skips fallback generation (no font file to match)', () => {});
    });
  });

  describe('Given compileFonts called without fallbackMetrics option', () => {
    describe('When generating CSS', () => {
      it('Then output is identical to current behavior (backward compatible)', () => {});
    });
  });

  describe('Given compileTheme called with fallbackMetrics option', () => {
    describe('When theme has fonts', () => {
      it('Then passes fallbackMetrics through to compileFonts', () => {});
    });
  });

  describe('Given adjustFontFallback defaults', () => {
    it('Then font() defaults adjustFontFallback to true', () => {});
    it('Then compileFonts defaults adjustFontFallback to true for descriptors missing the field', () => {});
  });

  describe('Given adjustFontFallback explicit override', () => {
    it('Then font("Test", { weight: 400, adjustFontFallback: "Times New Roman" }) stores the value', () => {});
  });
});
```

**Files changed:**
- `packages/ui/src/css/font.ts` — new types, `buildFallbackFontFace()` helper, enhanced `compileFonts()`
- `packages/ui/src/css/theme.ts` — `CompileThemeOptions` parameter on `compileTheme()`
- `packages/ui/src/css/public.ts` — export new types
- `packages/ui/src/css/__tests__/font.test.ts` — new tests
- `packages/ui/src/css/__tests__/font.test-d.ts` — type-level tests

### Phase 2: Metrics extraction + pipeline integration (`@vertz/ui-server`)

Add `@capsizecss/unpack` as dependency of `@vertz/ui-server`. Implement `extractFontMetrics()` that reads `.woff2` files using capsize, computes fallback metrics, and auto-detects fallback base font. Wire into SSR pipeline at **startup** (not per-request) in both `createBunDevServer()` and `createSSRHandler()`.

**POC gate:** At the start of Phase 2, verify `@capsizecss/unpack` works in Bun by running a minimal test that reads a `.woff2` file. If it fails, fall back to `Bun.deflateSync` + minimal SFNT parser.

**Acceptance criteria:**

```ts
describe('Phase 2: Automatic font metrics extraction', () => {
  describe('Given a .woff2 font file on disk', () => {
    describe('When extractFontMetrics is called with the font descriptor', () => {
      it('Then reads the font file and returns computed FontFallbackMetrics', () => {});
      it('Then computes sizeAdjust from xWidthAvg ratio (font vs system font)', () => {});
      it('Then computes ascentOverride from font ascent / (UPM * sizeAdjust)', () => {});
      it('Then computes descentOverride from font descent / (UPM * sizeAdjust)', () => {});
      it('Then computes lineGapOverride from font lineGap / (UPM * sizeAdjust)', () => {});
    });
  });

  describe('Given a font with fallback array containing "sans-serif"', () => {
    describe('When auto-detecting fallback base', () => {
      it('Then selects Arial as the fallback font', () => {});
    });
  });

  describe('Given a font with fallback array containing "serif"', () => {
    describe('When auto-detecting fallback base', () => {
      it('Then selects Times New Roman as the fallback font', () => {});
    });
  });

  describe('Given a font with fallback array containing "monospace"', () => {
    describe('When auto-detecting fallback base', () => {
      it('Then selects Courier New as the fallback font', () => {});
    });
  });

  describe('Given a font with fallback: ["system-ui", "sans-serif"]', () => {
    describe('When auto-detecting fallback base', () => {
      it('Then selects Arial (system-ui treated as sans-serif)', () => {});
    });
  });

  describe('Given a font with fallback: ["Georgia", "Verdana"] (no generic keyword)', () => {
    describe('When auto-detecting fallback base', () => {
      it('Then defaults to Arial', () => {});
    });
  });

  describe('Given a font with adjustFontFallback: "Times New Roman"', () => {
    describe('When extractFontMetrics is called', () => {
      it('Then uses Times New Roman metrics instead of auto-detecting', () => {});
    });
  });

  describe('Given a font file that does not exist', () => {
    describe('When extractFontMetrics is called', () => {
      it('Then logs a warning and returns no metrics for that font (graceful degradation)', () => {});
    });
  });

  describe('Given a corrupted font file', () => {
    describe('When extractFontMetrics is called', () => {
      it('Then logs a warning and returns no metrics (graceful degradation)', () => {});
    });
  });

  describe('Given a font with adjustFontFallback: false', () => {
    describe('When extractFontMetrics is called', () => {
      it('Then skips that font entirely', () => {});
    });
  });

  describe('Given a font with array src (normal + italic)', () => {
    describe('When extractFontMetrics is called', () => {
      it('Then uses the first entry for metric extraction', () => {});
    });
  });

  describe('Given the dev server startup with a theme containing fonts', () => {
    describe('When createBunDevServer initializes', () => {
      it('Then extracts font metrics once at startup', () => {});
      it('Then passes metrics to every subsequent compileTheme call', () => {});
    });
  });

  describe('Given the production handler with a theme containing fonts', () => {
    describe('When createSSRHandler initializes', () => {
      it('Then extracts font metrics once at startup', () => {});
      it('Then render-to-html receives metrics via options', () => {});
    });
  });
});
```

**Files changed:**
- `packages/ui-server/package.json` — add `@capsizecss/unpack` dependency
- `packages/ui-server/src/font-metrics.ts` — new module
- `packages/ui-server/src/__tests__/font-metrics.test.ts` — tests with real .woff2 fixture
- `packages/ui-server/src/ssr-render.ts` — accept fallbackMetrics in options
- `packages/ui-server/src/render-to-html.ts` — accept fallbackMetrics in options
- `packages/ui-server/src/ssr-handler.ts` — extract metrics at init, pass to render
- `packages/ui-server/src/bun-dev-server.ts` — extract metrics at init, pass to render

### Phase 3: Landing site verification + docs

Verify CLS improvement on landing site with Lighthouse. Update docs.

**Acceptance criteria:**
- Landing page Lighthouse CLS score < 0.05 (target: 0, practical threshold accounting for system-ui variance)
- `font-display: swap` is preserved (fast initial render)
- No visual regression — fonts still load and display correctly
- Docs updated in `packages/docs/` for `adjustFontFallback` option
- Changeset added for `@vertz/ui` and `@vertz/ui-server`

**Verification method:** Run Lighthouse via `npx lighthouse http://localhost:4200 --output json --chrome-flags="--headless"` and extract CLS from the JSON report. This can be done manually; CI integration for Lighthouse is a separate concern.

**Files changed:**
- `packages/docs/api-reference/ui/css.mdx` — document `adjustFontFallback`
- `.changeset/font-fallback-metrics.md` — changeset for `@vertz/ui` and `@vertz/ui-server`

## Review Sign-offs

### Rev 1 (2026-03-11)

**DX (josh):** APPROVED — zero-config default is intuitive, opt-out is clear, DevTools name makes sense. Non-blocking: clarify system-ui detection, specify which array src file is used.

**Product/scope:** CHANGES REQUESTED — (1) wrong issue ref, (2) render-to-html.ts not wired, (3) fontkit too heavy.

**Technical:** CHANGES REQUESTED — (1) fontkit fails in Bun → use @capsizecss/unpack, (2) rootDir underspecified, (3) sanitizeCssValue strips quotes, (4) per-request file I/O.

### Rev 2 (2026-03-11) — Addressing all findings

| Finding | Resolution |
|---------|-----------|
| Wrong issue reference | Fixed — now references PR #1146 as the source |
| `render-to-html.ts` not wired | Added to Phase 2 files, both SSR paths receive metrics |
| fontkit too heavy / Bun risk | Replaced with `@capsizecss/unpack` (365 KB, pure JS) |
| rootDir plumbing | Metrics computed at startup in server init, not per-request |
| Per-request file I/O | Compute once at startup, pass pre-computed metrics to render |
| sanitizeCssValue strips quotes | New `buildFallbackFontFace()` helper, `src: local(Arial)` unquoted |
| system-ui detection | Documented: system-ui → Arial, explicit algorithm in Technical Notes |
| Array src: which file? | First entry, documented in Technical Notes |
| Formula accuracy | Using capsize's `xWidthAvg` directly, fixed formula notation |
| Missing adjustFontFallback default | compileFonts defaults to true for descriptors without the field |
| Non-goals: woff2 enforcement | Added: extractFontMetrics enforces woff2-only |
| Phase 3 verification | Added concrete Lighthouse command |
| Additional test scenarios | Added: corrupted file, explicit override, no generic keyword, render-to-html |
