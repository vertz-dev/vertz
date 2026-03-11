# SSR Delivery Optimizations

**Issue:** #1172
**Status:** Design

## API Surface

### 1. Consolidated CSS (internal — no public API change)

`collectCSS()` and `twoPassRender()` merge all CSS strings into a single `<style>` tag instead of one per `css()` call.

```html
<!-- Before: 32 tags -->
<style data-vertz-css>.panel { ... }</style>
<style data-vertz-css>.button { ... }</style>

<!-- After: 1 tag -->
<style data-vertz-css>
.panel { ... }
.button { ... }
</style>
```

### 2. Structured preload data from `compileFonts()` / `compileTheme()`

```ts
// New type
interface PreloadItem {
  href: string;
  as: 'font' | 'image' | 'style' | 'script';
  type?: string;
  crossorigin?: boolean;
}

// CompiledFonts — new field
interface CompiledFonts {
  fontFaceCss: string;
  cssVarsCss: string;
  cssVarLines: string[];
  preloadTags: string;       // existing HTML string (kept)
  preloadItems: PreloadItem[]; // NEW: structured data
}

// CompiledTheme — new field
interface CompiledTheme {
  css: string;
  tokens: string[];
  preloadTags: string;       // existing (kept)
  preloadItems: PreloadItem[]; // NEW: structured data
}
```

Usage:
```ts
const compiled = compileTheme(theme, { fallbackMetrics });
// Generate HTTP Link header from structured data
const linkHeader = compiled.preloadItems
  .map(item => {
    const parts = [`<${item.href}>`, `rel=preload`, `as=${item.as}`];
    if (item.type) parts.push(`type=${item.type}`);
    if (item.crossorigin) parts.push('crossorigin');
    return parts.join('; ');
  })
  .join(', ');
```

### 3. HTTP Link headers + modulepreload in SSR handler

```ts
// SSRHandlerOptions — new fields
interface SSRHandlerOptions {
  module: SSRModule;
  template: string;
  ssrTimeout?: number;
  inlineCSS?: Record<string, string>;
  nonce?: string;
  fallbackMetrics?: Record<string, FontFallbackMetrics>;
  /** Paths to inject as <link rel="modulepreload"> in <head>. */
  modulepreload?: string[];  // NEW
}
```

The handler automatically:
- Sets `Link` header from theme's `preloadItems` on HTML responses
- Injects `<link rel="modulepreload">` for `modulepreload` paths

```ts
const handler = createSSRHandler({
  module: appModule,
  template,
  fallbackMetrics: metrics,
  modulepreload: ['/assets/entry-client-abc123.js', '/assets/chunk-def456.js'],
});
```

Generated response headers:
```
Link: </fonts/dm-sans-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin
Content-Type: text/html; charset=utf-8
```

Generated HTML head:
```html
<link rel="modulepreload" href="/assets/entry-client-abc123.js">
<link rel="modulepreload" href="/assets/chunk-def456.js">
```

### 4. Default cache headers in SSR handler

```ts
// SSRHandlerOptions — new field
interface SSRHandlerOptions {
  // ... existing fields
  /** Cache-Control header for HTML responses. Default: no header (safe for dynamic content). */
  cacheControl?: string;  // NEW — omit or undefined = no header
}
```

The `createSSRHandler` sets `Cache-Control` on HTML responses only when explicitly provided. The default is no `Cache-Control` header (safe for authenticated/dynamic pages). Static sites should opt in:
```ts
cacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400'
```

### 5. `generateSSRHtml` modulepreload support

```ts
interface GenerateSSRHtmlOptions {
  appHtml: string;
  css: string;
  ssrData: Array<{ key: string; data: unknown }>;
  clientEntry: string;
  title?: string;
  headTags?: string;
  /** Paths to inject as <link rel="modulepreload"> in <head>. */
  modulepreload?: string[];  // NEW
}
```

## Manifesto Alignment

- **Compiler-driven, runtime-light**: CSS consolidation reduces runtime HTML parsing cost.
- **Zero config by default**: All optimizations are automatic or have sensible defaults.
- **Performance as a feature**: Directly addresses delivery speed gap vs Next.js/Vercel.

## Non-Goals

- **SSG / pre-rendering** — tracked in #1174
- **Server Components / zero-JS pages** — tracked in #1174
- **Image CDN integration** — tracked in #1174
- **Font subsetting** — future phase
- **Build manifest for automatic modulepreload discovery** — future phase. This PR adds manual `modulepreload` option; automatic discovery requires build pipeline changes.

## Unknowns

None identified. All changes are straightforward plumbing.

## Type Flow Map

- `PreloadItem` → `CompiledFonts.preloadItems` → `CompiledTheme.preloadItems` → SSR handler `Link` header
- `modulepreload: string[]` → `SSRHandlerOptions` → `generateSSRHtml` → HTML `<link rel="modulepreload">`
- `cacheControl: string` → `SSRHandlerOptions` → response `Cache-Control` header

## E2E Acceptance Test

```ts
describe('SSR delivery optimizations', () => {
  describe('Given a theme with fonts and an app with multiple css() calls', () => {
    describe('When rendering SSR HTML', () => {
      it('Then produces exactly 1 <style data-vertz-css> tag for component CSS', () => {
        const result = await ssrRenderToString(module, '/');
        const matches = result.css.match(/<style data-vertz-css>/g);
        // theme + globals + components = at most 3 tags (one per category)
        expect(matches!.length).toBeLessThanOrEqual(3);
      });
    });
  });

  describe('Given a theme with font descriptors', () => {
    describe('When compiling the theme', () => {
      it('Then returns preloadItems array with structured font data', () => {
        const compiled = compileTheme(theme, { fallbackMetrics });
        expect(compiled.preloadItems).toEqual([
          { href: '/fonts/dm-sans.woff2', as: 'font', type: 'font/woff2', crossorigin: true },
        ]);
      });

      // @ts-expect-error — preloadItems is required on CompiledTheme
      it('Then preloadItems is not optional', () => {
        const bad: CompiledTheme = { css: '', tokens: [], preloadTags: '' };
      });
    });
  });

  describe('Given an SSR handler with modulepreload paths', () => {
    describe('When handling an HTML request', () => {
      it('Then response includes Link header with font preloads', () => {
        const response = await handler(new Request('http://localhost/'));
        expect(response.headers.get('Link')).toContain('rel=preload');
        expect(response.headers.get('Link')).toContain('as=font');
      });

      it('Then HTML includes <link rel="modulepreload"> tags', () => {
        const response = await handler(new Request('http://localhost/'));
        const html = await response.text();
        expect(html).toContain('<link rel="modulepreload"');
      });

    });
  });

  describe('Given an SSR handler with no cacheControl option', () => {
    describe('When handling an HTML request', () => {
      it('Then response does not include Cache-Control header', () => {
        const response = await handler(new Request('http://localhost/'));
        expect(response.headers.has('Cache-Control')).toBe(false);
      });
    });
  });

  describe('Given an SSR handler with cacheControl set', () => {
    describe('When handling an HTML request', () => {
      it('Then response includes the specified Cache-Control value', () => {
        const response = await handler(new Request('http://localhost/'));
        expect(response.headers.get('Cache-Control')).toBe(
          'public, s-maxage=3600, stale-while-revalidate=86400',
        );
      });

      it('Then Cache-Control is only set on 200 responses, not error responses', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: Consolidate CSS `<style>` tags

**Files:** `packages/ui-server/src/ssr-render.ts`, `packages/ui-server/src/render-to-html.ts`

Change `collectCSS()` to join CSS strings within each category (theme=1 tag, globals=1 tag, components=1 tag, max 3 total). Change `twoPassRender()` to join all styles into a single `<style>` tag.

Note: `collectCSS` uses `data-vertz-css` attribute; `twoPassRender` uses plain `<style>`. These are separate code paths and must be tested independently.

**Acceptance criteria:**
```ts
describe('Given an SSR module with multiple css() calls', () => {
  describe('When rendering via ssrRenderToString', () => {
    it('Then component CSS is in a single <style data-vertz-css> tag (not one per css() call)', () => {});
    it('Then at most 3 <style data-vertz-css> tags total (theme + globals + components)', () => {});
  });
});

describe('Given an app with theme + global styles + component CSS', () => {
  describe('When rendering via renderToHTML', () => {
    it('Then all styles are in a single <style> tag', () => {});
  });
});
```

### Phase 2: Structured preload data

**Files:** `packages/ui/src/css/font.ts`, `packages/ui/src/css/theme.ts`

Add `PreloadItem` type, add `preloadItems` to `CompiledFonts` and `CompiledTheme`.

**Acceptance criteria:**
```ts
describe('Given font descriptors with src paths', () => {
  describe('When calling compileFonts()', () => {
    it('Then preloadItems contains one entry per font with structured data', () => {});
    it('Then preloadItems entries have href, as, type, crossorigin', () => {});
  });
});

describe('Given a theme with fonts', () => {
  describe('When calling compileTheme()', () => {
    it('Then preloadItems is passed through from compileFonts()', () => {});
  });
});
```

### Phase 3: Link headers + modulepreload in SSR handler

**Files:** `packages/ui-server/src/ssr-handler.ts`, `packages/ui-server/src/ssr-html.ts`, `packages/ui-server/src/ssr-render.ts`

Add `modulepreload` option to SSR handler. Set `Link` header from theme preload items. Inject `<link rel="modulepreload">` into HTML head.

**Acceptance criteria:**
```ts
describe('Given an SSR handler with fallbackMetrics and modulepreload', () => {
  describe('When handling an HTML request', () => {
    it('Then response has Link header with font preload hints', () => {});
    it('Then HTML contains <link rel="modulepreload"> for each path', () => {});
  });
});
```

### Phase 4: Default cache headers

**Files:** `packages/ui-server/src/ssr-handler.ts`

Add `cacheControl` option to `SSRHandlerOptions`. Only set `Cache-Control` when explicitly provided (default: no header, safe for dynamic/authenticated content). Only set on 200 responses, never on error responses.

**Acceptance criteria:**
```ts
describe('Given an SSR handler with no cacheControl option', () => {
  describe('When handling an HTML request', () => {
    it('Then response has no Cache-Control header (safe default)', () => {});
  });
});

describe('Given an SSR handler with cacheControl string', () => {
  describe('When handling a successful HTML request', () => {
    it('Then response has the specified Cache-Control value', () => {});
  });
  describe('When handling a failed HTML request (500)', () => {
    it('Then response has no Cache-Control header', () => {});
  });
});
```
