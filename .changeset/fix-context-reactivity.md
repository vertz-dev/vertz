---
'@vertz/ui': patch
---

fix(ui): context Provider now propagates computed/derived values reactively

Provider JSX pattern was reading the `value` prop once at initialization, so
computed values (e.g., `doubled: doubled.value` from computed-transformer
shorthand expansion) were captured as stale primitives. Consumers never saw
updates.

The fix detects when `value` is a getter (compiled JSX wraps non-literals in
getters) and creates lazy per-property wrappers that re-read the getter on
each access inside reactive effects, restoring dependency tracking for
computed and derived expressions.

Also fixes the native (Rust) compiler's signal transformer which was
incorrectly expanding signals in shorthand properties (`{ count }` →
`{ count: count.value }`), breaking signal flow-through to context
providers. Now matches the TypeScript compiler behavior: signals in
shorthand stay as SignalImpl objects.
