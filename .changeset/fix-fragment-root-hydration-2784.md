---
'vtz': patch
---

fix(compiler): AOT threads hydration id onto the first element child of a fragment root

Closes [#2784](https://github.com/vertz-dev/vertz/issues/2784).

Previously, when an interactive component (a component with a `let` declaration) returned a JSX fragment, the AOT SSR transformer silently dropped the `data-v-id` marker. `fragment_to_string` took no `hydration_id` parameter, and the call site in `expr_to_string` passed the id into `element_to_string` but not into `fragment_to_string`. Result: the server-rendered HTML had no root marker the client hydrator could locate, so event handlers and signal subscriptions never attached — an invisible failure for any component written as `return <>...</>`.

The AOT path now matches the runtime SSR behavior (where `inject_hydration_attr` already skips `document.createDocumentFragment()` and targets the first `__element(...)` call): the hydration id is threaded into `fragment_to_string`, and gets attached to the first element-or-fragment child. Text and expression children are skipped; nested fragments recurse, carrying the id down until an element is found or the fragment is exhausted.
