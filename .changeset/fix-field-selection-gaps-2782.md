---
'vtz': patch
---

fix(compiler): field-selection analyzer handles reduce/flatMap, loops/try/switch, and scope shadowing

Closes [#2782](https://github.com/vertz-dev/vertz/issues/2782).

Three correctness gaps in `field_selection.rs` could cause the compiler to under-request fields from a `query()`, leading to `undefined` at runtime on data the developer expected.

1. **`reduce` and `flatMap` callbacks** are now walked. Previously the statement `tasks.data.items.reduce((acc, t) => ({ ...acc, [t.id]: t.title }), {})` recorded no fields — `reduce` and `flatMap` were listed as non-entity methods but the callback walker only entered `map`/`filter`/`find`/`forEach`/`some`/`every`. The walker now looks up the item-parameter index per method (item is the second param for `reduce`, first for `flatMap`), and the callback walker descends into binary/logical/conditional/array/template/sequence/await/new expressions and computed object keys so `t.id` inside `[t.id]:` is picked up.

2. **Control-flow statements** (`for`, `for-in`, `for-of`, `while`, `do-while`, `try`/`catch`/`finally`, `switch`, labeled, `throw`) are now walked. Previously `track_field_access_in_stmt` only matched `Return`/`If`/`Block`/`ExpressionStatement`/`VariableDeclaration`/`FunctionDeclaration`/`ExportDefaultDeclaration`, so accesses inside any loop or `try`/`switch` were silently dropped. `for (const t of tasks.data.items)` is also treated like a `.map(cb)` — the for-of binding behaves like a callback parameter when the iterable is a query array.

3. **Shadowed bindings no longer leak into the outer query.** A nested `function`/arrow/block/for-binding/catch-param that re-uses the query variable's name used to contribute phantom fields to the outer selection, which could fail server-side validation. The walker now short-circuits when entering any scope that re-binds the name via `let`/`const`/function/param/for-of/for-in/catch. The query variable's own declaration (`const tasks = query(...)`) is exempt so nested-component queries still work.
