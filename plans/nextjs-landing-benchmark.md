# Next.js Landing Page Benchmark

## Overview

Pixel-faithful clone of `sites/landing/` (vertz.dev) built with Vinext (Cloudflare's Next.js-compatible Vite plugin), deployed to `nextjs.vertz.dev`. Purpose: benchmark Vertz's own framework against the Next.js ecosystem for the same content — measuring bundle size, Lighthouse scores, and static output characteristics.

Future: a second clone using vanilla Next.js deployed to Vercel for a three-way comparison.

## API Surface

### Tech Stack

```
Framework:    Vinext (Next.js 16 API surface on Vite, by Cloudflare)
Styling:      Tailwind CSS v4 (CSS-based config)
Fonts:        next/font/local (same WOFF2 files as original)
Highlighting: Shiki (pre-generated tokens, copied from original)
Icons:        lucide-react
Deployment:   Cloudflare Workers via `vinext deploy`
Package mgr:  Bun (consistent with monorepo)
```

### Project Structure

```
sites/landing-nextjs/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (fonts, metadata, Nav, Footer)
│   │   ├── page.tsx                # Home page (/)
│   │   ├── manifesto/
│   │   │   └── page.tsx            # Manifesto page (/manifesto)
│   │   └── globals.css             # Global styles + Tailwind v4 @theme
│   ├── components/
│   │   ├── nav.tsx                 # Server Component
│   │   ├── hero.tsx                # Client Component (copy button)
│   │   ├── glue-code.tsx           # Server Component
│   │   ├── schema-flow.tsx         # Server Component
│   │   ├── type-error-demo.tsx     # Server Component
│   │   ├── why-vertz.tsx           # Server Component
│   │   ├── the-stack.tsx           # Server Component
│   │   ├── get-started.tsx         # Server Component
│   │   ├── faq.tsx                 # Server Component
│   │   ├── founders.tsx            # Server Component
│   │   ├── footer.tsx              # Server Component
│   │   ├── vertz-logo.tsx          # Server Component
│   │   └── token-lines.tsx         # Server Component (plain spans, no tooltips)
│   └── lib/
│       └── highlighted-code.ts     # Copied from sites/landing/src/components/highlighted-code.ts
├── public/
│   ├── fonts/                      # Same WOFF2 files from sites/landing/public/fonts/
│   ├── og.png                      # Copied from original
│   ├── logo.svg
│   ├── viniciusdacal.jpg
│   └── matheuspoleza.jpg
├── vite.config.ts                  # Vinext + Cloudflare plugins
├── next.config.ts                  # output: 'export', trailingSlash: true
├── tsconfig.json
└── package.json
```

### Key Design Decisions

**1. Vinext instead of vanilla Next.js**
- Vinext reimplements the Next.js API surface on Vite — same `app/` directory, `next/*` imports, Server Components, etc.
- Deploys natively to Cloudflare Workers via `vinext deploy` — same CDN as the Vertz landing.
- Eliminates hosting as a benchmark variable (both sites on Cloudflare).
- A future vanilla Next.js → Vercel clone enables a three-way comparison.

**2. Tailwind CSS v4 (CSS-based config)**
- Tailwind v4 uses `@theme` directives in `globals.css` — no `tailwind.config.ts` needed.
- Closest ergonomic match to Vertz's `css()` utility classes.
- ~40% of visual fidelity comes from inline `style` props (hex colors, `clamp()`, complex gradients). These remain as inline styles, same as the original.

**3. Server Components by default, `'use client'` only for `hero.tsx`**
- Only the copy button in `hero.tsx` requires client-side interactivity.
- All other components (including `token-lines.tsx`) are Server Components.
- **Architectural difference documented:** The Vertz landing hydrates the entire page on the client (SPA with SSR pre-rendering). Vinext/Next.js RSC ships zero JS for Server Components. This is the honest comparison — each framework at its best.

**4. Tooltips dropped from `token-lines.tsx`**
- The original's `HintedToken` uses `@vertz/ui-primitives` Tooltip with imperative DOM manipulation and portal rendering.
- Porting this would require `@radix-ui/react-tooltip` + `'use client'`, adding a dependency and client JS that the Vertz version gets "for free" from its framework.
- Decision: render all tokens as plain `<span>` elements. Tooltips have zero visual impact in screenshots/Lighthouse and minimal user interaction value on a landing page.
- **Noted in benchmark comparison** as an omission.

**5. `next/font/local` with existing WOFF2 files**
- Uses the same WOFF2 files from `sites/landing/public/fonts/` for pixel parity.
- CSS variables match the original: `--font-sans`, `--font-display`, `--font-mono`.
- Same weight ranges and unicode-range values.

**6. Pre-generated Shiki tokens (copied, not regenerated)**
- Copy `highlighted-code.ts` directly from the Vertz landing — same tokens, same Dracula theme.
- Eliminates syntax highlighting as a benchmark variable.

### Styling Approach

Three categories of styling in the original:

1. **Utility classes** (`css()` → Tailwind) — `px:6` → `px-6`, `items:center` → `items-center`, etc.
2. **Inline `style` props** — hex colors, `clamp()`, gradients, `backdrop-filter`, complex `box-shadow`. These stay as inline `style` props in React.
3. **Custom CSS** — noise texture `body::before`, font-face declarations. These go in `globals.css`.

## Manifesto Alignment

This is a benchmark project, not a framework feature. Manifesto alignment is about demonstrating what Vertz competes against.

## Non-Goals

- **Not a redesign** — pixel-faithful clone, not an improved version
- **Not a React component library** — plain Tailwind, no shadcn/ui
- **No analytics or tracking** — pure static content for clean benchmarking
- **No CMS integration** — hardcoded content, same as original
- **No responsive improvements** — the original has no responsive breakpoints; the clone matches this
- **No tooltip interactivity** — tokens render as plain spans (documented omission)
- **No SSR throughput testing** — both sites are static/pre-rendered; this is not a server performance test
- **No animation library** — CSS transitions only, same as original

## Unknowns

1. **Vinext `next/font/local` support** — Vinext covers 94% of Next.js 16 API. `next/font` may or may not be shimmed. Fallback: manual `@font-face` declarations in `globals.css` (trivial).

## Type Flow Map

N/A — static landing page with no generics or complex type flows.

## E2E Acceptance Test

### Visual Parity
```
Given the Vinext landing at nextjs.vertz.dev
When compared side-by-side with vertz.dev at 1440px viewport width
Then all sections render with the same content, layout, and color scheme
Verified by: screenshots at 1440px width stored alongside benchmark results
```

### Functional Requirements
```
Given the landing page
When clicking the copy button
Then "bun create vertz my-app" is copied to clipboard

Given the landing page
When navigating to /manifesto
Then the manifesto page renders with all content
```

## Benchmark Methodology

### Metrics

| Metric | Tool | Notes |
|---|---|---|
| Lighthouse Performance score | Lighthouse CI (5 runs) | Median of 5 runs |
| First Contentful Paint (FCP) | Lighthouse CI | |
| Largest Contentful Paint (LCP) | Lighthouse CI | |
| Total Blocking Time (TBT) | Lighthouse CI | |
| Cumulative Layout Shift (CLS) | Lighthouse CI | |
| Total JS shipped (gzipped) | Build output analysis | `gzip -c` on all JS files |
| Total CSS shipped (gzipped) | Build output analysis | `gzip -c` on all CSS files |
| HTML payload size (gzipped) | Build output analysis | Index page |
| Total transfer size | Lighthouse CI | Sum of all resources |
| Number of network requests | Lighthouse CI | |
| Build time | `time` command | Average of 3 runs |

### Procedure

1. Deploy both sites to Cloudflare (same region, same CDN)
2. Run Lighthouse CI 5 times per site (randomized order, wait between runs)
3. Record median scores
4. Analyze build output sizes (raw + gzipped)
5. Store results in `benchmarks/results/nextjs-landing-YYYY-MM-DD.md` with raw JSON

### Architectural Differences to Document

- Vertz: SPA with SSR pre-rendering — full client hydration bundle shipped
- Vinext: RSC static export — zero client JS for Server Components, only `hero.tsx` ships JS
- Vertz: `@vertz/ui` `css()` utility classes (extracted to single CSS file)
- Vinext: Tailwind CSS v4 (purged, single CSS file)
- Vertz: tooltips on code tokens (imperative DOM, no extra dependency)
- Vinext: tooltips omitted (documented)

## Implementation Plan

### Phase 1: Project Scaffold & Layout
Set up the Vinext project with fonts, theme, global styles, and layout shell (Nav + Footer).

**Acceptance Criteria:**
- Vinext app runs with `vinext dev`
- `vinext build` produces output
- Fonts load correctly via `next/font/local` or manual `@font-face` fallback
- CSS variables `--font-sans`, `--font-display`, `--font-mono` available
- Dark theme: background `#0a0a0b`, text `#fafafa`
- Noise texture overlay renders via `body::before` in `globals.css`
- Nav renders with logo, links (Manifesto, GitHub, Docs), correct styling
- Footer renders with links and credits

### Phase 2: Hero, Glue Code, Token Lines
Hero section with copy button, glue code comparison, and the TokenLines renderer.

**Acceptance Criteria:**
- `highlighted-code.ts` copied from Vertz landing and imports work
- `TokenLines` component renders pre-generated Shiki tokens as plain `<span>` elements
- Hero section: badge, headline, description, copy button, GitHub link
- Copy button: `'use client'`, copies command, shows "Copied!" feedback (2s)
- HeroGlow: two fixed radial gradient divs (blue + purple)
- Glue code: two-column comparison with syntax highlighting

### Phase 3: Schema Flow, Type Error Demo, Why Vertz
Three content sections with code blocks and feature cards.

**Acceptance Criteria:**
- Schema flow: 3-step numbered process with code blocks
- Type error demo: diff (red/green lines) + compile errors (red wavy underlines)
- Why Vertz: 3 feature cards with semi-transparent backgrounds
- All code blocks render via `TokenLines`

### Phase 4: Stack, Get Started, FAQ, Founders, Manifesto
Remaining sections + manifesto page.

**Acceptance Criteria:**
- Stack table: 11 rows, 3-column grid (`grid-cols-[1fr_1.5fr_1fr]`), color-coded package names
- Get started: terminal mockup with green success messages
- FAQ: 4 Q&A items with bottom borders
- Founders: 2-column grid, photos, bios, X links
- Manifesto page at `/manifesto/` with all content sections

### Phase 5: Deployment & Benchmarks
Deploy to Cloudflare via `vinext deploy`, run benchmarks, document results.

**Acceptance Criteria:**
- `vinext deploy` succeeds with `nextjs.vertz.dev` custom domain
- Site accessible at `nextjs.vertz.dev`
- Benchmark results collected per methodology above
- Results stored in `benchmarks/results/nextjs-landing-YYYY-MM-DD.md`
