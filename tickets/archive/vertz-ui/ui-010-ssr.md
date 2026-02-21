# ui-010: Server-Side Rendering (SSR)

- **Status:** ✅ Complete
- **Assigned:** nora
- **Phase:** Phase 5A — Server-Side Rendering
- **Estimate:** 40 hours
- **Blocked by:** ui-001, ui-002, ui-003
- **Blocks:** ui-011, ui-014

- **PR:** #175 (implementation), #253 (documentation)

## Description

Implement server-side rendering for `@vertz/ui` in the `@vertz/ui-server` package. This includes `renderToStream()` returning a `ReadableStream`, out-of-order streaming with Suspense boundaries (slot placeholder + template replacement pattern), Head component for meta/title injection, asset pipeline for script/stylesheet injection, critical CSS inlining, and hydration markers for interactive components.

### What to implement

- `renderToStream()` — returns a `ReadableStream` of HTML
- Component-to-HTML serialization
- Out-of-order streaming with Suspense boundaries
- Slot placeholder mechanism (`v-slot-N`) — placeholder emitted in initial stream
- Template replacement chunks (`v-tmpl-N`) — replacement emitted when async content resolves
- `<Head>` component for meta/title injection into the HTML head
- Asset pipeline — script/stylesheet injection
- Critical CSS — route-to-CSS mapping, critical CSS inlining in streamed HTML
- Hydration markers — `data-v-id`, `data-v-key` for interactive components
- Serialized props in `<script type="application/json">` for hydration
- Static components produce NO hydration markers (zero JS)

### Files to create

- `packages/ui-server/src/index.ts`
- `packages/ui-server/src/render-to-stream.ts`
- `packages/ui-server/src/html-serializer.ts`
- `packages/ui-server/src/streaming.ts`
- `packages/ui-server/src/slot-placeholder.ts`
- `packages/ui-server/src/template-chunk.ts`
- `packages/ui-server/src/head.ts`
- `packages/ui-server/src/asset-pipeline.ts`
- `packages/ui-server/src/critical-css.ts`
- `packages/ui-server/src/hydration-markers.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 5A](../../plans/ui-implementation.md#sub-phase-5a-server-side-rendering-p5-1)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [x] `renderToStream()` returns a `ReadableStream` of valid HTML
- [x] Component tree serializes to HTML correctly
- [x] Suspense boundaries emit placeholder first, then replacement chunk (out-of-order streaming)
- [x] Slot placeholders (`v-slot-N`) appear in initial stream
- [x] Template replacement chunks (`v-tmpl-N`) appear when async content resolves
- [x] `<Head>` component injects `<title>`, `<meta>`, etc. into the HTML head
- [x] Script and stylesheet assets are injected correctly
- [x] Critical CSS is inlined in the streamed HTML
- [x] Interactive components (with `let` variables) get `data-v-id` markers
- [x] Interactive components have serialized props in `<script type="application/json">`
- [x] Static components (no `let`) produce NO hydration markers
- [x] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-5A-1: renderToStream produces valid HTML
test('renderToStream returns complete HTML', async () => {
  function App() { return <div><h1>Hello</h1></div>; }
  const stream = renderToStream(<App />);
  const html = await streamToString(stream);
  expect(html).toContain('<h1>Hello</h1>');
});

// IT-5A-2: Suspense emits placeholder, then replacement chunk
test('Suspense streams out-of-order', async () => {
  function Async() {
    return <Suspense fallback={<div id="v-slot-1">Loading...</div>}>
      <AsyncContent />
    </Suspense>;
  }

  const chunks = await collectStreamChunks(renderToStream(<Async />));
  // First chunk should contain the placeholder
  expect(chunks[0]).toContain('v-slot-1');
  expect(chunks[0]).toContain('Loading...');
  // Later chunk should contain the replacement template
  expect(chunks.some(c => c.includes('v-tmpl-1'))).toBe(true);
});

// IT-5A-3: Interactive components get hydration markers
test('interactive components have data-v-id markers', async () => {
  function Interactive() { let count = 0; return <button onClick={() => count++}>{count}</button>; }
  const html = await streamToString(renderToStream(<Interactive />));
  expect(html).toContain('data-v-id');
  expect(html).toContain('application/json'); // serialized props
});

// IT-5A-4: Static components have NO hydration markers
test('static components produce no JS markers', async () => {
  function Static() { const title = "Hello"; return <h1>{title}</h1>; }
  const html = await streamToString(renderToStream(<Static />));
  expect(html).not.toContain('data-v-id');
});

// IT-5A-5: Head component injects meta/title into the stream
test('Head component injects <title> into HTML head', async () => {
  function Page() {
    return (<><Head><title>My Page</title></Head><div>Content</div></>);
  }
  const html = await streamToString(renderToStream(<Page />));
  expect(html).toContain('<title>My Page</title>');
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.

- 2026-02-11: Implementation completed on feat/ui-v1-phase-5-ssr (PR #175). All SSR core functionality implemented following TDD:
  - `renderToStream()` with streaming HTML output
  - Component-to-HTML serialization with proper escaping
  - Out-of-order streaming with Suspense boundaries
  - Slot placeholders (`v-slot-N`) and template chunks (`v-tmpl-N`)
  - Head management (`HeadCollector`, `renderHeadToHtml()`)
  - Asset pipeline (`renderAssetTags()`)
  - Critical CSS inlining (`inlineCriticalCss()`)
  - Hydration markers (`wrapWithHydrationMarkers()`)
  - CSP nonce support for inline scripts

  - 59 tests passing (PR #175), expanded to 66 tests in subsequent updates
  - Quality gates pass (typecheck, lint, tests)
  - Merged to feat/ui-v1, then to main via PR #199
- 2026-02-13: Documentation added via feat/ui-010-ssr (PR #253):
  - Comprehensive README.md with usage examples and API reference
  - CHANGELOG.md documenting 0.1.0 release features
  - All 66 tests confirmed passing
