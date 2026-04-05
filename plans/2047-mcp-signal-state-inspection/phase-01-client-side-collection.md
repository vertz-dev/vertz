# Phase 1: Query Markers + Client-Side State Collection

## Context

This phase builds the browser-side state collection logic for the `vertz_get_state` MCP tool (#2047). It creates `state-inspector.ts` — the script that walks the Fast Refresh component registry, reads signal values via `.peek()`, groups query signals by `_queryGroup` marker, and serializes everything as LLM-friendly JSON.

Design doc: `plans/2047-mcp-signal-state-inspection.md`

---

## Task 1: Add `_queryGroup` marker to query signals

**Files:**
- `packages/ui/src/query/query.ts` (modified)
- `packages/ui/src/query/__tests__/query-group-marker.test.ts` (new)

**What to implement:**

In `query.ts`, after the reactive signals are created (lines 272-281), mark each one with `_queryGroup` so the state inspector can group them:

```typescript
// After line 281 (const entityBacked: Signal<boolean> = signal<boolean>(false);)
// Dev-only: mark signals for state inspection grouping
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
if (__DEV__) {
  const groupKey = customKey ?? baseKey;
  for (const sig of [depHashSignal, rawData, loading, revalidating, error, idle, entityBacked, refetchTrigger]) {
    (sig as Record<string, unknown>)._queryGroup = groupKey;
  }
}
```

Note: `refetchTrigger` is created later at line 603. The `_queryGroup` assignment for it should happen right after its creation. Alternatively, collect all query signals and mark them in a single block before the return statement.

**Acceptance criteria:**
- [ ] All signals created by `query()` have `_queryGroup` set in dev mode
- [ ] `_queryGroup` value equals `customKey ?? baseKey` (the query's cache key)
- [ ] `_queryGroup` is NOT set when `process.env.NODE_ENV === 'production'`
- [ ] Existing query tests still pass

---

## Task 2: Build `safeSerialize()` function

**Files:**
- `packages/ui-server/src/bun-plugin/state-inspector.ts` (new)
- `packages/ui-server/src/bun-plugin/__tests__/state-inspector.test.ts` (new)

**What to implement:**

Create `safeSerialize(value: unknown, maxDepth?: number, seen?: WeakSet<object>): SerializedValue` that converts any JavaScript value to JSON-safe output:

```typescript
// Serialization rules:
// - Primitives (string, number, boolean, null) → as-is
// - undefined → null
// - Date → ISO string
// - Error → { name, message }
// - Function → "[Function: name]" or "[Function]" if anonymous
// - HTMLElement/Node → "[HTMLElement: tagName]"
// - Symbol → "[Symbol: description]"
// - Promise → "[Promise]"
// - Map → "[Map: N entries]"
// - Set → "[Set: N items]"
// - WeakRef/WeakMap/WeakSet → "[WeakRef]" / "[WeakMap]" / "[WeakSet]"
// - ArrayBuffer/TypedArray → "[ArrayBuffer: N bytes]"
// - Circular references → "[Circular]" (tracked via WeakSet)
// - Plain objects → recurse (decrement depth)
// - Arrays → recurse (decrement depth)
// - At depth 0: objects → "[Object: N keys]", arrays → "[Array: N items]"
// Default maxDepth: 4
```

Each `.peek()` call must be wrapped in try/catch — dirty `ComputedImpl.peek()` triggers recomputation which can throw.

**Acceptance criteria:**
- [ ] Primitives serialized as-is
- [ ] Functions include `Function.name` when available
- [ ] DOM nodes show tagName
- [ ] Circular references produce `"[Circular]"`, not infinite loops
- [ ] Depth limiting works at depth 4 with truncation format `"[Object: N keys]"` / `"[Array: N items]"`
- [ ] Date, Map, Set, Error, Promise, WeakRef, ArrayBuffer all handled
- [ ] try/catch around `.peek()` returns `"[Error: message]"` on failure
- [ ] 95%+ test coverage for `safeSerialize()`

---

## Task 3: Build `collectStateSnapshot()` function

**Files:**
- `packages/ui-server/src/bun-plugin/state-inspector.ts` (modified — add to existing file)
- `packages/ui-server/src/bun-plugin/__tests__/state-inspector.test.ts` (modified — add tests)

**What to implement:**

Create `collectStateSnapshot(filter?: string): StateSnapshot` that walks the Fast Refresh registry:

```typescript
const REGISTRY_KEY = Symbol.for('vertz:fast-refresh:registry');

function collectStateSnapshot(filter?: string): StateSnapshot {
  const registry = (globalThis as Record<symbol, Registry>)[REGISTRY_KEY];
  if (!registry) return emptySnapshot('Component registry not available.');

  const components: ComponentSnapshot[] = [];
  let totalInstances = 0;

  for (const [moduleId, moduleMap] of registry) {
    for (const [name, record] of moduleMap) {
      // Apply filter (case-sensitive component name match)
      if (filter && name !== filter) continue;

      const instances: InstanceSnapshot[] = [];
      for (let i = 0; i < record.instances.length; i++) {
        const inst = record.instances[i];
        // Only include instances whose DOM element is still connected
        if (!inst.element?.isConnected) continue;

        const signals: Record<string, SerializedValue> = {};
        const queries: Record<string, QuerySnapshot> = {};

        // Group signals by _queryGroup, separate standalone signals
        const queryGroups = new Map<string, SignalRef[]>();
        const standaloneSignals: SignalRef[] = [];

        for (const sig of inst.signals) {
          const group = (sig as Record<string, unknown>)._queryGroup as string | undefined;
          if (group) {
            if (!queryGroups.has(group)) queryGroups.set(group, []);
            queryGroups.get(group)!.push(sig);
          } else {
            standaloneSignals.push(sig);
          }
        }

        // Serialize standalone signals
        for (const sig of standaloneSignals) {
          const key = (sig as Record<string, unknown>)._hmrKey as string ?? `signal_${Object.keys(signals).length}`;
          signals[key] = safeSerialize(peekSafe(sig));
        }

        // Serialize query groups
        for (const [groupKey, groupSignals] of queryGroups) {
          // Query signals follow creation order: depHash, data, loading, revalidating, error, idle, entityBacked, refetchTrigger
          // Extract the user-facing ones
          queries[groupKey] = buildQuerySnapshot(groupSignals);
        }

        instances.push({ index: i, signals, queries });
        totalInstances++;
      }

      if (filter || instances.length > 0) {
        components.push({ name, moduleId, instanceCount: instances.length, instances });
      }
    }
  }

  // Generate appropriate message for no-results with filter
  const message = generateMessage(filter, registry, components);

  return {
    components,
    totalInstances,
    connectedClients: 0, // Set by server, not client
    timestamp: new Date().toISOString(),
    ...(message ? { message } : {}),
  };
}
```

Key behaviors:
- **Filter**: case-sensitive component name match
- **Connected-only**: skip instances where `element.isConnected === false`
- **Query grouping**: signals with `_queryGroup` are grouped into `QuerySnapshot` objects
- **Error messages**: distinguish "registered but not mounted" vs "not in registry"
- **Size cap**: if serialized JSON exceeds 2 MB, truncate instances (keep first N per component), set `truncated: true`

**Acceptance criteria:**
- [ ] Walks the Fast Refresh registry correctly
- [ ] Filter matches component name case-sensitively
- [ ] Skips disconnected DOM elements
- [ ] Groups query signals by `_queryGroup` into `QuerySnapshot`
- [ ] Standalone signals keyed by `_hmrKey` or positional fallback
- [ ] "Registered but not mounted" message when component exists with 0 connected instances
- [ ] "Not in registry" message when component name doesn't match any record
- [ ] Handles empty registry gracefully
- [ ] Response capped at 2 MB with truncation flag
- [ ] 95%+ test coverage for `collectStateSnapshot()`

---

## Testing Notes

Tests use the same pattern as `fast-refresh-runtime.test.ts`:
- `@happy-dom/global-registrator` for DOM APIs
- Mock registry on `globalThis[Symbol.for('vertz:fast-refresh:registry')]`
- Import `signal` from `@vertz/ui` for creating real signal instances
- Clear registry in `beforeEach`

For the query marker test in `@vertz/ui`, use Bun's test runner directly (`bun test`).
