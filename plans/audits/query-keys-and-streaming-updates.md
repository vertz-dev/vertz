# Query Keys and Streaming Updates Audit

**Date:** 2026-02-18  
**Scope:** Query key generation, carry keys, codegen-related key derivation, streaming component updates, hydration system

---

## 1. Query Key Derivation

### Location
`/packages/ui/src/query/key-derivation.ts`

### Code
```typescript
/**
 * Derive a cache key from a thunk function.
 *
 * Uses the string representation of the function as a simple fingerprint.
 * For deterministic keys in production, prefer passing an explicit `key` option.
 */
export function deriveKey(thunk: () => unknown): string {
  return `__q:${hashString(thunk.toString())}`;
}

/**
 * Simple string hash (djb2 variant).
 * Fast, deterministic, and sufficient for cache key deduplication.
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
```

### How It Works
- Uses `thunk.toString()` as the fingerprint (function source code)
- Hashes the string with a djb2 variant
- Prefix is `__q:` for cache key namespacing
- Same function reference or identical source produces the same key

### Key Usage in query()
See `/packages/ui/src/query/query.ts`:

```typescript
const baseKey = deriveKey(thunk);

// Reactive key derived from the actual signal values read by the thunk.
// When a dependency changes, the thunk is re-called inside the effect
// and the captured signal values produce a new hash. Using actual values
// (instead of a monotonic version counter) means that returning to a
// previously-seen set of dependencies produces the same cache key,
// enabling cache hits without re-fetching.
const depHashSignal: Signal<string> = signal('');
const cacheKeyComputed = computed(() => {
  const dh = depHashSignal.value;
  return customKey ?? (dh ? `${baseKey}:${dh}` : `${baseKey}:init`);
});
```

### Key Features
1. **Base key from thunk source** - Deterministic based on function code
2. **Dependency-aware cache key** - The actual signal values read by the thunk are captured and hashed
3. **Cache hits for repeated deps** - Returning to same dependency values = cache hit without refetch
4. **Explicit key option** - Users can override with `key` option

---

## 2. Query Transformation in Compiler

**Finding: NO automatic query key injection in compiler**

The compiler does NOT currently:
- Transform `query()` calls
- Inject cache keys automatically
- Generate carry keys or automatic query key derivation

The query system is entirely runtime-based in `/packages/ui/src/query/query.ts`. The compiler only handles hydration markers for interactive components.

---

## 3. Hydration System & Component Identity

### Location
`/packages/ui-compiler/src/transformers/hydration-transformer.ts`

### Code
```typescript
/**
 * Marks interactive components with `data-v-id` hydration markers.
 *
 * A component is "interactive" if it contains `let` variable declarations
 * (reactive state) in its body. Static components (only `const` or no state)
 * are skipped and ship zero JS.
 *
 * For interactive components, the root JSX element's opening tag is augmented
 * with `data-v-id="ComponentName"`.
 */
export class HydrationTransformer {
  transform(s: MagicString, sourceFile: SourceFile): void {
    const componentAnalyzer = new ComponentAnalyzer();
    const components = componentAnalyzer.analyze(sourceFile);

    for (const component of components) {
      if (this._isInteractive(sourceFile, component)) {
        this._addHydrationMarker(s, sourceFile, component);
      }
    }
  }

  private _isInteractive(sourceFile: SourceFile, component: ComponentInfo): boolean {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return false;

    // Check for let declarations in the component body
    for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
      if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
      const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
      if (!declList) continue;

      if (declList.getText().startsWith('let ')) {
        return true;
      }
    }
    return false;
  }

  private _injectAttribute(s: MagicString, jsxNode: Node, componentName: string): void {
    // <div /> -> <div data-v-id="Name" />
    // <div> -> <div data-v-id="Name">
    const insertPos = tagName.getEnd();
    s.appendLeft(insertPos, ` data-v-id="${componentName}"`);
  }
}
```

### Component Identity (`data-v-id`)

**Current Implementation:**
- Uses **component name** as the identifier: `data-v-id="ComponentName"`
- Only added to **interactive components** (those with `let` declarations)
- Static components ship zero JS (no hydration marker)

### ⚠️ CRITICAL: NOT Stable Across Deploys

The `data-v-id` is the **component function name**, which:
- Changes if you rename the component
- Is tied to the source code structure
- Does NOT include any hash of the component's implementation

**This means:**
- If you rename `Counter` to `CounterWidget`, the old hydration marker becomes invalid
- No stable component identity across deploys
- Hydration matching is by name only, not by content hash

---

## 4. Streaming / Hot Deploy Analysis

### Location
`/packages/ui-server/src/render-to-stream.ts`

### What Exists
The streaming system uses **Suspense boundaries** for out-of-order streaming:

```typescript
/**
 * Suspense boundaries emit:
 * 1. A `<div id="v-slot-N">fallback</div>` placeholder inline
 * 2. A `<template id="v-tmpl-N">resolved</template><script>...</script>` chunk
 *    appended after the main content once the async content resolves
 *
 * This enables out-of-order streaming: the browser can paint the fallback
 * immediately and swap in the resolved content when it arrives.
 */
export function renderToStream(tree: VNode, options?: RenderToStreamOptions): ReadableStream<Uint8Array>
```

### What Does NOT Exist
- **No per-component streaming updates** - Streaming is at the page level (SSR → browser)
- **No hot deploy / live update** - No mechanism to replace a single component without full page reload
- **No incremental deploy** - The compiler (`/packages/compiler/src/incremental.ts`) handles incremental compilation but NOT client-side component swapping
- **No component-level code splitting with live updates**

---

## 5. Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Automatic query key generation | ✅ Runtime only | `deriveKey()` uses thunk.toString() |
| Carry keys | ❌ Not implemented | No concept in codebase |
| Codegen query transformation | ❌ Not implemented | No compiler transformation of query() |
| Query key injection | ❌ Not implemented | Users must pass explicit keys for production |
| `data-v-id` hydration | ✅ Implemented | Uses component name (not stable) |
| Per-component hot deploy | ❌ Not implemented | Full page reload required |
| Streaming component updates | ❌ Not implemented | Only Suspense-based SSR streaming |
| Incremental client updates | ❌ Not implemented | Server-side incremental compilation only |

---

## 6. Architectural Implications

### Blocking Per-Component Streaming Updates

The current architecture **blocks** per-component streaming/hot-deploy because:

1. **No stable component IDs** - `data-v-id="ComponentName"` changes with rename
2. **No component-level code delivery** - All JS bundled together (or route-split)
3. **No client-side component registry** - No mechanism to fetch/replace a component
4. **Hydration by name matching** - Client looks for exact component name in DOM

### To Enable Per-Component Updates, Would Need:

1. **Stable component IDs** - Hash of component implementation (not name)
2. **Component registry** - Server knows which components exist
3. **Code splitting by component** - Each component = separate JS chunk
4. **Client-side replacement** - Fetch new chunk, re-render component only
5. **Or: Full-page refresh** - Accept trade-off for simplicity
