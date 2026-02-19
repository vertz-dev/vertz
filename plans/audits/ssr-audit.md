# SSR / UI Server Audit Report

**Date:** 2026-02-18  
**Auditor:** Subagent (audit-ssr)  
**Scope:** packages/ui-server, packages/core/src, packages/server/src

---

## Executive Summary

The SSR implementation is **well-developed with solid streaming support** via the `@vertz/ui-server` package. Key features like `renderToStream`, Suspense streaming, client hydration markers, and full HTML shell generation are implemented. However, there are notable gaps in state serialization (no dehydrate/replay), 404/error page handling is not integrated at the SSR layer, and there is no built-in skeleton/placeholder generation system.

---

## Files Found & Analysis

### packages/ui-server/

| File | Purpose | Tests | Status |
|------|---------|-------|--------|
| `src/render-to-stream.ts` | Core streaming SSR engine with Suspense support | ✅ Full tests (render-to-stream.test.ts) | ✅ Real Implementation |
| `src/render-page.ts` | Full HTML page generation (doctype, head, body) | ✅ Full tests (render-page.test.ts) | ✅ Real Implementation |
| `src/streaming.ts` | Stream utilities (encodeChunk, streamToString, collectStreamChunks) | ✅ Tests (streaming.test.ts) | ✅ Real Implementation |
| `src/html-serializer.ts` | VNode-to-HTML serialization, escaping, void elements | ✅ Tests (html-serializer.test.ts) | ✅ Real Implementation |
| `src/head.ts` | HeadCollector for meta tags, title, link elements | ✅ Tests (head.test.ts) | ✅ Real Implementation |
| `src/hydration-markers.ts` | Wrap VNodes with `data-v-id`, `data-v-key` for hydration | ✅ Tests (hydration-markers.test.ts) | ✅ Real Implementation |
| `src/template-chunk.ts` | Out-of-order streaming template replacement | ✅ Tests (template-chunk.test.ts) | ✅ Real Implementation |
| `src/slot-placeholder.ts` | Suspense slot placeholder generation | ✅ Tests (slot-placeholder.test.ts) | ✅ Real Implementation |
| `src/asset-pipeline.ts` | Script/stylesheet tag rendering | ✅ Tests (asset-pipeline.test.ts) | ✅ Real Implementation |
| `src/critical-css.ts` | Inline critical CSS as `<style>` tag | ✅ Tests (critical-css.test.ts) | ✅ Real Implementation |
| `src/dom-shim/index.ts` | SSR DOM shim (document, window, HTMLElement) | ✅ Tests (dom-shim.test.ts) | ✅ Real Implementation |
| `src/dev-server.ts` | Vite SSR dev server with HMR | ✅ Tests (dev-server.test.ts) | ✅ Real Implementation |
| `src/jsx-runtime/index.ts` | JSX runtime for SSR | ✅ Tests (jsx-runtime.test.ts) | ✅ Real Implementation |
| `src/types.ts` | TypeScript types (VNode, RenderToStreamOptions, etc.) | N/A | ✅ Real Implementation |

### packages/ui-compiler/

| File | Purpose | Tests | Status |
|------|---------|-------|--------|
| `src/vite-plugin.ts` | Vite plugin with SSR middleware, hydration transformers, CSS extraction | ✅ Tests (vite-plugin-ssr.test.ts) | ✅ Real Implementation |

### packages/ui/src/hydrate/

| File | Purpose | Tests | Status |
|------|---------|-------|--------|
| `hydrate.ts` | Client-side atomic per-component hydration | ✅ Tests (hydrate.test.ts) | ✅ Real Implementation |
| `strategies.ts` | Hydration strategies (eager, lazy, idle, visible, etc.) | ✅ Tests (strategies.test.ts) | ✅ Real Implementation |
| `component-registry.ts` | Component resolution for hydration | N/A | ✅ Real Implementation |
| `props-deserializer.ts` | Deserialize props from SSR markers | N/A | ✅ Real Implementation |

---

## Feature Checklist

### SSR Core

| Feature | Status | Notes |
|---------|--------|-------|
| renderToString (sync rendering) | ❌ | Only `renderToStream` exists. `renderToStream` produces a stream but can be consumed as string via `streamToString`. No dedicated sync API. |
| renderToStream (streaming rendering) | ✅ | Full implementation with Suspense support. Returns `ReadableStream<Uint8Array>`. |
| HTML shell generation (doctype, head, body) | ✅ | Implemented in `renderPage()`. Generates DOCTYPE, `<html>`, `<head>`, `<body>`. |
| Asset injection (CSS, JS links) | ✅ | `asset-pipeline.ts` provides `renderAssetTags()`. Scripts/styles passed via `PageOptions`. |
| Meta tags / head management | ✅ | `HeadCollector` + `renderPage()` supports title, description, OG, Twitter, favicon, custom head. |

### Streaming

| Feature | Status | Notes |
|---------|--------|-------|
| Chunked HTML streaming | ✅ | `renderToStream` returns `ReadableStream`. Content emitted in chunks. |
| Suspense boundary streaming | ✅ | `__suspense` VNodes emit fallback immediately, resolved content via template chunk. |
| Out-of-order streaming | ✅ | Each Suspense boundary resolves independently; chunks appended after main content. |
| Shell-first rendering | ✅ | Main HTML (shell) emitted first, Suspense fallbacks inline, replacements appended. |

### Hydration

| Feature | Status | Notes |
|---------|--------|-------|
| Client hydration script generation | ✅ | `wrapWithHydrationMarkers()` adds `data-v-id`, `data-v-key` + props JSON script. |
| Selective hydration | ✅ | `@vertz/ui` components with `data-v-id` hydrate; static elements ship zero JS. |
| Resumability | ❌ | Not implemented. No server state replay on client. |
| State serialization (server → client) | ❌ | Props serialized in `<script type="application/json">`, but no state manager serialization. |

### Integration

| Feature | Status | Notes |
|---------|--------|-------|
| renderPage() API | ✅ | Full API in `render-page.ts`. Returns `Response` with HTML. |
| Route-level SSR | ✅ | Via `vite-plugin.ts` SSR middleware. Handles all routes, injects into index.html. |
| Layout system | ❌ | Not implemented at SSR layer. Component-level only. |
| Error page rendering | ❌ | HTTP exceptions exist in `@vertz/server` but no SSR error page integration. |
| 404 page handling | ❌ | Status code can be set via `renderPage(vnode, { status: 404 })` but no built-in 404 page. |

### Query / Data

| Feature | Status | Notes |
|---------|--------|-------|
| Server-side data fetching | ❌ | No built-in mechanism. Users must implement their own async data loading. |
| query() integration with SSR | ❌ | `query()` exists in `@vertz/ui` but no SSR integration (no prefetch, no serialization). |
| Skeleton/placeholder generation | ❌ | No built-in skeleton component or placeholder system. |
| Data serialization for client pickup | ❌ | Only props serialization. No state or query result serialization. |

---

## Implementation Details

### Streaming Flow

1. **Phase 1:** `renderToStream()` walks VNode tree, serializes sync content, replaces Suspense boundaries with `<div id="v-slot-N">` fallbacks
2. **Phase 2:** Awaits all Suspense promises, generates `<template id="v-tmpl-N">` + replacement script for each
3. **Output:** Main HTML + appended template chunks

### DOM Shim

- `installDomShim()` creates fake `document`, `window`, `HTMLElement`, etc.
- `toVNode()` converts SSR DOM nodes back to VNodes for rendering
- Sets `globalThis.__SSR_URL__` for router context

### Hydration Flow

1. SSR renders component with `data-v-id="ComponentName"` and `data-v-key="unique"`
2. Props serialized as `<script type="application/json">` child
3. Client `hydrate(registry)` scans for `[data-v-id]`
4. Each element hydrated based on `hydrate` attribute (default: `lazy`)

---

## Gaps & Recommendations

### High Priority

1. **Add `renderToString` sync API** — For cases where streaming isn't needed (legacy adapters, email templates)
2. **State serialization (dehydrate/replay)** — Critical for SSR data continuity. Need to serialize query cache, signals, etc.
3. **Query integration with SSR** — `query()` should support SSR prefetch and serialize results to client

### Medium Priority

4. **404/Error page handling** — Integrate `@vertz/server` HTTP exceptions with SSR error pages
5. **Skeleton/placeholder system** — Add built-in `<Skeleton>` component for loading states

### Lower Priority

6. **Layout system** — Could be built at component level, not SSR layer
7. **Resumability** — Future enhancement; current hydration is fine for most apps

---

## Test Coverage Summary

- **ui-server:** 13 test files covering all major modules
- **ui-compiler:** SSR-related tests for vite plugin
- **ui/hydrate:** 2 test files for hydration logic
- **ui:** Integration tests for query, router, component-model

Total: **~20+ test files** with comprehensive coverage of SSR pipeline.

---

## Conclusion

The SSR system is **production-ready for streaming + selective hydration**. The architecture is clean with proper separation (ui-server for rendering, ui-compiler for build, ui for client hydration). The main gaps are around **state serialization** and **SSR data integration** — these would be the focus for completing the SSR story.
