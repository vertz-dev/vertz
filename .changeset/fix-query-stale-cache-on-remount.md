---
'@vertz/ui': patch
---

fix(query): refetch on remount when a mutation occurred while the query was unmounted [#2986]

When a user navigated from a list page to a form, created an entity, and navigated back via `router.navigate()`, the list kept showing the old cached data until a full page reload. Between unmount and remount, the list query had unsubscribed from the `MutationEventBus`, so the `emit()` fired by the form's create mutation had no live listener — yet the cached entry (and its query indices) remained, and was served on remount.

`MutationEventBus` now tracks a monotonic per-entity-type version that increments on every `emit()`. `MemoryCache.set()` accepts an optional `version` argument and records it alongside the value; `CacheStore<T>` gained an optional `getVersion(key)` accessor. When `query()` gets a cache hit for an entity-backed query on mount, it compares the cached entry's version with the current bus version for the same entity type and treats the entry as stale when the bus version is newer, falling through to a fresh fetch.

This is additive — custom `CacheStore` implementations that don't implement `getVersion` continue to work and simply keep the previous (cached) behavior.
