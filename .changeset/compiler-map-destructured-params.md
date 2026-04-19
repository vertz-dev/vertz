---
'@vertz/native-compiler': patch
---

fix(compiler): transform JSX inside `.map()` callbacks with destructured params

Previously, when a `.map()` callback used destructuring in its parameter
list, the JSX inside the callback was emitted verbatim, causing a
`SyntaxError: Unexpected token '<'` in the browser.

```tsx
const entries: [string, string][] = [['a', 'Alpha'], ['b', 'Beta']];
<div>{entries.map(([key, label]) => <button key={key}>{label}</button>)}</div>
```

The list classifier bailed to the generic-expression path whenever the
first parameter wasn't a plain `BindingIdentifier`. It now accepts any
binding pattern (array or object destructuring) and preserves the raw
pattern source in the emitted render / key functions.

Closes #2817.
