# Phase 2: Wire `htmlAttributes` into Handlers

## Context

SSR HTML attributes injection ([#2186](https://github.com/vertz-dev/vertz/issues/2186)). Phase 1 built the `injectHtmlAttributes` utility. This phase wires it into both `createSSRHandler` and `createNodeHandler`. See `plans/ssr-html-attributes.md` for full design.

## Tasks

### Task 1: Add `htmlAttributes` to `SSRHandlerOptions` and wire into `ssr-handler.ts`

**Files:**
- `packages/ui-server/src/ssr-handler.ts` (modified)
- `packages/ui-server/src/__tests__/ssr-handler.test.ts` (modified)

**What to implement:**

1. Add `htmlAttributes?: (request: Request) => Record<string, string> | null | undefined` to `SSRHandlerOptions` with JSDoc and `@example`.

2. In `createSSRHandler`, destructure `htmlAttributes` from options.

3. In the returned handler function, after session resolution and before the progressive/buffered branch:
   - If `htmlAttributes` is set, call it with `request`
   - If result is non-null and non-empty, use `injectHtmlAttributes()` to modify the template

4. **Buffered path** (`handleHTMLRequest`): pass the per-request template instead of the precomputed one. Add `htmlAttributes` and `request` to `handleHTMLRequest`'s parameter list, or compute the modified template in the closure and pass it.

5. **Progressive path** (`handleProgressiveHTMLRequest`): pass the modified `headTemplate` (or `htmlAttributes` + `request` so it can modify `headChunk`).

6. Nav requests (`X-Vertz-Nav`) must NOT invoke the callback — they branch early, before html attributes logic.

**Acceptance criteria:**
- [ ] `htmlAttributes` callback receives the request and injects attributes on `<html>`
- [ ] Buffered path: attributes present in final HTML
- [ ] No call for nav requests (X-Vertz-Nav: 1)
- [ ] `htmlAttributes` returning `null` leaves template unchanged
- [ ] `htmlAttributes` returning `undefined` leaves template unchanged
- [ ] `htmlAttributes` returning `{}` leaves template unchanged
- [ ] Different requests get different attributes (per-request, not cached)

---

### Task 2: Wire `htmlAttributes` into `node-handler.ts`

**Files:**
- `packages/ui-server/src/node-handler.ts` (modified)

**What to implement:**

1. Destructure `htmlAttributes` from options in `createNodeHandler`.

2. In the handler closure, after session resolution:
   - If `htmlAttributes` is set and `sessionResolver` already constructed a `Request`, reuse it
   - Otherwise, construct a `Request` from `IncomingMessage` (same pattern as session resolver)
   - Call `htmlAttributes(request)` and apply `injectHtmlAttributes()` to the template

3. **Buffered path**: pass modified template to `injectIntoTemplate()`

4. **Progressive path** (`handleProgressiveRequest`): modify `headChunk` in `handleProgressiveRequest`. Add `htmlAttributes` callback + request to its parameter list, or compute modified headTemplate before calling it.

5. Nav requests branch early — no change needed.

**Acceptance criteria:**
- [ ] Node handler applies `htmlAttributes` in buffered path
- [ ] Node handler applies `htmlAttributes` in progressive path
- [ ] Request object constructed from IncomingMessage for the callback
- [ ] Nav requests not affected
