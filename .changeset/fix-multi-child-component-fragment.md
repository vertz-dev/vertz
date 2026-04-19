---
'@vertz/ui': patch
'@vertz/native-compiler': patch
---

fix(compiler,ui): wrap multi-child component children in a DocumentFragment

Previously, a component with multiple JSX children compiled to
`Component({ children: () => [a, b] })`. Consumers such as
`Context.Provider`, `Suspense`, and `ErrorBoundary` call `children()` and
expect a single node — they got an array instead, which downstream
`appendChild` calls rejected. This affected any component that treats
`children` as a renderable slot, so code like

```tsx
<RouterContext.Provider value={router}>
  <aside>…</aside>
  <main>…</main>
</RouterContext.Provider>
```

crashed at mount with a generic
`TypeError: Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'.`

The compiler now emits a `DocumentFragment`-returning thunk for
multi-child components, mirroring how `<>…</>` fragments are already
handled. `Context.Provider` also wraps any hand-written array result in a
`DocumentFragment` as a defensive fallback, replacing the previous
dev-only throw (which was unreliable in the browser because
`process.env.NODE_ENV` is not polyfilled).

Closes #2821.
