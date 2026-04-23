---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

feat(ui,ui-server)!: remove Suspense — use early-return guards for loading states

Closes [#2985](https://github.com/vertz-dev/vertz/issues/2985).

`Suspense` is removed from `@vertz/ui`. Vertz's reactivity model handles loading states via `query().loading` and the compiler-supported early-return guard pattern — `if (q.loading) return <Loading/>; return <Real/>` — which gives you a fully-typed `q.data` past the guard and avoids the Promise-throwing machinery Suspense inherits from React.

**Breaking changes**

- `@vertz/ui` — `Suspense` and `SuspenseProps` are no longer exported. Replace with an early-return guard (see the new "Early return when you need loaded data" section in the data fetching guide).
- `@vertz/ui-server` — `createSlotPlaceholder`, `resetSlotCounter`, `createTemplateChunk`, and `RenderToStreamOptions` are removed. The internal `__suspense` VNode tag (never produced by any shipped code) is gone too. `renderToStream(tree, options?)` is now `renderToStream(tree)` — it walks the tree synchronously and serializes into a single HTML chunk.

**Cleanup**

- `error-boundary-context.ts` (the async-error handler stack used only by Suspense) is removed. `ErrorBoundary` keeps its synchronous try/catch + retry behavior unchanged.
