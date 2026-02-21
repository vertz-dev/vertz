# Cross-Component Tracing Spec Review — Tech Lead

**Verdict:** Request Changes

---

## Summary

The spec describes a solid three-phase algorithm that extends the existing field-access-analyzer POC cleanly. Core architecture is sound, but test coverage gaps and unaddressed edge cases require attention before implementation.

---

## Strengths

1. **Clean extension model** — New analyzer adds `propAccess` without modifying existing `queryAccess` or POC tests (27/27 will pass unchanged)
2. **Realistic three-phase design** — Builds on proven intra-component analysis; prop graph + backward propagation is straightforward
3. **Data structures well-designed** — `PropFlowEdge` with `sourceKind`, `pathTransform` captures necessary context for debugging
4. **Performance-conscious** — Graph traversal is bounded by edges (typically << total components); no quadratic behavior
5. **Opaque boundary strategy** — Graceful fallback when resolution fails is the right call for v0.1

---

## Concerns

### 1. **Incomplete edge case coverage** (High)
- **Rest parameters** (`<Child {...props} />`) — not addressed; spec only covers spread as opaque but not rest in function params
- **Forwarded refs** (`forwardRef`, `useImperativeHandle`) — not mentioned
- **Component arrays**: `components.map(c => <C item={c} />)` — not tested
- **props.children** — special React prop, never explicitly covered

### 2. **Entity detection without types is fragile** (Medium)
- No type info means distinguishing `post: Post` from `count: number` requires heuristics
- Same component receiving two different entity types (e.g., `<UserBadge user={user} />` and `<UserBadge user={admin} />`) won't distinguish sources
- Works for happy path but brittle for co-located heterogeneous entities

### 3. **Test gaps for complex prop flows** (Medium)
- No test for **filter + map chains**: `posts.data.filter(...).map(p => <Card post={p} />)`
- No test for **inline conditional JSX children**: `{condition && <Child data={x} />}`
- No test for **array variable passed to child**: `const items = posts.data; <List items={items} />`

### 4. **pathTransform is under-specified** (Low)
- `PropFlowEdge.pathTransform: 'array-element' | 'identity'` is defined but not used in test plan
- Unclear how backward propagation applies this transformation

---

## Recommendations

1. **Add 4–6 tests** covering: rest params, forwarded refs, array variable passing, filter+map chains
2. **Document entity detection heuristics** — clarify what makes a prop "entity-like" without types (e.g., originates from `query().data`)
3. **Clarify pathTransform usage** — either implement in Phase 3 or remove from spec
4. **Add a heuristic note** — entity detection without types may require manual overrides in v0.2

---

## Severity Summary

| Severity | Count |
|----------|-------|
| High     | 1     |
| Medium   | 2     |
| Low      | 1     |

**Action Required:** Address edge case gaps and document entity detection heuristics before implementation.
