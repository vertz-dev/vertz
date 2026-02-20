# Entity Store Review — DX Skeptic (josh)

## Verdict: Approve with Changes

## Summary
The Entity Store design delivers on its promises: normalized caching, fine-grained reactivity, and compiler-inferred queries that eliminate boilerplate. However, the "magic" of compiler-inferred selects introduces debugging opacity that could trap developers. Several escape hatches exist but lack clear documentation, and the migration path needs more detail. The core mental model is sound, but the edge cases are where this design will succeed or fail.

## Strengths

- **Single source of truth**: One store, four update paths (fetch, optimistic, realtime, SSR). This is genuinely simpler than Apollo's cache-first/network-only/cache-and-network confusion.
- **Compiler-enforced identity**: Making ID fields a compile error (Section 6.1) is the right foundation. Without it, normalization collapses.
- **Zero-API surface for developers**: The store is an implementation detail. Developers use `query()` — same API as before. This is the right call.
- **Optimistic shadow/rollback**: The per-entity rollback mechanism (Section 5.2) is well thought through — cleaner than Apollo's refetchQueries approach.
- **Safe fallback for dynamic access**: When the compiler can't trace property access, fetching all fields with a warning (Section 10.4) is the correct conservative choice.

## Concerns

1. **Critical: Debugging the compiler's inferred selects**
   When the compiler infers the wrong fields, how does a developer debug this? Section 10.9 provides an escape hatch (`select: {...}`), but there's no visibility into *what* the compiler inferred. A developer adding `{user.data.bio}` might get stale data if the compiler already inferred a select without bio. The warning "Dynamic property access" helps, but silent over-fetching (union of fields across branches) is invisible. **What's missing**: DevTools plugin or compile-time output showing the inferred select per query.

2. **Major: Cross-component tracing edge cases**
   Section 10.5 describes tracing through props, but what about:
   - Context providers passing entity data?
   - Custom hooks returning entity fields?
   - Components receiving entities via render props?
   These are common patterns that could break the trace. The doc doesn't address them.

3. **Major: Refactoring is invisible**
   If I rename `user.data.name` to `user.data.displayName` in a component, does the compiler automatically update the inferred select? What if another component still reads `name`? The doc assumes the trace is complete, but refactoring tools (IDE rename) won't update the compiler's internal field map. This will cause stale queries at runtime.

4. **Major: Migration story is thin**
   Section 4 says "zero API changes" but doesn't specify migration. If I have existing `query(() => sdk.users.list({ select: { name: true } }))`, does the compiler override my explicit select? Or ignore it? What about queries that don't use the SDK (raw fetch)? The doc says they fall back to MemoryCache but doesn't specify migration for custom query keys.

5. **Minor: Error messages are underspecified**
   Section 6.1 gives one compiler error example. But what about:
   - Invalid relation access (`post.data.author.posts` without include)?
   - Entity not found in store (what's the error)?
   - Hydration mismatch (server entity count ≠ client)?
   These need concrete error messages, not just "clear enough."

6. **Minor: Testing story is absent**
   How do I test a component that depends on the entity store? Do I mock the store? Mock the SDK? The doc doesn't address unit testing components that read `user.data`. This is critical — without it, developers will battle the framework in tests.

7. **Minor: Escape hatch discoverability**
   Section 10.9 shows explicit `select` override, but there's no "escape hatches" section. A developer hitting compiler limits needs a clear list of override options, not scattered examples.

## Recommendations

1. **Add a "Debugging the Compiler" section** covering: how to see inferred selects (devtools/output), common mistraces, and how to override with explicit `select`.

2. **Specify the migration path**: Concrete examples of what changes when migrating from query-level to entity-level caching. How does existing `select` interact with inference? What happens to custom query keys?

3. **Add a testing section**: Document how to mock the store vs. mock the SDK. Provide test utilities (e.g., `createMockEntityStore`).

4. **List all compiler errors explicitly**: Not just the ID field error. Cover relation errors, hydration errors, and the dynamic access warning.

5. **Address cross-component tracing gaps**: Document what patterns are supported (props, context?, hooks?, render props?). If unsupported, say so explicitly.

6. **Add a "When the Magic Breaks" section**: Compilation failures, runtime staleness, refactoring gotchas. Make the escape hatches discoverable.

---

**Word count**: 542
