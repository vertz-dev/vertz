# Replace `__child` Span Wrappers with Comment Markers

## Context

Every reactive JSX expression (`{someReactiveVar}`) compiles to `__child(() => expr)`, which creates a `<span style="display: contents">` wrapper element. Content is appended *inside* the span. This adds one extra DOM node per reactive expression — potentially dozens per page.

```html
<!-- Current SSR output for <div>{name}</div> -->
<div><span style="display: contents">Alice</span></div>

<!-- Proposed SSR output -->
<div><!--child-->Alice</div>
```

The span exists because the original architecture needed a *container* — a node that can hold children, clear them, and re-append. But `__conditional` already proves the alternative: a comment anchor with sibling-based content management.

---

## API Surface

### No public API change

`__child` is a compiler output target — developers never call it directly. The compiler still emits the same pattern:

```typescript
// Compiler output (unchanged)
__append(parentVar, __child(() => name.value))
```

The return type changes internally:

```typescript
// Before
export function __child(fn: () => ...): HTMLElement & { dispose: DisposeFn }

// After
export function __child(fn: () => ...): Node & { dispose: DisposeFn }
```

This is safe because:
- `__append(parent, child)` accepts `Node`, not `HTMLElement`
- No consumer code accesses `.style`, `.children`, or `.tagName` on the return value
- The compiler always passes the result directly to `__append` or returns it from a thunk

---

## Manifesto Alignment

### Performance is not optional (Principle 7)

Every reactive expression creates an extra DOM node today. For a page with 50 reactive expressions, that's 50 unnecessary spans in the DOM tree. Comment markers eliminate this overhead — smaller HTML payload, flatter DOM, fewer nodes for the browser to manage.

### If it builds, it works (Principle 1)

The change is purely internal — compiler output and test assertions are the verification layer. No type signature changes in public API.

### One way to do things (Principle 2)

Currently, `__conditional` uses comment anchors while `__child` uses span wrappers — two different patterns for the same concept (reactive DOM regions). Unifying on comment markers makes the codebase more consistent.

### No ceilings (Principle 8)

The span wrapper was the simplest initial approach. Now that `__conditional` has proven the comment anchor pattern works (including hydration), we can adopt the better approach.

---

## Non-Goals

- **Changing `__conditional`** — it already uses comment anchors for CSR. Its hydration-path span wrapping (#1553 fix) is a separate concern.
- **Changing `__list`** — list reconciliation operates on a container element, not on `__child` wrappers.
- **Changing the compiler output** — the JSX transformer and signal transformer are untouched. This is purely a runtime change. The compiler still emits `__append(parentVar, __child(() => expr))`.

---

## Unknowns

### 1. DocumentFragment children detach after insertion

**Status**: Resolved — this is well-understood behavior.

When a DocumentFragment is appended to a parent, its children move to the parent and the fragment becomes empty. This is the same pattern `__conditional` CSR path uses (line 229-233 of `conditional.ts`). The anchor comment retains its `parentNode` reference, so subsequent updates work via `anchor.parentNode.insertBefore(...)`.

### 2. Multiple `__child` calls in the same parent

**Status**: Resolved — each `__child` tracks its own managed nodes independently.

```html
<!-- <div>{reactive1} static {reactive2}</div> -->
<div>
  <!--child-->content1
   static
  <!--child-->content2
</div>
```

Each `__child` has its own `managed: Node[]` array. When `reactive1` updates, only the nodes tracked by the first `__child` are removed/replaced. The second `__child` and static text are untouched.

### 3. Insertion timing — content must be inserted after anchor has a parent

**Status**: Resolved — `domEffect` runs synchronously on first call.

The comment anchor is returned inside a DocumentFragment. When `__append(parent, fragment)` runs, the fragment's children (anchor + initial content) move to the parent. The `domEffect` callback runs synchronously during `__child()`, so the anchor has a parent (the fragment) during first evaluation. After `__append`, the anchor's parent becomes the real parent element.

Sequence: fragment is created → anchor appended to fragment → `domEffect` runs synchronously → `anchor.parentNode` is the fragment → content inserted into fragment after anchor → `__child` returns fragment → `__append(parent, fragment)` moves all children (anchor + content) to real parent.

### 4. Multi-node content from thunks/arrays

**Status**: Resolved — `resolveAndInsertAfter` replaces `resolveAndAppend`.

The current `__child` uses `resolveAndAppend(wrapper, value)` which handles arrays and thunks by recursively appending multiple children. The marker-based approach must support this too. A new helper `resolveAndInsertAfter(anchor, value, managed)` resolves thunks and arrays, inserting each node after the anchor (maintaining insertion order) and tracking all produced nodes in the `managed[]` array.

Insertion order is preserved by using a moving reference: each new node is inserted before a `before` reference (initially `anchor.nextSibling`), which keeps nodes in the correct order: `anchor → node1 → node2 → [existing sibling]`.

### 5. SSR shim DocumentFragment support

**Status**: Needs verification during implementation.

The SSR DOM shim's `createDocumentFragment()` must support `insertBefore` for the first synchronous effect run where `anchor.parentNode` is the fragment. The shim's `SSRDocumentFragment` already has `appendChild` — verify `insertBefore` works during Phase 1 implementation. If not, add it to the shim.

---

## Type Flow Map

No generic type parameters are involved. `__child` accepts `() => Node | string | number | boolean | null | undefined` and returns `Node & { dispose: DisposeFn }`. The return type widens from `HTMLElement` to `Node` — this is a safe supertype change since all consumers only use `Node` interface methods.

Type flow: `fn: () => T` → `domEffect` reads `T` → `isRenderNode(value)` branches → `Node` or `Text` inserted as sibling of anchor → anchor (`Comment & { dispose }`) returned inside `DocumentFragment`.

---

## E2E Acceptance Test

### Developer perspective: no visible change

The developer writes JSX exactly the same way. The only observable difference is in DOM inspection:

```tsx
// Developer code (unchanged)
function Greeting({ name }: { name: string }) {
  return <div>Hello {name}!</div>;
}
```

```typescript
describe('Feature: __child comment markers', () => {
  describe('Given a component with a reactive expression child', () => {
    describe('When rendered via CSR', () => {
      it('Then the DOM contains a comment marker instead of a span wrapper', () => {
        // <div><!--child-->Alice</div>  (no span)
        const div = render(() => <Greeting name="Alice" />);
        const comment = div.childNodes[1]; // after "Hello " text
        expect(comment.nodeType).toBe(8); // Comment
        expect(comment.data).toBe('child');
        // Content is a sibling, not a child of a span
        expect(comment.nextSibling?.textContent).toBe('Alice');
      });
    });
  });

  describe('Given SSR output with comment markers', () => {
    describe('When hydrating on the client', () => {
      it('Then the comment marker is claimed and reactive updates work', () => {
        // SSR: <div>Hello <!--child-->Alice!</div>
        // Client hydration claims the comment, attaches effect
        // Signal change: name → "Bob"
        // DOM: <div>Hello <!--child-->Bob!</div>
      });
    });
  });

  describe('Given multiple reactive expressions in the same parent', () => {
    describe('When one expression updates', () => {
      it('Then only the affected content changes, siblings are untouched', () => {
        // <div>{firstName} {lastName}</div>
        // <!--child-->Alice <!--child-->Smith
        // Update firstName → "Bob"
        // <!--child-->Bob <!--child-->Smith (lastName untouched)
      });
    });
  });

  // @ts-expect-error — __child return type is Node, not HTMLElement
  describe('Given code that accesses .style on __child result', () => {
    it('Then TypeScript rejects it', () => {
      const result = __child(() => 'hello');
      // @ts-expect-error — Node has no .style property
      result.style;
    });
  });
});
```

---

## Implementation Plan

### Phase 1: CSR comment markers

**Goal**: Replace span wrapper with comment anchor + managed sibling in the CSR path. No hydration/SSR changes yet.

#### Changes

**`packages/ui/src/dom/element.ts` — `__child()` CSR path (lines 177-228)**

Replace:
```typescript
wrapper = getAdapter().createElement('span') as unknown as HTMLElement & { dispose: DisposeFn };
wrapper.style.display = 'contents';

let childCleanups: DisposeFn[] = [];
wrapper.dispose = domEffect(() => {
  runCleanups(childCleanups);
  const scope = pushScope();
  const value = fn();
  popScope();
  childCleanups = scope;

  // Stable-node optimization
  if (isRenderNode(value) && wrapper.childNodes.length === 1 && wrapper.firstChild === value) {
    return;
  }

  // Text-in-place optimization
  if (!isRenderNode(value) && value != null && typeof value !== 'boolean' && typeof value !== 'function'
      && wrapper.childNodes.length === 1 && wrapper.firstChild!.nodeType === 3) {
    const text = typeof value === 'string' ? value : String(value);
    (wrapper.firstChild as Text).data = text;
    return;
  }

  // Clear and re-append
  while (wrapper.firstChild) {
    wrapper.removeChild(wrapper.firstChild);
  }
  resolveAndAppend(wrapper, value);
});

return wrapper;
```

With a new helper and updated CSR path:

**New helper: `resolveAndInsertAfter()`** — replaces `resolveAndAppend` for the marker-based approach:

```typescript
/**
 * Resolve a value (thunks, arrays, nodes, primitives) and insert each
 * produced node after an anchor, tracking them in the managed array.
 * Insertion order is preserved by advancing the `before` reference.
 */
function resolveAndInsertAfter(
  anchor: Node,
  value: unknown,
  managed: Node[],
  depth = 0,
): void {
  if (depth >= MAX_THUNK_DEPTH) {
    throw new Error('resolveAndInsertAfter: max recursion depth exceeded');
  }
  if (value == null || typeof value === 'boolean') return;
  if (typeof value === 'function') {
    resolveAndInsertAfter(anchor, (value as () => unknown)(), managed, depth + 1);
    return;
  }
  if (Array.isArray(value)) {
    // Insert in order: each item goes after the last managed node (or anchor)
    for (const item of value) {
      resolveAndInsertAfter(anchor, item, managed, depth);
    }
    return;
  }
  // Leaf: node or primitive
  const node = isRenderNode(value)
    ? (value as Node)
    : (getAdapter().createTextNode(
        typeof value === 'string' ? value : String(value),
      ) as unknown as Node);
  // Insert after the last managed node, or after the anchor if none yet
  const insertAfter = managed.length > 0 ? managed[managed.length - 1] : anchor;
  insertAfter.parentNode!.insertBefore(node, insertAfter.nextSibling);
  managed.push(node);
}
```

**Updated CSR path:**

```typescript
const anchor = getAdapter().createComment('child') as unknown as Comment;
const fragment = getAdapter().createDocumentFragment() as unknown as DocumentFragment;
fragment.appendChild(anchor);

// Track nodes managed by this __child instance.
// Content is inserted as siblings AFTER the anchor comment.
let managed: Node[] = [];
let childCleanups: DisposeFn[] = [];

const dispose = domEffect(() => {
  runCleanups(childCleanups);
  const scope = pushScope();
  const value = fn();
  popScope();
  childCleanups = scope;

  // Stable-node optimization: same single node reference → skip DOM work
  if (managed.length === 1 && isRenderNode(value) && managed[0] === value) {
    return;
  }

  // Text-in-place optimization: update existing text node data directly
  // Guards: not a function (thunks must be resolved, not stringified),
  // not a boolean, not null, single managed text node.
  if (
    managed.length === 1 &&
    managed[0].nodeType === 3 &&
    !isRenderNode(value) &&
    value != null &&
    typeof value !== 'boolean' &&
    typeof value !== 'function'
  ) {
    const text = typeof value === 'string' ? value : String(value);
    (managed[0] as Text).data = text;
    return;
  }

  // Remove old managed nodes
  for (const node of managed) {
    node.parentNode?.removeChild(node);
  }
  managed = [];

  // Resolve and insert new content after anchor.
  // Handles thunks, arrays, nodes, and primitives — collecting all
  // produced nodes in managed[] for future cleanup.
  resolveAndInsertAfter(anchor, value, managed);
});

const result = Object.assign(fragment, {
  dispose: () => {
    runCleanups(childCleanups);
    dispose();
  },
}) as unknown as Node & { dispose: DisposeFn };

return result;
```

**Dev-mode guard** (non-blocking, added for better diagnostics):

```typescript
// Inside the domEffect, before resolveAndInsertAfter:
if (process.env.NODE_ENV !== 'production' && !anchor.parentNode) {
  throw new Error('__child: comment anchor detached from DOM — cannot update content');
}
```

**`packages/ui/src/dom/element.ts` — return type**

```typescript
// Before
export function __child(fn: ...): HTMLElement & { dispose: DisposeFn }

// After
export function __child(fn: ...): Node & { dispose: DisposeFn }
```

**`packages/ui/src/dom/__tests__/child-node.test.ts`**

Update all tests:
- `wrapper.children[0]` → check `anchor.nextSibling`
- `wrapper.childNodes.length` → count managed nodes via anchor siblings
- `wrapper.textContent` → check parent's textContent or managed node's textContent
- `wrapper.firstChild` → `anchor.nextSibling`

#### Acceptance Criteria

```typescript
describe('Phase 1: CSR comment markers', () => {
  describe('Given __child(() => "hello")', () => {
    describe('When appended to a parent element', () => {
      it('Then the parent contains a comment node followed by a text node', () => {});
      it('Then no span element exists in the parent', () => {});
    });
  });

  describe('Given __child(() => htmlElement)', () => {
    describe('When the element is a DOM node', () => {
      it('Then the node is inserted as a sibling after the comment anchor', () => {});
      it('Then the node is NOT stringified to [object HTMLElement]', () => {});
    });
  });

  describe('Given __child with a signal that changes from string to string', () => {
    describe('When the signal updates', () => {
      it('Then the text node is updated in-place (same node reference)', () => {});
    });
  });

  describe('Given __child with a signal that changes from string to Node', () => {
    describe('When the signal updates', () => {
      it('Then the text node is removed and the element is inserted after the anchor', () => {});
    });
  });

  describe('Given __child with a signal that changes from Node to null', () => {
    describe('When the signal updates', () => {
      it('Then the managed node is removed, only the comment anchor remains', () => {});
    });
  });

  describe('Given __child that returns the same Node reference on re-evaluation', () => {
    describe('When the effect re-runs', () => {
      it('Then no DOM operations occur (stable-node optimization)', () => {});
    });
  });

  describe('Given multiple __child calls in the same parent', () => {
    describe('When one updates', () => {
      it('Then only the affected managed nodes change', () => {});
    });
  });

  describe('Given __child where fn() returns an array', () => {
    describe('When resolved', () => {
      it('Then all array items are inserted after the anchor in order', () => {});
      it('Then all nodes are tracked in managed[] for cleanup', () => {});
    });
  });

  describe('Given __child where fn() returns a thunk (function)', () => {
    describe('When resolved', () => {
      it('Then the thunk is called and its result is inserted (not stringified)', () => {});
    });
  });
});
```

---

### Phase 2: Hydration

**Goal**: Update the hydration path to claim comment markers instead of span wrappers. SSR output changes automatically from Phase 1 (the CSR path runs during SSR via the DOM shim, so `createComment('child')` → `SSRComment` → `<!--child-->` serialization is already covered).

**Prerequisite**: Phase 1 must include an SSR integration test verifying that the DOM shim correctly serializes the comment + sibling content. If `SSRDocumentFragment.insertBefore` is missing, add it to the shim in Phase 1.

#### Changes

**`packages/ui/src/dom/element.ts` — `__child()` hydration path (lines 99-174)**

The current hydration path:
1. Claims `<span>` via `claimElement('span')`
2. Clears SSR children (JSX inside callbacks is not hydration-aware — #826)
3. Pauses hydration so `fn()` runs CSR path
4. Sets up reactive effect with re-pause logic for router outlet switching

The new hydration path:

```typescript
if (getIsHydrating()) {
  const claimed = claimComment();
  if (claimed) {
    const anchor = claimed as unknown as Comment;
    let managed: Node[] = [];
    let childCleanups: DisposeFn[] = [];

    // Pause hydration so fn() creates fresh DOM via CSR path.
    // JSX inside callbacks is not hydration-aware — see #826.
    pauseHydration();
    try {
      const dispose = domEffect(() => {
        runCleanups(childCleanups);

        // Re-pause on subsequent runs during active hydration
        // (e.g., router outlet switches routes before endHydration)
        const needsPause = getIsHydrating();
        if (needsPause) pauseHydration();
        try {
          const scope = pushScope();
          const value = fn();
          popScope();
          childCleanups = scope;

          // Stable-node optimization
          if (managed.length === 1 && isRenderNode(value) && managed[0] === value) {
            return;
          }

          // Text-in-place optimization
          if (
            managed.length === 1 &&
            managed[0].nodeType === 3 &&
            !isRenderNode(value) &&
            value != null &&
            typeof value !== 'boolean' &&
            typeof value !== 'function'
          ) {
            (managed[0] as Text).data =
              typeof value === 'string' ? value : String(value);
            return;
          }

          // Remove old managed nodes (includes SSR content on first run)
          for (const node of managed) {
            node.parentNode?.removeChild(node);
          }
          managed = [];

          // Insert new content after anchor
          resolveAndInsertAfter(anchor, value, managed);
        } finally {
          if (needsPause) resumeHydration();
        }
      });

      const result = Object.assign(anchor, {
        dispose: () => { runCleanups(childCleanups); dispose(); },
      }) as unknown as Node & { dispose: DisposeFn };
      return result;
    } finally {
      resumeHydration();
    }
  }
}
```

**Key difference from CSR**: During hydration, the anchor is already in the DOM (claimed from SSR). We don't need a DocumentFragment. SSR content after the comment is cleared on first effect run (same as current behavior — SSR children are replaced with CSR content because JSX inside callbacks is not hydration-aware).

**Hydration cursor sequencing**: The `claimComment()` call advances the cursor past the `<!--child-->` comment. The SSR content after the comment (text node or element) is NOT claimed by `__child` — it's cleared and re-rendered via CSR. This matches the current behavior where `claimElement('span')` claims the span, then all SSR children inside are cleared (lines 108-110).

**Hydration validation** — `packages/ui/src/hydrate/hydration-context.ts`, lines 328-339:

Remove the span-detection logic in `findUnclaimedNodes()`. Comment anchors are claimed by `claimComment()`, so they'll be in the `claimed` set. The SSR content after the comment will be removed by `__child` on first effect run, so it won't be in the DOM when validation runs.

**Hydration validation** — `packages/ui/src/hydrate/hydration-context.ts`, lines 328-339:

Remove the span-detection logic. Comment anchors are claimed by `claimComment()`, so they'll be in the `claimed` set. Their sibling content is also claimed. No special skip logic needed.

#### Acceptance Criteria

```typescript
describe('Phase 2: SSR + Hydration with comment markers', () => {
  describe('Given SSR output with comment markers', () => {
    describe('When rendered to HTML', () => {
      it('Then output contains <!--child--> instead of <span style="display: contents">', () => {});
      it('Then HTML payload is smaller than span-based output', () => {});
    });
  });

  describe('Given SSR HTML with <!--child-->content', () => {
    describe('When hydrating', () => {
      it('Then the comment anchor is claimed via claimComment()', () => {});
      it('Then the content node after the comment is preserved (no flash)', () => {});
      it('Then reactive updates work after hydration', () => {});
    });
  });

  describe('Given nested __child inside __conditional during hydration', () => {
    describe('When the condition changes after hydration', () => {
      it('Then the inner __child managed nodes are properly cleaned up', () => {});
    });
  });

  describe('Given a page with 50 reactive expressions', () => {
    describe('When SSR output is compared before and after', () => {
      it('Then the HTML is smaller (no span tags + style attributes)', () => {});
    });
  });
});
```

---

### Phase 3: Cleanup + `__conditional` alignment

**Goal**: Remove leftover span-detection code. Optionally align `__conditional` to use the same managed-array pattern instead of its own wrapper logic.

#### Changes

1. Remove span-detection in `findUnclaimedNodes()` (hydration-context.ts lines 328-339) — no longer needed
2. Update any remaining tests that assert on span wrapper behavior
3. Verify `__conditional` nesting still works correctly with `__child` using comments
4. Documentation: update `dev-server-debugging.md` if it references span wrappers

#### Acceptance Criteria

```typescript
describe('Phase 3: Cleanup', () => {
  describe('Given the hydration validation system', () => {
    describe('When scanning for unclaimed nodes', () => {
      it('Then no span-detection logic exists (removed)', () => {});
      it('Then comment anchors from __child are in the claimed set', () => {});
    });
  });

  describe('Given __conditional wrapping a __child', () => {
    describe('When the condition toggles', () => {
      it('Then __child managed nodes are cleaned up before the branch switches', () => {});
    });
  });
});
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `anchor.parentNode` is null during first `domEffect` run | Medium | Anchor is inside a DocumentFragment — fragment IS the parent. Content goes into fragment, then `__append` moves everything to real parent. Proven by `__conditional` CSR path. Dev-mode guard throws a clear error if this ever happens. |
| Managed node tracking leaks (node removed but still in `managed[]`) | Low | `managed` is replaced on every effect run. Old array is discarded. Removal happens first. |
| SSR comment serialization breaks | None | SSR shim already serializes comments (`<!--text-->`). Proven by `__conditional`. |
| Hydration cursor walks past content | Medium | SSR content after comment is cleared and re-rendered via CSR (same as current behavior). `claimComment()` advances cursor past the comment only. |
| Return type change breaks consumers | Low | Only `__append` consumes the return value. It accepts `Node`. Verified by grep — no external code accesses `.style` or `.children` on `__child` return values. |
| `__conditional` hydration wrapping interaction (#1553) | Medium | When `__conditional` does `replaceChild` on a branch that contains `__child` markers, the `__child`'s managed nodes are children of the branch's root element — they're removed as part of the branch element. The `__child` effect is disposed via `runCleanups(branchCleanups)` in `__conditional`. If `__child` returns a DocumentFragment directly as a branch result, `normalizeNode()` wraps it in a span — so the conditional replaces the span, not individual markers. Phase 3 acceptance criteria explicitly test this interaction. |
| SSR shim DocumentFragment `insertBefore` support | Low | Must verify the shim's fragment supports `insertBefore` for the first synchronous effect run. If missing, add it in Phase 1. |
| Existing tests that query for `<span style="display: contents">` | Low | Known breakage — tests must be updated. All such tests are in `__child` and hydration test files already listed in Key Files. |

---

## Key Files

| File | Change |
|---|---|
| `packages/ui/src/dom/element.ts` | Core implementation — replace span with comment + managed array |
| `packages/ui/src/dom/__tests__/child-node.test.ts` | Update all assertions |
| `packages/ui/src/hydrate/hydration-context.ts` | Remove span-detection, update claiming |
| `packages/ui/src/dom/__tests__/hydration-element.test.ts` | Update hydration tests |
| `packages/ui/src/__tests__/hydration-e2e.test.ts` | Update E2E hydration tests |
| `packages/ui-server/src/ssr-render.ts` | Verify SSR output (may need no changes) |
| `.claude/rules/dev-server-debugging.md` | Update docs referencing span wrappers |
