# Design: Image Component with Build-Time Optimization

**Issue:** [#1147](https://github.com/vertz-dev/vertz/issues/1147)
**Author:** viniciusdacal
**Date:** 2026-03-11
**Rev:** 3 (post-re-review)

## Problem

Images are a major performance bottleneck in web applications. Developers manually create WebP variants, generate retina versions, add `loading="lazy"`, set dimensions to prevent CLS — all tedious, error-prone work. A compile-time `<img>` transform was considered but rejected because wrapping `<img>` in `<picture>` silently breaks CSS selectors, layout (flexbox/grid child count), and violates "no surprises."

Instead, we provide an explicit `<Image>` component that developers opt into. The build plugin detects static `src` values and processes images at build time — resize, convert to WebP, generate retina variants. Dynamic `src` values fall through to a plain `<img>` at runtime.

## API Surface

### Component Import

```tsx
import { Image } from '@vertz/ui';
```

### Props Interface

```ts
interface ImageProps extends Omit<JSX.IntrinsicElements['img'], 'src' | 'width' | 'height'> {
  src: string;              // Path to source image (see Path Resolution below)
  width: number;            // Display width in CSS pixels
  height: number;           // Display height in CSS pixels
  alt: string;              // Required for a11y — enforced by TypeScript
  class?: string;           // Applied to <img> element (both static and dynamic)
  pictureClass?: string;    // Applied to <picture> wrapper (static only, ignored for dynamic)
  style?: string;           // Applied to <img> element (both static and dynamic)
  loading?: 'lazy' | 'eager';  // Default: 'lazy'
  decoding?: 'async' | 'sync' | 'auto';  // Default: 'async'
  fetchpriority?: 'high' | 'low' | 'auto';  // Pass-through to <img>
  priority?: boolean;       // Shorthand: sets loading="eager", decoding="sync", fetchpriority="high"
  quality?: number;         // WebP quality 1-100, default: 80
  fit?: 'cover' | 'contain' | 'fill';  // Resize strategy, default: 'cover'
}
```

Key design decisions:
- **`class` always targets `<img>`** — both static and dynamic paths. Consistent behavior regardless of optimization. No silent behavior change when refactoring from literal to variable `src`.
- **`pictureClass`** — explicit opt-in for styling the `<picture>` wrapper. Only applies to static images (ignored for dynamic since there's no `<picture>`).
- **`style` always targets `<img>`** — for `object-fit`, `border-radius`, etc. that must be on the image element.
- **Extends `JSX.IntrinsicElements['img']`** — pass-through for `data-*`, `aria-*`, `id`, etc.
- **`priority`** — semantic shorthand for LCP images. Sets `loading="eager"`, `decoding="sync"`, `fetchpriority="high"`. When `priority` is set, it overrides explicit `loading`, `decoding`, and `fetchpriority` values.
- **`fit`** — resize strategy when source aspect ratio differs from `width × height`. Default `'cover'` (crop to fill).

### Path Resolution

Static `src` paths are resolved relative to the project root:

- `/public/photo.jpg` → `<projectRoot>/public/photo.jpg`. The `/public/` prefix is stripped in output URLs: `/public/photo.jpg` → `/__vertz_img/photo-<hash>.webp`.
- `./photo.jpg` → resolved relative to the source file's directory.

Output URLs use the `/__vertz_img/` prefix (not `/assets/`) to avoid collision with `public/assets/` or other static files.

### Static `src` — Build-Time Optimized

When `src` is a **string literal** or **JSX expression containing a string literal** (`src={"/photo.jpg"}`), the build plugin replaces the component with optimized `<picture>` markup:

```tsx
// Developer writes:
<Image
  src="/public/photo.jpg"
  width={80}
  height={80}
  alt="Profile photo"
  class="rounded-full"
  pictureClass="avatar-wrapper"
/>

// Build output (conceptual HTML):
<picture class="avatar-wrapper">
  <source srcset="/__vertz_img/photo-<hash>-80w.webp 1x, /__vertz_img/photo-<hash>-160w.webp 2x" type="image/webp" />
  <img
    src="/__vertz_img/photo-<hash>-160w.jpg"
    width="80"
    height="80"
    alt="Profile photo"
    class="rounded-full"
    loading="lazy"
    decoding="async"
  />
</picture>
```

The transform generates:
- **1x WebP** at the specified `width × height`
- **2x WebP** at `(width × 2) × (height × 2)` for retina displays
- **Fallback** in the original format at 2x resolution (served to browsers without WebP support)

### What Counts as "Static"

The transform treats `src` as static when:
1. **String literal attribute:** `src="/photo.jpg"`
2. **JSX expression with string literal:** `src={"/photo.jpg"}`
3. **Template literal with no interpolation:** `src={` `/photo.jpg` `}`

The transform treats `src` as dynamic (no optimization) when:
- **Variable reference:** `src={url}` — even if the variable is a `const` in the same file
- **Template literal with interpolation:** `src={` `/photos/${name}.jpg` `}`
- **Ternary/expression:** `src={isDark ? "/dark.jpg" : "/light.jpg"}`
- **Spread props:** `<Image {...props} />`

**Non-literal `width`/`height`:** The transform also requires `width` and `height` to be **numeric literals** (e.g., `width={80}`, not `width={SIZE}`). If `src` is static but `width` or `height` is a variable reference, the transform skips optimization and falls through to runtime with a dev-time info message: `[vertz] <Image> at file.tsx:12 — non-literal width/height, skipping build optimization`. The processor needs exact pixel values at build time to generate correctly sized images.

**Rationale:** Only analyzing literal values keeps the transform simple and predictable. Resolving `const` references would require cross-statement analysis (fragile). The boundary is clear: if you can see the string/number in the JSX attribute, it's static.

**Dev-time info message:** When the transform encounters an `<Image>` with dynamic `src`, it logs:
```
[vertz] <Image src={...}> at founders.tsx:73 — dynamic src, skipping build optimization
```
This helps developers understand why optimization was skipped without being a warning (dynamic src is valid, just unoptimized).

### Dynamic `src` — Runtime Fallback

When `src` is dynamic, no build-time optimization occurs. The component renders a plain `<img>`:

```tsx
<Image
  src={user.avatarUrl}
  width={80}
  height={80}
  alt={`${user.name}'s avatar`}
  class="avatar"
  style="object-fit: cover"
/>

// Runtime output:
<img
  src="{user.avatarUrl}"
  width="80"
  height="80"
  alt="..."
  class="avatar"
  style="object-fit: cover"
  loading="lazy"
  decoding="async"
/>
```

### Build Warning for Missing Source

Format: `[vertz] Image not found: /public/team-photo.jpg (referenced in src/components/founders.tsx:73). Falling back to runtime <img>.`

Includes: missing file path, source file + line number, fallback behavior.

### Configuration

No configuration required. The image processing pipeline uses sensible defaults:
- WebP quality: 80
- Retina: 2x variants
- Fit: cover (crop to fill target dimensions)
- Output directory: `dist/client/assets/` (production), `.vertz/images/` (dev cache)

Developers override per-image via props (`quality`, `fit`).

## Architecture

### Where Processing Happens

Image processing is a **new pre-compilation transform step** in the bun-plugin pipeline (`packages/ui-server/src/bun-plugin/plugin.ts`). It runs between field selection injection and the main compile step:

```
Pipeline:
1. Hydration transform
2. Context stable IDs (if fastRefresh)
2.5. Field selection injection
★ 2.7. Image transform (NEW — detects <Image>, processes images, replaces with <picture>)
3. Compile (reactive signals + JSX)
4. Source map chaining — remapping([compile, image, field-selection, hydration]) (output→source order)
5. CSS extraction
6. Fast Refresh wrappers (if fastRefresh)
7. HMR self-accept (if hmr)
```

**Why pre-compilation:** The transform replaces `<Image>` (custom component) with `<picture>` + `<source>` + `<img>` (native HTML elements). The JSX compiler already knows how to handle native elements, so no compiler changes are needed.

**Fast path:** Before any parsing, check if the file contains the string `<Image`. If not, skip the entire transform for that file (zero overhead for files without `<Image>`).

### Image Transform Module

New module: `packages/ui-server/src/bun-plugin/image-transform.ts`

**Detection approach: ts-morph AST** (not regex).

Responsibilities:
1. Parse source into a ts-morph `SourceFile`
2. Find the import statement for `Image` from `@vertz/ui` — track the **local binding name** (handles aliased imports like `import { Image as Img }`)
3. Walk JSX elements matching the local binding name
4. For each match with a static `src` (string literal in attribute or JSX expression):
   a. Extract all static props from AST nodes (width, height, alt, class, style, etc.)
   b. Process the source image via the image processor
   c. Use `MagicString.overwrite()` to replace the `<Image ... />` character range with `<picture>` + `<source>` + `<img>` JSX
5. For dynamic `src` or spread props: leave as-is, emit dev-time info message
6. **Return `{ code: string, map: SourceMap }`** — MagicString generates the source map

Process replacements from **last to first** (descending source position) to avoid offset shifts when multiple `<Image>` elements exist in one file.

### Image Processor Module

New module: `packages/ui-server/src/bun-plugin/image-processor.ts`

**Abstract interface** (implementation depends on Phase 0 POC result):

```ts
interface ImageProcessorResult {
  webp1x: { path: string; url: string };
  webp2x: { path: string; url: string };
  fallback: { path: string; url: string; format: string };
}

interface ImageProcessor {
  process(opts: {
    sourcePath: string;
    width: number;
    height: number;
    quality: number;
    fit: 'cover' | 'contain' | 'fill';
    outputDir: string;
  }): Promise<ImageProcessorResult>;
}
```

Responsibilities:
1. Read source image from disk
2. Resize to target dimensions using the specified `fit` strategy (1x and 2x)
3. Convert to WebP
4. Write optimized images to output directory
5. Return the output paths for the transform to reference

Process multiple images in parallel within a single file: `await Promise.all(images.map(...))`.

### Source Map Chain

The image transform returns a `MagicString`-generated source map. The `remapping` call in the pipeline chains **all** intermediate maps:

```ts
const remapped = remapping(
  [compileResult.map, imageTransformMap, fieldSelectionMap, hydrationMap],
  () => null,
);
```

This also fixes the existing gap where the field selection transform's source map was dropped. Both `image-transform` and `field-selection-inject` must return `{ code: string, map: SourceMap }`.

### Caching

Processed images are cached in `.vertz/images/` keyed by `hash(sourceContent + width + height + quality + fit)`. The processor checks the cache before processing — unchanged images skip processing entirely.

**Cache invalidation:** Content-hash key means changed source content or changed parameters produce a new hash. Same filename with different content = cache miss (correct).

**Cache cleanup:** `.vertz/images/` is a dev artifact. `rm -rf .vertz/images/` is the manual clear. No automatic eviction in v1 — document in dev server debugging guide.

**Production builds:** Read from `.vertz/images/` cache (same content-hash key). Copy final results to `dist/client/assets/`. CI should cache `.vertz/images/` for faster builds.

### Dev vs Production

| Aspect | Dev Server | Production Build |
|--------|-----------|-----------------|
| Image output | `.vertz/images/` (served by dev server) | `dist/client/assets/` |
| Caching | Content-hash cache in `.vertz/images/` | Reads `.vertz/images/` cache, copies to dist |
| URL prefix | `/__vertz_img/<hash>.<ext>` | `/__vertz_img/<hash>.<ext>` |
| Missing image | Info message in terminal | Build warning |
| Dev server route | `/__vertz_img/*` → `.vertz/images/` | Static file server handles it |

The `/__vertz_img/` prefix avoids collision with `public/assets/` or any user-defined static directories.

### Runtime Component

New module: `packages/ui/src/image/image.ts`

The runtime `Image` component handles the dynamic `src` case:

```tsx
export function Image({
  src,
  width,
  height,
  alt,
  class: className,
  style,
  loading = 'lazy',
  decoding = 'async',
  fetchpriority,
  priority,
  quality: _quality,
  fit: _fit,
  pictureClass: _pictureClass,
  ...rest
}: ImageProps) {
  const resolvedLoading = priority ? 'eager' : loading;
  const resolvedDecoding = priority ? 'sync' : decoding;
  const resolvedFetchpriority = priority ? 'high' : fetchpriority;

  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={alt}
      class={className}
      style={style}
      loading={resolvedLoading}
      decoding={resolvedDecoding}
      fetchpriority={resolvedFetchpriority}
      {...rest}
    />
  );
}
```

Note: `quality`, `fit`, and `pictureClass` are build-time-only props — they have no effect at runtime and are silently ignored (prefixed with `_` to suppress unused warnings).

When the build plugin detects a static `src`, the `<Image>` call is replaced entirely — the runtime component is never invoked for optimized images.

### Aliased Imports

The transform tracks the local binding name from the import statement:

```tsx
import { Image as Img } from '@vertz/ui';  // local name = "Img"
<Img src="/photo.jpg" width={80} height={80} alt="Photo" />  // detected correctly
```

If the file doesn't import `Image` from `@vertz/ui`, the transform is skipped entirely (even if there's a local `Image` component or a third-party `Image`).

## Manifesto Alignment

### Explicit over implicit
Developer explicitly imports `<Image>` to opt into optimization. No magic `<img>` transformation — the issue specifically rejected that approach because wrapping `<img>` in `<picture>` silently breaks CSS selectors and layout.

### Compile-time over runtime
All image processing happens at build time. No runtime image optimization library, no client-side lazy format negotiation. The output is static HTML with pre-generated assets.

### One way to do things
Single `<Image>` component. Static `src` = build-optimized. Dynamic `src` = plain `<img>`. No configuration files, no loader patterns, no image configuration objects.

### Predictability over convenience
`class` and `style` always target the `<img>` element in both static and dynamic paths. Refactoring from literal to variable `src` doesn't silently change which element gets styled. The `pictureClass` prop is an explicit opt-in for the wrapper.

### Performance is not optional
WebP conversion reduces image payloads by 25-35%. Retina variants prevent oversized images on standard displays. `loading="lazy"` + `decoding="async"` defaults eliminate common performance mistakes. `priority` prop simplifies LCP image optimization.

### AI agents are first-class users
Simple API: `<Image src width height alt />` — an LLM gets it right on the first prompt. Props mirror native `<img>` attributes. `priority` provides a semantic shorthand that LLMs can reason about.

## Non-Goals

- **Dynamic/runtime image sources from APIs** — CDN integration, runtime optimization, responsive image URLs from a CMS
- **Responsive art direction** — different crops per breakpoint (`<source media="...">`)
- **Blur-up/LQIP placeholders** — low-quality image placeholder patterns
- **CDN/external URLs** — only processes local static images
- **SVG optimization** — SVGs pass through unmodified (already vector, no raster processing needed)
- **Video/animated image processing** — GIF, WebP animation, video posters
- **Image format auto-detection based on Accept header** — format is decided at build time, not request time
- **Multiple-width responsive `srcSet`** — only 1x + 2x retina for v1. The `<picture>` + `<source>` architecture supports adding multiple widths without breaking changes. Deferred to a future iteration.
- **AVIF format** — deferred to a future iteration. AVIF encoding is significantly slower than WebP and has lower browser support (~93% vs ~97%). The `format` prop will be added when AVIF support is implemented. Not in v1 props to avoid shipping untested code paths.
- **Const variable resolution** — `const IMG = "/photo.jpg"; <Image src={IMG} />` is treated as dynamic. Only literal values in the JSX attribute are static. Cross-statement analysis is fragile and outside the compiler's single-pass-per-file architecture.
- **`<link rel="preload">` injection for priority images** — deferred to a future iteration. The `priority` prop sets `loading="eager"` + `decoding="sync"` + `fetchpriority="high"` on the `<img>`, which is the primary LCP optimization. Injecting `<link rel="preload">` into the SSR `<head>` requires a sidecar communication mechanism between the transform and SSR renderer (similar to CSS extraction). This is non-trivial and not needed for v1 — `fetchpriority="high"` already provides the browser hint.
- **Dead import removal** — when all `<Image>` uses in a file are static, the `import { Image }` line remains. Tree-shaking handles this in production. Future optimization.

## Unknowns

### 1. `sharp` compatibility with Bun — RESOLVED VIA PHASE 0

**Question:** Does `sharp` work reliably in Bun for resize + WebP conversion?

**Resolution:** Phase 0 spike (before any implementation) tests this directly. If sharp fails, alternatives in order:
1. `wasm-vips` — actively maintained, Wasm-based, similar API to sharp, no native dependencies
2. `@napi-rs/image` — Rust-based, Node-API compatible
3. Shell out to `cwebp` + `ImageMagick` — always works, slower

The `ImageProcessor` interface is defined abstractly so the implementation can be swapped without changing the transform.

### 2. Dev server image serving — RESOLVED

**Resolution:** Use `/__vertz_img/` prefix (not `/assets/`) to avoid collision with `public/` or `public/assets/`. Add a route in `createBunDevServer` that serves files from `.vertz/images/` under this prefix.

### 3. Source map impact — RESOLVED

**Resolution:** The image transform returns `{ code, map }` from MagicString. The `remapping` call chains all intermediate maps: `[compileResult.map, imageTransformMap, fieldSelectionMap, hydrationMap]`. This also fixes the existing gap where field selection's source map was dropped.

## POC Results

### Phase 0: Sharp/Bun Compatibility (2026-03-11)

**Result: Sharp works in Bun.** Tested with `sharp@0.34.5` + `bun@1.2.x`.

All operations verified:
- JPEG/PNG input → WebP output
- Resize with `cover`, `contain`, `fill` fit modes
- 1x and 2x retina generation
- Original format fallback (JPEG, PNG)
- File write to disk

No issues found. Proceeding with sharp as the image processor.

## Type Flow Map

No generic type parameters in this feature. Type safety comes from:

```
ImageProps (interface in @vertz/ui, extends JSX.IntrinsicElements['img'])
  ↓ enforced at call site
<Image src={...} width={...} height={...} alt={...} />
  ↓ TypeScript checks all props (required + optional + pass-through)
Build transform reads static values from AST (string literal, numeric literal)
  ↓ no generics involved
Runtime fallback receives props via JSX (standard prop flow)
```

Type verification:
- `alt` is required (TypeScript error if missing)
- `loading` restricted to `'lazy' | 'eager'` (TypeScript error on invalid value)
- `width` and `height` are `number` (TypeScript error on string)
- `src` is `string` (accepts both literals and expressions)
- `data-*`, `aria-*`, `id` pass through via `JSX.IntrinsicElements['img']` extension

## E2E Acceptance Test

```tsx
import { Image } from '@vertz/ui';

function ProfileCard({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  return (
    <div>
      {/* Static — optimized at build time */}
      <Image
        src="/public/logo.png"
        width={120}
        height={40}
        alt="Company logo"
        priority
      />

      {/* Dynamic — plain <img> fallback */}
      <Image
        src={avatarUrl}
        width={80}
        height={80}
        alt={`${name}'s avatar`}
        class="avatar"
        style="object-fit: cover"
      />
    </div>
  );
}

// Build output for static Image:
// - /__vertz_img/logo-<hash>-120w.webp (1x)
// - /__vertz_img/logo-<hash>-240w.webp (2x)
// - /__vertz_img/logo-<hash>-240w.png (original format fallback)
// DOM: <picture><source srcset="..." type="image/webp"><img src="..." width="120" height="40" loading="eager" decoding="sync" fetchpriority="high" ...></picture>

// Build output for dynamic Image:
// DOM: <img src="{avatarUrl}" width="80" height="80" alt="..." loading="lazy" decoding="async" class="avatar" style="object-fit: cover">

// Type safety verification:

// @ts-expect-error — missing required 'alt' prop
<Image src="/photo.jpg" width={80} height={80} />;

// @ts-expect-error — missing required 'width' prop
<Image src="/photo.jpg" height={80} alt="Photo" />;

// @ts-expect-error — invalid loading value
<Image src="/photo.jpg" width={80} height={80} alt="Photo" loading="auto" />;

// @ts-expect-error — missing required 'height' prop
<Image src="/photo.jpg" width={80} alt="Photo" />;

// @ts-expect-error — missing required 'src' prop
<Image width={80} height={80} alt="Photo" />;

// Valid: pass-through attributes work
<Image src="/photo.jpg" width={80} height={80} alt="Photo" data-testid="hero" aria-hidden="true" />;

// Valid: aliased import works
// import { Image as Img } from '@vertz/ui';
// <Img src="/photo.jpg" width={80} height={80} alt="Photo" />  → optimized
```

## Implementation Plan

### Phase 0: Sharp/Bun Compatibility Spike

**Goal:** Verify `sharp` works in Bun for resize + WebP conversion. Timeboxed to 2 hours.

**Steps:**
1. `bun add sharp` in a test directory
2. Test: load a JPEG, resize to 80×80, output as WebP buffer
3. Test: resize to 160×160 (2x), output as WebP
4. Test: `cover` fit mode with non-matching aspect ratio
5. If sharp fails: test `wasm-vips` as alternative

**Exit criteria:**
- Sharp works → proceed with sharp, document results in POC Results section
- Sharp fails, wasm-vips works → proceed with wasm-vips
- Both fail → escalate, reassess architecture

### Phase 1: Runtime Image Component + Type Safety

**Goal:** `<Image>` component available in `@vertz/ui` with correct props and defaults.

**Deliverables:**
- `ImageProps` interface in `packages/ui/src/image/types.ts`
- `Image` component in `packages/ui/src/image/image.ts`
- Exported from `@vertz/ui` main entry
- Runtime renders `<img>` with correct defaults (`loading="lazy"`, `decoding="async"`)
- `class` and `style` applied to `<img>`
- `priority` resolves to `loading="eager"` + `decoding="sync"` + `fetchpriority="high"`
- Pass-through HTML attributes (`data-*`, `aria-*`, etc.)

**Acceptance Criteria:**
```typescript
describe('Feature: Image component runtime rendering', () => {
  describe('Given an Image with all required props', () => {
    describe('When rendered', () => {
      it('Then renders an <img> element with src, width, height, alt', () => {});
      it('Then defaults loading to "lazy"', () => {});
      it('Then defaults decoding to "async"', () => {});
    });
  });

  describe('Given an Image with class and style props', () => {
    describe('When rendered', () => {
      it('Then applies class to the <img> element', () => {});
      it('Then applies style to the <img> element', () => {});
    });
  });

  describe('Given an Image with loading="eager"', () => {
    describe('When rendered', () => {
      it('Then sets loading="eager" on the <img>', () => {});
    });
  });

  describe('Given an Image with priority={true}', () => {
    describe('When rendered', () => {
      it('Then sets loading="eager" on the <img>', () => {});
      it('Then sets decoding="sync" on the <img>', () => {});
      it('Then sets fetchpriority="high" on the <img>', () => {});
    });
  });

  describe('Given an Image with pass-through HTML attributes', () => {
    describe('When rendered', () => {
      it('Then passes data-testid to the <img>', () => {});
      it('Then passes aria-hidden to the <img>', () => {});
    });
  });

  describe('Given an Image with build-only props (quality, fit, pictureClass)', () => {
    describe('When rendered at runtime', () => {
      it('Then ignores quality (no effect on <img>)', () => {});
      it('Then ignores fit (no effect on <img>)', () => {});
      it('Then ignores pictureClass (no <picture> wrapper)', () => {});
    });
  });
});
```

**Type flow tests (`.test-d.ts`):**
- `@ts-expect-error` on missing `alt`
- `@ts-expect-error` on missing `width`
- `@ts-expect-error` on missing `height`
- `@ts-expect-error` on missing `src`
- `@ts-expect-error` on `loading="auto"` (invalid value)
- Valid: all required props present
- Valid: `data-testid`, `aria-hidden` pass through
- Valid: `priority={true}`

### Phase 2: Image Transform (AST Detection + Replacement)

**Goal:** Build plugin detects `<Image>` with static `src` and replaces with `<picture>` markup.

**Deliverables:**
- `image-transform.ts` in `packages/ui-server/src/bun-plugin/`
- Uses ts-morph AST for detection (not regex)
- Tracks local binding name from `import { Image } from '@vertz/ui'` (handles aliases)
- Detects static src: string literal attribute, JSX expression with string literal, template literal without interpolation
- Replaces with `<picture>` + `<source>` + `<img>` JSX using MagicString
- `class` and `style` on inner `<img>`, `pictureClass` on `<picture>`
- Dynamic `src` / spread props left unchanged with dev-time info message
- Returns `{ code: string, map: SourceMap }` for source map chain
- Fast path: skip if file doesn't contain `<Image`

**Acceptance Criteria:**
```typescript
describe('Feature: Image build-time transform', () => {
  describe('Given <Image> with static string src="/public/photo.jpg"', () => {
    describe('When the transform runs', () => {
      it('Then replaces <Image> with <picture> containing <source> and <img>', () => {});
      it('Then sets type="image/webp" on the <source>', () => {});
      it('Then preserves width, height, alt on the inner <img>', () => {});
      it('Then applies class and style to the inner <img>', () => {});
      it('Then applies pictureClass to the <picture> wrapper', () => {});
      it('Then applies loading and decoding defaults', () => {});
    });
  });

  describe('Given <Image> with src={"/photo.jpg"} (JSX expression with string literal)', () => {
    describe('When the transform runs', () => {
      it('Then treats it as static and optimizes', () => {});
    });
  });

  describe('Given <Image> with template literal src with no interpolation', () => {
    describe('When the transform runs', () => {
      it('Then treats it as static and optimizes', () => {});
    });
  });

  describe('Given <Image> with dynamic src={variable}', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> call unchanged', () => {});
    });
  });

  describe('Given <Image> with spread props', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> call unchanged (treated as dynamic)', () => {});
    });
  });

  describe('Given import { Image as Img } from "@vertz/ui"', () => {
    describe('When <Img> is used with static src', () => {
      it('Then detects and optimizes the aliased component', () => {});
    });
  });

  describe('Given multiple <Image> elements in one file', () => {
    describe('When the transform runs', () => {
      it('Then replaces all static <Image> elements', () => {});
      it('Then leaves dynamic <Image> elements unchanged', () => {});
    });
  });

  describe('Given <Image> with priority={true}', () => {
    describe('When the transform runs', () => {
      it('Then sets loading="eager", decoding="sync", fetchpriority="high" on <img>', () => {});
    });
  });

  describe('Given <Image> with static src inside a conditional expression', () => {
    describe('When the transform runs', () => {
      it('Then optimizes the <Image> inside {condition && <Image .../>}', () => {});
      it('Then optimizes both branches of {cond ? <Image src="/a.jpg" .../> : <Image src="/b.jpg" .../>}', () => {});
    });
  });

  describe('Given <Image> with static src but non-literal width', () => {
    describe('When the transform runs', () => {
      it('Then leaves the <Image> call unchanged (skips optimization)', () => {});
    });
  });

  describe('Given a file with no <Image> import from @vertz/ui', () => {
    describe('When the transform runs', () => {
      it('Then returns the code unchanged (fast path)', () => {});
    });
  });
});
```

### Phase 3: Image Processing Pipeline

**Goal:** Source images are resized, converted to WebP, and written to output with content-hash caching.

**Deliverables:**
- `image-processor.ts` in `packages/ui-server/src/bun-plugin/`
- Implements `ImageProcessor` interface using sharp (or wasm-vips per Phase 0)
- Reads source image, resizes to 1x and 2x using specified `fit` strategy
- Converts to WebP
- Writes to `.vertz/images/` with content-hash filenames
- Cache check: skip processing if output exists with matching hash
- Warning on missing source image (includes file path + source location)

**Acceptance Criteria:**
```typescript
describe('Feature: Image processing pipeline', () => {
  describe('Given a valid JPEG source image (1000x500)', () => {
    describe('When processed with width=80, height=80, fit="cover"', () => {
      it('Then creates an 80x80 WebP file (cropped to fill)', () => {});
      it('Then creates a 160x160 WebP file (2x retina)', () => {});
      it('Then creates a 160x160 JPEG fallback', () => {});
      it('Then returns paths and URLs to all generated files', () => {});
    });
  });

  describe('Given a valid PNG source image', () => {
    describe('When processed with width=120, height=40, fit="contain"', () => {
      it('Then creates WebP files fitted within bounds (not cropped)', () => {});
      it('Then creates a PNG fallback (preserves original format)', () => {});
    });
  });

  describe('Given a source image that was already processed with same params', () => {
    describe('When processed again', () => {
      it('Then returns cached paths without reprocessing', () => {});
    });
  });

  describe('Given a source path that does not exist', () => {
    describe('When processed', () => {
      it('Then returns an error result (no crash)', () => {});
      it('Then includes the missing file path in the error', () => {});
    });
  });

  describe('Given quality=60', () => {
    describe('When processed', () => {
      it('Then produces smaller WebP files than quality=80', () => {});
    });
  });
});
```

### Phase 4: Dev Server + Production Build Integration

**Goal:** Processed images are served in dev and included in production builds.

**Deliverables:**
- Dev server route: `/__vertz_img/*` serves files from `.vertz/images/`
- Production build copies processed images to `dist/client/assets/` and maps `/__vertz_img/` URLs
- Image transform wired into bun-plugin pipeline at step 2.7
- Source map chain updated: `[compileResult.map, imageTransformMap, fieldSelectionMap, hydrationMap]`
- Field selection transform updated to also return `{ code, map }` (fixes existing gap)
- HMR: source image change triggers reprocessing

**Acceptance Criteria:**
```typescript
describe('Feature: Dev server image serving', () => {
  describe('Given a processed image in .vertz/images/', () => {
    describe('When requested via /__vertz_img/<hash>.webp', () => {
      it('Then serves the file with correct Content-Type', () => {});
      it('Then sets cache headers', () => {});
    });
  });

  describe('Given a request to /__vertz_img/ with a non-existent hash', () => {
    describe('When requested', () => {
      it('Then returns 404', () => {});
    });
  });
});

describe('Feature: Production build image output', () => {
  describe('Given a component using <Image> with static src', () => {
    describe('When running a production build', () => {
      it('Then writes optimized images to dist/client/assets/', () => {});
      it('Then references correct /__vertz_img/ paths in the HTML output', () => {});
    });
  });
});

describe('Feature: Source map chain', () => {
  describe('Given a file with <Image> that goes through the full pipeline', () => {
    describe('When source maps are generated', () => {
      it('Then the source map chain includes all intermediate transforms', () => {});
    });
  });
});
```

### Phase 5: Landing Page Integration + E2E Test

**Goal:** Landing page uses `<Image>` for static images, validating the full pipeline.

**Note:** The current landing page renders founder photos inside a `.map()` loop with dynamic `src` from a data array. To exercise the static optimization path, Phase 5 will:
1. Use `<Image>` for the **logo** (already a static path) — validates full static optimization
2. Use `<Image>` for **founder photos** with inline static `src` values (refactoring from the `.map()` pattern to individual `<Image>` calls) — validates multiple static images
3. Existing inline `style` on founder images will be converted to `css()` classes (Vertz convention)

**Deliverables:**
- Landing page logo uses `<Image>` with `priority` (LCP image)
- Landing page founder photos use `<Image>` with static `src` paths
- Inline styles migrated to `css()` classes
- E2E test verifying optimized output
- Lighthouse comparison before/after

**Acceptance Criteria:**
- [ ] Landing page logo uses `<Image priority>` component
- [ ] Landing page founder photos use `<Image>` with inline static `src` paths
- [ ] Build produces WebP + fallback for each image
- [ ] `<picture>` elements in production HTML with correct `srcset`
- [ ] Lighthouse image audit passes (no "serve images in next-gen formats" warning)
- [ ] No visual regression (photos look correct at 1x and 2x)
- [ ] Inline styles migrated to `css()` classes

---

## Review Log

### Rev 1 → Rev 2 Changes (post-review)

**DX Review findings addressed:**
- [x] Added `style` prop to `ImageProps` (DX #1 — blocking)
- [x] `class` now always targets `<img>` in both static/dynamic; added `pictureClass` for wrapper (DX #2 — blocking)
- [x] Documented static vs dynamic boundary: literals only, template literals w/o interpolation, plus dev-time info message (DX #3 — blocking)
- [x] Added `priority` prop for LCP images (DX #4 — suggestion)
- [x] Added `fetchpriority` pass-through (DX #5 — suggestion)
- [x] Added Path Resolution section (DX #6 — suggestion)
- [x] Extended `ImageProps` with `JSX.IntrinsicElements['img']` for pass-through attrs (DX #7 — suggestion)
- [x] Specified build warning format (DX #8 — suggestion)
- [x] Added `fit` prop for resize strategy (DX #9 — suggestion)

**Product/Scope Review findings addressed:**
- [x] Phase 5 reworked: use logo + inline founder photos instead of dynamic `.map()` (Product #1 — blocking)
- [x] Added Phase 0 spike for sharp/Bun compatibility (Product #2 — blocking)
- [x] `class` behavior made consistent (Product #3 — suggestion)
- [x] `style` prop added (Product #4 — suggestion)
- [x] AVIF removed from v1 props, moved to non-goals (Product #5 — suggestion)
- [x] Responsive srcSet reworded as "deferred" with arch note (Product #6 — suggestion)

**Technical Review findings addressed:**
- [x] Detection uses ts-morph AST, not regex (Tech #2 — blocking)
- [x] Phase 0 spike before implementation (Tech #3 — blocking)
- [x] Source map chain includes all intermediate maps (Tech #5 — blocking)
- [x] URL prefix changed to `/__vertz_img/` to avoid `/assets/` collision (Tech #8 — blocking)
- [x] Aliased imports tracked via import statement analysis (Tech #9g — blocking)
- [x] `ImageProcessor` interface defined abstractly (Tech #3 — recommendation)
- [x] Cache strategy clarified (Tech #4 — suggestion)
- [x] Parallel processing + fast path documented (Tech #6 — suggestion)
- [x] Dead import removal added to non-goals (Tech #7 — suggestion)
- [x] Spread props treated as dynamic (Tech #9d — question)
- [x] Non-literal width/height limitation documented (Tech #9f — question)

### Rev 2 → Rev 3 Changes (post-re-review)

**DX Re-review (Approved):**
- [x] Added `priority` override precedence note (DX Issue C — suggestion)

**Product Re-review (Approved):** No changes needed.

**Technical Re-review findings addressed:**
- [x] Non-literal `width`/`height` behavior now documented: skip optimization + dev-time info message (Tech #11 — blocking)
- [x] `<link rel="preload">` injection moved to non-goals with rationale; `priority` prop no longer claims preload injection (Tech NEW-2 — blocking)
- [x] Source map chain annotation fixed to output→source order matching `remapping()` call (Tech NEW-4 — suggestion)
- [x] Added conditional JSX test cases (`&&` and ternary) to Phase 2 acceptance criteria (Tech NEW-5 — suggestion)
- [x] Acknowledged ts-morph double-parse is a known cost (Tech NEW-1 — suggestion; noted as acceptable for v1)
