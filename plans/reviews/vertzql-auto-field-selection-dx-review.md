# DX Review: VertzQL Automatic Field Selection

- **Reviewer:** josh (DX)
- **Date:** 2026-03-10
- **Verdict:** Changes Requested

## What I Like

1. **Zero-ceremony design.** The developer writes the same `query(api.users.list())` they write today. No `gql` tags, no `@fields` directives, no manual `select` arrays. This is the right approach for an LLM-native framework — an LLM can use this correctly on the first prompt because there is literally nothing new to learn.

2. **Opaque access fallback.** Spreads, dynamic keys, and `JSON.stringify` gracefully fall back to fetching all fields instead of silently dropping data. This is exactly the right safety default. A developer will never be confused by missing fields from opaque access patterns.

3. **Existing building blocks.** The analyzers, VertzQL parser, field filter runtime, and entity store are all already working and tested. This design stitches them together rather than inventing new abstractions. Good engineering judgment.

4. **Inspectable manifest.** The `.vertz/field-selection.json` artifact and `VERTZ_DEBUG=fields` logging give developers a concrete way to understand what the compiler decided. This is critical for a feature where the "magic" is invisible.

5. **`id` always included.** Smart. Entity store normalization, `key` props, and cursor pagination all depend on `id`. One less footgun.

## Concerns

### Blocking

#### B1: The `undefined` gap is a type safety violation that contradicts the manifesto

The design doc acknowledges this but defers it to "Phase 2+ mitigation strategies." This is the single biggest DX problem with the entire feature, and it needs a Phase 1 answer.

The manifesto says: "If your code builds, it runs." The vision says: "If TypeScript says it's good, it runs." This feature introduces a case where TypeScript says `user.bio` is `string`, but it's `undefined` at runtime. That is a direct violation of Principle #1.

The doc proposes three mitigations, all deferred:
- Compiler diagnostic (Phase 2+)
- Dev mode runtime assertion (Phase 2+)
- Strict mode with `Pick<>` types (future)

**At minimum, Phase 1 must include the dev mode runtime assertion.** The entity store already has `inspect()` for debugging. When a field is read from an entity that was fetched with `select`, and that field is not in the select set, the store (or a development-mode proxy) should log a clear warning:

```
[vertz] Field "bio" was accessed on User#42 but was not included in the
field selection for query "users" in UserListPage.tsx:3.
Selected fields: id, name, email.
Add {user.bio} to your JSX or component props to include it automatically.
```

Without this, a developer who accesses a non-selected field outside JSX (in an event handler, a `watch()`, a `console.log`, a utility function) will get `undefined` with zero explanation. They will assume the API is broken, not that the compiler optimized away their field. This is the kind of silent failure that destroys trust in a framework.

**The doc should also specify how `shallowMerge` interacts with partial data.** I read the implementation — `shallowMerge` only overwrites fields present in `incoming` and skips `undefined` values. This means if an entity was previously fetched with all fields (from a different query or a mutation response), and then a select-narrowed query merges partial data, the old fields are *preserved* in the store. But if the entity is fetched for the first time with a narrowed select, those fields will never exist. This creates an inconsistency: `user.bio` might be `string` or `undefined` depending on whether a different query happened to fetch it first. This ordering-dependent behavior is a DX hazard that needs to be documented and addressed.

#### B2: HMR timing gap when adding a new field

The doc includes an acceptance test for this ("Given a component that changes field access after HMR"), but doesn't specify the user experience during the gap.

Here's the scenario:
1. Developer has `UserCard` rendering `user.name` and `user.email`.
2. Developer adds `<p>{user.bio}</p>` to `UserCard` and saves.
3. File watcher fires. The pre-pass must re-analyze `UserCard.tsx`, update the manifest, propagate the change to `UserListPage.tsx` (parent), and recompile the parent.
4. Until step 3 completes, the compiled parent still has `select: { id: true, name: true, email: true }` — `bio` is missing.
5. HMR hot-swaps `UserCard`, which now reads `user.bio`. It renders `undefined` (or empty string, or nothing).

**What does the developer see?** A blank `<p></p>` where `user.bio` should be. Is this a loading state? A bug in their code? A stale cache? There's no indication that the compiler hasn't caught up yet.

The design must specify:
- What is the expected latency for manifest re-analysis + recompilation of affected parents?
- Is there a visual indicator that field selection is stale (dev overlay badge, console message)?
- Does the SSR module re-import happen after or before the manifest update? (If before, the SSR will also be stale.)

If the manifest update + parent recompilation takes more than ~200ms, this will be a recurring source of confusion. Developers save frequently, and seeing blank fields for even one render cycle trains them to distrust the framework.

#### B3: No escape hatch for the developer who knows better

The doc says "No manual field selection API" under Non-Goals. But what about the developer who has a legitimate reason to fetch all fields for a specific query?

Example: a `UserProfilePage` that renders different fields based on a feature flag or user role:

```tsx
export function UserProfilePage() {
  const user = query(api.users.get(userId));
  const { showBio } = useFeatureFlags();

  return (
    <div>
      <h1>{user.data.name}</h1>
      {showBio && <p>{user.data.bio}</p>}
    </div>
  );
}
```

The compiler sees `user.data.name` and `user.data.bio`. It correctly includes both. But what if the condition is more complex — a runtime API check, a permission gate, a dynamic config that determines which fields to show? What if the developer adds a field in an event handler that the static analyzer can't see?

There needs to be an escape hatch. A pragma comment or a query option that tells the compiler "don't narrow this query":

```tsx
// Option A: pragma
// @vertz-no-field-selection
const user = query(api.users.get(userId));

// Option B: explicit option (even if "not user-facing," it should exist)
const user = query(api.users.get(userId), { select: '*' });
```

Without an escape hatch, the developer's only option when the analyzer gets it wrong is to add a fake opaque access pattern (`const _ = { ...user.data }`) to force the fallback. That's a terrible DX hack.

### Should Fix

#### S1: Entity store partial merge creates stale field illusion

As noted in B1, `shallowMerge` preserves existing fields when incoming data is partial. This means:

1. Query A fetches user with all fields: `{ id, name, email, bio, avatar }`.
2. Query B fetches the same user with `select: { id, name }`.
3. After Query B's merge, the entity store still has `bio` and `avatar` from Query A.

This is actually *good* for the `undefined` gap (more fields are available than expected). But it creates a stale data illusion: `bio` in the store might be hours old, from a completely different query, while `name` is fresh from Query B.

The developer has no way to know which fields are "fresh" and which are "stale leftovers." If they're building a real-time dashboard, they might display confidently stale data without any indication.

The design should address whether `applySelect` on the server strips non-selected fields from the response (so the entity store only receives `{ id, name }`) or whether the response still contains all fields and `select` is only a hint. Based on the current `applySelect` implementation, the server truly strips non-selected fields. So the entity store will merge `{ id: "42", name: "Alice" }` — and if the entity already has `bio: "Old bio"`, it stays. This needs to be documented as a known behavior, and the dev-mode assertion from B1 should also warn about stale field access.

#### S2: `isPrimitivePropName` in `FieldAccessAnalyzer` is a hardcoded heuristic

The analyzer skips props like `className`, `onClick`, `onChange`, `style`, `key`, `ref`, `children`, `count`, `value`, `disabled`, `checked`, `href`, `src`, `alt`, `title`, `id`, `name`, `placeholder`, `type`.

This list is fragile. What about:
- `onSubmit`, `onFocus`, `onBlur` (not in the list but should be)
- A user-defined prop called `title` that is actually an entity field (collision with HTML attribute)
- `name` — is this an HTML attribute or `user.name`?

If a developer passes `user.name` as a prop called `name`, the analyzer might skip tracking it because `name` is in the "primitive" list. This would silently exclude `name` from the field selection, causing `undefined` at runtime.

This is especially dangerous because the prop name collision (`name`, `title`, `id`) happens with some of the most common entity fields. The heuristic needs to be smarter — it should check the prop's *value expression*, not just its name. If the value traces back to query data, it should be tracked regardless of the prop name.

#### S3: Cross-file analyzer doesn't handle re-exports or barrel files

The `CrossComponentAnalyzer.resolveComponentPath` iterates all source files looking for a matching function/variable declaration by name. This won't work when:

- A component is re-exported from a barrel file: `export { UserCard } from './UserCard';`
- A component is imported with a different name: `import { UserCard as Card } from './UserCard';`
- A component comes from a local shared library: `import { DataTable } from '@app/components';`

When `resolveComponentPath` fails, the prop flow edge is silently dropped. The parent's query won't include the child's field accesses. The developer gets `undefined` fields with no warning, no error, no indication that the analyzer couldn't trace the component.

At minimum, there should be a diagnostic when a JSX component can't be resolved: `[vertz] Could not resolve component <UserCard> in UserListPage.tsx — field selection will be conservative (fetch all fields).` And the behavior should be to fall back to opaque (fetch all), not to silently narrow.

#### S4: What happens with `query()` results passed to utility functions?

```tsx
function formatUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}

export function UserCard({ user }: { user: User }) {
  const fullName = formatUserName(user);
  return <div>{fullName}</div>;
}
```

The analyzer tracks property access on the `user` prop within the component function body. But `formatUserName` is a plain function, not a component. The analyzer won't trace into it. So `firstName` and `lastName` won't be in the field set, and `formatUserName` will receive `undefined` values.

This is a very common pattern. The design should specify:
- Does the analyzer follow function calls within a component body?
- If not, does it treat function calls with entity data as opaque access?
- What's the developer's escape hatch? (See B3.)

#### S5: No story for components that consume data from multiple queries

The doc focuses on the case where a component's data comes from a single query. But what about:

```tsx
export function TaskCard({ task, assignee }: { task: Task; assignee: User }) {
  return (
    <div>
      <h3>{task.title}</h3>
      <p>Assigned to: {assignee.name}</p>
    </div>
  );
}
```

Where `task` comes from `query(api.tasks.list())` and `assignee` comes from `query(api.users.get(task.assigneeId))`. The cross-component analyzer needs to attribute `task.title` to the tasks query and `assignee.name` to the users query. The prop flow graph tracks `sourceKind: 'query' | 'prop'` and `queryVar`, so this should work. But the design doc doesn't explicitly address this scenario, and it's worth a test case.

### Nice to Have

#### N1: Dev overlay integration showing active field selections

The Phase 5 diagnostics mention a "fields badge" on queries, but a more powerful tool would be a component-level overlay (like React DevTools) that shows:
- Which fields this component accesses
- Which query they come from
- Whether any fields were excluded by the analyzer
- The full propagation chain (parent -> child -> grandchild)

This would make the "invisible optimization" inspectable without reading JSON manifests.

#### N2: Consider a `query.fields` diagnostic property

For debugging, it would be helpful if the `QueryResult` object exposed the compiler-injected fields at runtime:

```tsx
const users = query(api.users.list());
console.log(users.__fields); // ['id', 'name', 'email'] — dev mode only
```

This gives the developer immediate visibility without checking the manifest file or enabling debug logging.

#### N3: Performance budget for the pre-pass should be in the design doc

The "Unknowns" section mentions a POC for ts-morph performance, but doesn't set a target. "< 2 seconds" for 50 files is mentioned in the Phase 1 acceptance criteria, but what about 200 files? 500 files? The design should specify:
- Cold start budget: X seconds for N files
- Incremental update budget: < 100ms for single-file change + propagation
- What happens if the budget is exceeded (skip field selection for this cycle? show a warning?)

## Questions for the Author

1. **What happens when the same entity is fetched by two queries with different `select` sets?** Query A selects `{ id, name }` and Query B selects `{ id, email }`. The entity store will merge both. After Query A resolves, the entity has `{ id, name }`. After Query B resolves, `shallowMerge` produces `{ id, name, email }`. Is this the intended behavior? What if Query A refetches and the server returns `{ id, name }` — does `email` persist from Query B's earlier merge? (Yes, based on `shallowMerge` implementation.) Is this acceptable?

2. **How does this interact with optimistic updates?** When a mutation applies an optimistic layer with `applyLayer()`, it patches specific fields. If the subsequent refetch uses a narrowed `select` that doesn't include the optimistically-updated field, what happens? The refetch merges partial data, the optimistic layer is committed with server data that might not include the field. Does the field revert silently?

3. **Is there a plan for the `items` accessor pattern?** The `query()` implementation for list queries reconstructs `{ ...envelope, items }`. The field access analyzer needs to handle `users.data.items.map(u => u.name)` — tracking through `.data.items.map()`. The current `extractFieldsFromScope` does handle this chain (it walks `data` -> array methods), but the design doc should confirm this is covered end-to-end.

4. **What about conditional field access?** Consider:
   ```tsx
   {user.role === 'admin' && <span>{user.adminNotes}</span>}
   ```
   The analyzer should include both `role` and `adminNotes`. Does it? The condition `user.role === 'admin'` is a property access expression, so it should be tracked. But if the condition is more complex (`someExternalCheck() && <span>{user.adminNotes}</span>`), does the analyzer still catch `adminNotes`?

5. **What about field access in event handlers?**
   ```tsx
   <button onClick={() => navigator.clipboard.writeText(user.email)}>
     Copy Email
   </button>
   ```
   Here `user.email` is accessed inside a JSX event handler, not in a JSX text node. Does the analyzer track this? If not, the user clicks "Copy Email" and gets `undefined` copied to clipboard. This is the kind of edge case that erodes trust.
