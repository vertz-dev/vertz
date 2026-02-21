# EntityStore Implementation Spec Review — Tech Lead (ben)

**Status:** Request Changes

## Summary

The spec is well-structured and mostly implementable. API design is consistent with existing @vertz/ui patterns (signal-based, batch() usage). However, there are several gaps around edge cases, batch behavior in effects, and missing test coverage that need clarification before implementation.

---

## Strengths

1. **API Consistency** — Signal usage (`ReadonlySignal<T | undefined>`) matches query() patterns. `batch()` wrapping is correct. No naming conflicts with existing exports.
2. **File Structure** — Follows existing conventions (`__tests__/`, `index.ts`, types in separate files).
3. **SSR Isolation** — Per-request instantiation is correctly enforced by design.
4. **Test Count** — 58 tests across 5 categories is realistic and covers core functionality.

---

## Concerns

1. **[High] Batch behavior in effects** — What happens when `merge()` is called inside an effect where `batch()` is already active? The spec doesn't address nested batches. Need to verify if the scheduler handles this or if `untrack` is needed.

2. **[High] Integration with query() not detailed** — The spec explicitly excludes this (v0.2), but there are implicit dependencies: how will type change listeners integrate with query invalidation? The query indices exist but aren't connected to query().

3. **[Medium] shallowMerge doesn't handle arrays as field values** — Arrays are replaced entirely, not merged. If an entity has `tags: string[]`, calling `merge` with `{ tags: ['new'] }` replaces the entire array. This may be unexpected.

4. **[Medium] shallowMerge doesn't handle nested objects** — Nested objects are replaced entirely (one level deep). Spec says "shallow diff" so this is likely intentional, but worth documenting explicitly.

5. **[Medium] Signal identity for getMany not explicitly guaranteed** — Spec states get() returns same signal instance, but getMany() returns a computed signal. Is this computed cached? What about repeated calls with identical parameters?

6. **[Medium] Missing test cases** — No tests for: empty array in merge(), empty array in getMany(), arrays as field values, nested objects as field values, or merge() called inside an effect.

7. **[Low] shallowEqual not defined** — The spec references `shallowEqual` but doesn't define it. Need to see implementation to verify it correctly avoids unnecessary signal updates.

---

## Recommendations

1. Add explicit note about nested batches or use `untrack` inside merge to be safe.
2. Document that shallowMerge replaces arrays/nested objects (not merge behavior).
3. Add `shallowEqual` implementation to the spec.
4. Add test cases for edge cases in section 5.1: empty arrays, arrays as fields, nested objects.
5. Consider adding a note in section 3 about getMany() computed caching or clarify that repeated getMany(id[]) creates new computed each time.
6. Before implementing query() integration, document how type change listeners map to query invalidation.

---

## Verdict

**Request Changes** — Address concerns #1 (batch in effects), #3-4 (merge behavior documentation), and add missing test cases before implementation begins.
