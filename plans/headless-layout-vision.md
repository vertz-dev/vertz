# Headless Layout Engine — Vision & Opportunities

**Status:** Vision document (not planned work)
**Date:** 2026-03-29
**Context:** Emerged from the VirtualScroll design exploration. Captures what becomes possible when layout computation (Taffy/Yoga + Pretext) runs without a browser.

---

## Core Idea

Today, layout is a **runtime-only, browser-only, main-thread-only** operation. It's the last major computation in web development that can't be moved, parallelized, or pre-computed.

A headless layout engine (Taffy for CSS flexbox/grid + Pretext for text measurement) makes layout a **portable computation** — it runs anywhere (server, worker, edge, build time, test runner), on any data (current, speculative, sample), for any target (DOM, canvas, PDF, native). The components stay the same. Only the render target changes.

### Technology Stack

- **Taffy** (Rust) — CSS flexbox + grid layout engine. Natural fit for Vertz Runtime (Rust+V8). WASM for browser.
- **Pretext** (`@chenglou/pretext`) — Text measurement without DOM. Pure arithmetic after one-time `prepare()`.
- **Vertz token resolver** — Maps `css()` tokens to pixel values. Already exists.
- **Vertz compiler** — Extracts layout descriptors from JSX + `css()` calls.

---

## Opportunities

### 1. Off-Main-Thread Layout (Web Worker)

If layout is pure math, it runs in a Web Worker. The main thread only handles rendering + user input.

- **Zero layout jank** — Complex dashboards (200+ components) compute layout in a worker while the main thread stays at 60fps.
- **Speculative layout** — Pre-compute layouts for the next scroll position, viewport size, or data update before it happens. Rendering becomes instant.
- **Parallel route layout** — On navigation, compute the next page's layout in a worker while the current page is still visible. Transition is instant.

### 2. Server-Side Layout

The server (Vertz Runtime, Rust+V8) computes exact layouts before sending HTML.

- **Perfect SSR** — No hydration layout shift. The server knows every element's height and position. Inline `height` on every container. Client renders exactly what the server computed.
- **Adaptive streaming** — Compute what fits "above the fold" for the client's viewport (from request headers / client hints) and stream that first. Priority becomes layout-aware, not document-order.
- **Edge-computed layout** — On Vertz Cloud, the edge worker computes layout at the CDN edge. HTML arrives with pixel-perfect positioning.

### 3. AI/LLM Integration

Particularly powerful for Vertz's "AI-first" principle.

- **Build-time validation** — An LLM generates a component. The compiler immediately answers: "Will this button text overflow at 320px? Does this card exceed 200px height?" No browser needed. The LLM iterates on layout issues in the same generation loop.
- **Layout-aware code generation** — "Generate a dashboard that fits 1280×720" becomes a solvable constraint. Generate JSX → compute layout → check constraints → adjust. No browser round-trip.
- **Visual regression without screenshots** — Assert on computed layout values: `expect(cardHeight).toBeLessThan(200)`. Deterministic, fast, no Playwright.

### 4. Canvas / Non-DOM Rendering

- **Infinite canvas / whiteboard** — Miro/FigJam-style. Thousands of cards on 2D canvas. Headless layout computes all positions; canvas renders only what's visible. 2D virtualization.
- **Rich canvas interfaces** — Pretext handles text layout (the hardest part). Taffy handles the box model. Combined: full component rendering on canvas with proper text wrapping, padding, flexbox.
- **PDF generation** — Same JSX components rendered to PDF pages. Taffy computes page breaks from cumulative heights. No headless Chrome.
- **Email rendering** — HTML email has brutal CSS constraints. Compute layout with Taffy, generate email-safe HTML with inline styles. Same components, different output.
- **Social/OG images** — Generate preview cards from JSX by computing layout + rendering to canvas. At build time or on-demand at the edge.

### 5. Testing Without a Browser

- **Layout unit tests** — `expect(layout(TaskCard, { task }).height).toBe(148)`. Pure function. Runs in `bun test` at millisecond speed. No browser, no flaky timeouts.
- **Responsive regression suite** — Test one component at 50 viewport widths in a single test file. Each is a pure computation. Milliseconds, not minutes.
- **Accessibility auditing** — Compute layouts to detect: overlapping elements, text below minimum size, touch targets under 44px. Assertions on layout data, not pixel screenshots.

### 6. Design System Enforcement

- **Build-time overflow detection** — Compiler computes layouts for theme components and flags text that overflows its container at standard sizes. Catches design bugs before deployment.
- **Constraint validation** — "No card in this dashboard exceeds 300px height." A build step computes layouts with sample data and fails CI if violated.

### 7. Perfect Virtualization

- **Exact heights from frame 1** — No scroll bar corrections, no measurement-then-reposition cycle. VirtualScroll uses headless layout internally instead of DOM reads. Same API, perfect UX.

### 8. Native App Rendering

- **Vertz Runtime is Rust+V8** — Taffy (Rust) computes layout natively. Render to native UI elements, Skia, or GPU. Same JSX components.

---

## Prerequisites

1. **Token resolver bridge** — Map `css()` tokens to Taffy style nodes. Token resolver exists; bridge is new.
2. **Component descriptor extraction** — Compiler analyzes JSX + `css()` to generate layout trees. Most complex part.
3. **Pretext integration** — Taffy's `measure` callback delegates to Pretext for text nodes.
4. **`@vertz/ui/text`** — Pretext wrapper for text measurement. Independent utility.

---

## Open Questions

- How does the compiler handle conditional rendering in layout descriptors?
- How are nested components resolved (component returns more JSX with its own `css()`)?
- What's Taffy's WASM bundle size for the browser path?
- How does dynamic data (reactive signals) interact with pre-computed layouts?
- Can Pretext run in a Web Worker (it needs canvas for `prepare()`; OffscreenCanvas works)?

---

## Relationship to VirtualScroll

VirtualScroll ships first with auto-measurement (DOM reads). The headless layout engine is a future upgrade path — same API, different internal strategy. When headless layout is ready, VirtualScroll switches from `offsetHeight` reads to Taffy+Pretext computation. Developers don't change their code.
