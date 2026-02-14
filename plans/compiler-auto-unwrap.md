# Compiler Auto-Unwrap Design: Eliminating `.value` from the Public API

**Author:** Ben (Tech Lead)  
**Date:** 2026-02-14  
**Status:** In Progress  
**Related:** `let-const-reactivity-principle.md`, `VER-227`

---

## Problem Statement

The vertz compiler successfully transforms `let count = 0` into signals and auto-rewrites reads/writes — developers never see `.value` for **local state**. However, `.value` leaks through at **boundaries** where signals come from outside the component:

```tsx
// CURRENT (bad DX — exposes .value)
const tasks = query('/api/tasks');
isLoading = tasks.loading.value;       // .value leak!
const data = tasks.data.value;         // .value leak!

const form = form(schema);
const submitting = form.submitting.value;  // .value leak!
```

**The CTO's mandate:** Developers should NEVER see `.value` or know signals exist. The `let`/`const` principle is the crown jewel — it must extend to everything.

---

## Root Cause Analysis

The current compiler transforms work beautifully for **local variables declared within the component**:

```tsx
let count = 0;  // compiler knows this is a signal
count++;        // transforms to: count.value++
```

But external APIs return **objects with signal properties**, and the compiler has no knowledge of their structure:

```tsx
const tasks = query('/api/tasks');
// compiler sees: const tasks = [some function call result]
// compiler doesn't know that tasks.loading is a Signal<boolean>
isLoading = tasks.loading.value;  // developer must manually unwrap
```

The compiler's `ReactivityAnalyzer` only tracks variables declared in the component body. It has no understanding of the **shape** of values returned from external functions.

---

## Design Goals

1. **Zero `.value` in user code** — Developers should write `tasks.loading`, not `tasks.loading.value`
2. **Compiler-driven** — The unwrapping should be automatic, not runtime magic
3. **Type-safe** — TypeScript should understand the unwrapped types
4. **Extensible** — New APIs (`createLoader`, `createResource`, etc.) should be easy to register
5. **No breaking changes** — Existing code should continue to work (`.value` is still valid)

---

## Proposed Solution: Signal Property Registry

### Core Concept

Teach the compiler about a **registry of known APIs** that return objects with signal properties. When the compiler sees property access on a registered type, it auto-inserts `.value`.

### Architecture

#### 1. Signal API Registry

A static configuration that maps function names to their signal properties:

```typescript
// In the compiler
const SIGNAL_API_REGISTRY = {
  query: {
    properties: {
      data: 'signal',
      loading: 'signal',
      error: 'signal',
      refetch: 'plain',  // function, not a signal
    }
  },
  form: {
    properties: {
      submitting: 'signal',
      errors: 'signal',
      values: 'signal',
      reset: 'plain',
      submit: 'plain',
    }
  },
  createLoader: {
    properties: {
      data: 'signal',
      loading: 'signal',
      error: 'signal',
    }
  },
  // Future: createResource, createStore, etc.
};
```

#### 2. Enhanced Taint Analysis

Extend `ReactivityAnalyzer` to track **signal-bearing objects**:

```typescript
interface VariableInfo {
  name: string;
  kind: 'signal' | 'computed' | 'static' | 'signal-object';
  signalProperties?: Set<string>;  // NEW: which properties are signals
  start: number;
  end: number;
}
```

When the analyzer encounters:

```tsx
const tasks = query('/api/tasks');
```

It recognizes `query` from the registry and marks `tasks` as `kind: 'signal-object'` with `signalProperties: new Set(['data', 'loading', 'error'])`.

#### 3. Property Access Transformer

A new phase in `SignalTransformer` that handles property access on signal-bearing objects:

```typescript
// Before: tasks.loading
// After: tasks.loading.value

// But NOT:
// Before: tasks.refetch()
// After: tasks.refetch()  (no transform — it's marked as 'plain')
```

The transformer walks the AST and for every `PropertyAccessExpression`:

1. Check if the object is a known signal-bearing variable
2. Check if the property is in the `signalProperties` set
3. If yes, append `.value`

#### 4. Chained Access

Handle nested property access:

```tsx
const form = form(schema);
const nameError = form.errors.name;  
// Should become: form.errors.value.name (unwrap .errors, then access .name)
```

The rule: **unwrap at the first signal property access, then stop**.

---

## Implementation Plan

### Phase 1: Core Infrastructure (Day 1)

- [ ] Add `SIGNAL_API_REGISTRY` constant to compiler
- [ ] Extend `VariableInfo` type with `signalProperties`
- [ ] Update `ReactivityAnalyzer` to detect registry calls
- [ ] Write tests for analyzer changes

### Phase 2: Property Access Transform (Day 2)

- [ ] Add property access handling to `SignalTransformer`
- [ ] Handle simple cases: `obj.prop`
- [ ] Handle chained access: `obj.prop1.prop2`
- [ ] Handle call expressions: `obj.method()`
- [ ] Write comprehensive tests

### Phase 3: Integration & Edge Cases (Day 3)

- [ ] Handle destructuring: `const { data, loading } = query(...)`
- [ ] Handle spreads: `{...form.errors.value}` (optimize to `{...form.errors}`)
- [ ] Handle assignments: `const x = tasks.loading` (should insert `.value`)
- [ ] Test with existing task-manager code

### Phase 4: Example Updates (Day 4)

- [ ] Update `task-list.tsx` to remove `.value`
- [ ] Update `task-detail.tsx` to remove `.value`
- [ ] Update `settings.tsx` to remove `.value`
- [ ] Verify all tests pass

### Phase 5: Documentation & Polish (Day 5)

- [ ] Update compiler docs
- [ ] Add migration guide
- [ ] Update TypeScript definitions (if needed)
- [ ] Final quality gates

---

## Edge Cases & Considerations

### 1. Destructuring

```tsx
const { data, loading } = query('/api/tasks');
// Should become:
const { data, loading } = { 
  data: query(...).data.value, 
  loading: query(...).loading.value 
};
// OR track that `data` and `loading` are already unwrapped
```

**Decision:** For v1, require developers to destructure from the object without auto-unwrap. Destructuring is complex and less common. Focus on property access.

### 2. Conditional Access

```tsx
const data = tasks?.data;  // optional chaining
// Should become: tasks?.data.value
```

**Decision:** Handle this in v1. The transform should work for `OptionalPropertyAccessExpression`.

### 3. Dynamic Property Access

```tsx
const key = 'loading';
const value = tasks[key];  // computed property access
```

**Decision:** Do NOT transform computed property access. Too risky — we can't know at compile time if it's a signal property. Keep this explicit.

### 4. Type Imports

```tsx
import { query } from '@vertz/ui';
import { query as q } from '@vertz/ui';
import * as vertz from '@vertz/ui';

const tasks1 = query(...);      // recognize
const tasks2 = q(...);          // recognize (track import alias)
const tasks3 = vertz.query(...); // recognize (namespace import)
```

**Decision:** Track imports and their aliases. The registry lookup should work for direct imports, aliased imports, and namespace imports.

---

## Type Safety

### Runtime Types (No Change)

The actual runtime objects returned by `query()` etc. don't change — they still have signal properties. This is purely a compile-time transform.

### TypeScript Types (Potential Enhancement)

Currently:

```typescript
interface QueryResult<T> {
  data: Signal<T | null>;
  loading: Signal<boolean>;
  error: Signal<Error | null>;
  refetch: () => void;
}
```

With auto-unwrap, the **developer experience** type could be:

```typescript
interface QueryResultUnwrapped<T> {
  data: T | null;           // looks like plain value
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

But this creates a mismatch: the type says `boolean`, but the runtime value is `Signal<boolean>`.

**Decision for v1:** Keep the types as-is (`Signal<T>`). The compiler inserts `.value`, so accessing `tasks.loading` works at runtime even though the type says `Signal<boolean>`. TypeScript doesn't complain because we're technically accessing `.value` under the hood.

**Future:** Explore TypeScript compiler plugin to show "unwrapped" types in IDE, but emit real types for compilation.

---

## Registry Extensibility

Third-party libraries can register their own signal-returning APIs via a compiler plugin API:

```typescript
// In library
export const vertzCompilerPlugin = {
  signalApis: {
    createResource: {
      properties: {
        data: 'signal',
        loading: 'signal',
      }
    }
  }
};
```

The compiler reads `vertz.config.ts` and merges registry entries:

```typescript
// vertz.config.ts
import { defineConfig } from '@vertz/compiler';
import { vertzCompilerPlugin } from 'some-library';

export default defineConfig({
  compiler: {
    plugins: [vertzCompilerPlugin],
  },
});
```

**Decision:** Implement the plugin API in v2. For v1, hard-code the core APIs (`query`, `form`, `createLoader`).

---

## Testing Strategy

### Unit Tests

1. **Analyzer tests:** Verify signal-object detection
   - `query()` call → marks variable as signal-object
   - Import alias tracking
   - Namespace imports

2. **Transform tests:** Verify property access rewriting
   - Simple access: `obj.prop` → `obj.prop.value`
   - Chained access: `obj.prop.nested` → `obj.prop.value.nested`
   - Method calls: `obj.method()` → `obj.method()` (no transform)
   - Optional chaining: `obj?.prop` → `obj?.prop.value`

### Integration Tests

3. **Task-manager examples:**
   - Remove all `.value` from pages
   - Verify compiled output is correct
   - Verify runtime behavior is unchanged

### Regression Tests

4. **Existing signal transformer tests:** Ensure local signal transforms still work

---

## Success Criteria

✅ All `.value` usage removed from task-manager example  
✅ All existing tests pass  
✅ New tests for auto-unwrap pass  
✅ Quality gates pass: `bun run test && bun run typecheck && bun run lint`  
✅ Compiled output is clean (no double `.value.value`)  
✅ Performance: no measurable regression in compilation time  

---

## Timeline

- **Day 1 (Feb 14):** Design doc ✅ + Core infrastructure
- **Day 2 (Feb 15):** Property access transformer
- **Day 3 (Feb 16):** Edge cases & integration
- **Day 4 (Feb 17):** Example updates
- **Day 5 (Feb 18):** Documentation & review

Launch-blocking, but quality > speed. If we need day 6-7 for polish, take it.

---

## Alternatives Considered

### Alt 1: Proxy-Based Runtime Unwrapping

Use JavaScript Proxies to intercept property access and auto-return `.value`:

```typescript
return new Proxy(queryResult, {
  get(target, prop) {
    const val = target[prop];
    return val && typeof val === 'object' && 'value' in val ? val.value : val;
  }
});
```

**Rejected:** Runtime overhead, breaks type safety, makes debugging harder, goes against "compiler does the work" philosophy.

### Alt 2: Explicit Unwrap Helper

Provide a helper function:

```typescript
const { data, loading } = unwrap(query(...));
```

**Rejected:** Still exposes the problem to developers. Not "invisible."

### Alt 3: Different Return Type

Make `query()` return already-unwrapped values:

```typescript
function query<T>(...): { data: T, loading: boolean }
```

**Rejected:** Loses fine-grained reactivity. Components wouldn't re-render when only `loading` changes.

### Alt 4: Do Nothing

Accept `.value` as part of the API.

**Rejected:** Violates the `let`/`const` principle and the CTO's vision. If local state doesn't need `.value`, external state shouldn't either.

---

## Conclusion

This design extends the `let`/`const` reactivity principle to **external boundaries**. By teaching the compiler about signal-returning APIs, we achieve the goal: **developers never write `.value`**.

The implementation is compiler-driven, type-safe (with caveats), extensible, and delivers on the framework's DX promise: **"You just write JavaScript. The compiler does the rest."**

Next: Implement Phase 1 with TDD.
