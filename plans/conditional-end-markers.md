# Replace `__conditional` Display:Contents Span Wrappers with Comment End Markers

## Context

`__conditional` uses `<span style="display: contents">` wrappers in two places:

1. **`normalizeNode()`** — wraps DocumentFragment branch results so `replaceChild` has a single stable node to replace. Without wrapping, fragments lose their children after insertion, breaking subsequent `replaceChild` calls.

2. **`hydrateConditional()`** — wraps the SSR comment anchor + branch content in a `display:contents` span after the first hydration run. This ensures `replaceChild` removes ALL nodes belonging to the conditional (anchor + content), preventing orphaned siblings when nested conditionals re-evaluate (#1553).

Both cases exist because the current algorithm uses `replaceChild(newNode, currentNode)` for branch switching, which requires a single node to replace. Introducing end markers eliminates this constraint by defining clear region boundaries.

`__child` already migrated from span wrappers to comment markers (#1728, #1730). This plan extends that approach to `__conditional`, completing the removal of reactive `display:contents` spans from the framework runtime.

---

## API Surface

### No public API change

`__conditional` is a compiler output target — developers never call it directly. The compiler still emits the same pattern:

```typescript
// Compiler output (unchanged)
__append(parentVar, __child(() => __conditional(
  () => show.value,
  () => __element('span'),
  () => __element('p'),
)))
```

The internal return type remains `DisposableNode`. The SSR HTML output changes:

```html
<!-- Before -->
<!--conditional--><span>content</span>

<!-- After -->
<!--conditional--><span>content</span><!--/conditional-->
```

This is safe because:
- All packages are pre-v1 with no external users
- SSR output is not cached across deployments
- Hydration is updated in the same change

---

## Manifesto Alignment

### Performance is not optional (Principle 7)

Every conditional expression (`{show && <X/>}`, `{a ? <A/> : <B/>}`) currently produces a `<span>` wrapper during hydration. For a page with 20 conditionals, that's 20 unnecessary span elements. End markers are lightweight comment nodes — invisible to layout, cheaper to create, and smaller in HTML payload.

### One way to do things (Principle 2)

`__child` uses comment markers. `__conditional` uses span wrappers. Two different patterns for the same concept (reactive DOM region boundaries). Unifying on comment markers makes the runtime consistent.

### No ceilings (Principle 8)

The span wrapper was a pragmatic fix for #1553 (nested conditional orphaned nodes). End markers solve the same problem with less DOM overhead and align with the proven `__child` pattern.

---

## Non-Goals

- **Removing `display:contents` from ui-primitives** — composed component root wrappers (`<span style="display: contents" data-dialog-root="">`) serve a different purpose (single-root component requirement). Separate concern.
- **Removing `display:contents` from ui-auth** — `AccessGate`, `AuthGate`, `ProtectedRoute` wrappers are component-level, not reactive runtime. Separate concern.
- **Removing `display:contents` from router outlet** — `outlet.ts` uses it for layout. Separate concern.
- **Changing the compiler output** — the JSX/conditional transformers emit the same code. This is purely a runtime change.

---

## Unknowns

### 1. SSR shim `insertBefore` on fragments doesn't sync `children` array

**Status:** Resolved by design — avoided entirely.

`SSRDocumentFragment.insertBefore` (inherited from `SSRNode`) only updates `childNodes`, not the `children` array used for serialization. If we inserted content between anchor and end marker in a fragment via `insertBefore`, the SSR output would be wrong.

**Resolution:** The first `domEffect` run stores the branch result in a local variable. After domEffect returns (synchronously), the fragment is assembled in order using `appendChild`: `anchor → content → endMarker`. All subsequent runs happen after the fragment is in a real DOM parent (SSRElement or HTMLElement), where `insertBefore` works correctly.

### 2. `claimComment()` doesn't validate comment text

**Status:** Acceptable — sequential cursor ordering guarantees correctness.

`claimComment()` claims the next comment node at the cursor position regardless of its text content. After the branch function claims its SSR nodes (recursively, including nested conditionals), the cursor advances past all branch content. The next comment in sequence is the end marker.

A debug-mode assertion verifies the claimed comment's `data` matches `'/conditional'` to catch hydration mismatches early.

### 3. Nested conditional interaction with `__child`

**Status:** Resolved — `__child` manages the conditional's entire output as opaque content.

In typical compiler output, `__conditional` is wrapped by `__child`:
```ts
__append(parent, __child(() => __conditional(...)))
```

During hydration, `__child` claims its `<!--child-->` anchor and re-renders content via CSR (clearing SSR content first). The inner `__conditional` runs via the CSR path, producing a DocumentFragment with `[anchor, content, endMarker]`. `__child` inserts this fragment as managed siblings. The `__child` boundary (`<!--child-->...next-child-boundary`) encompasses the entire conditional output, including end markers.

---

## Type Flow Map

No generic type parameters involved. `__conditional` accepts `() => boolean` and two branch functions `() => Node | null`, returning `DisposableNode`. No type signature changes.

---

## E2E Acceptance Test

```typescript
describe('Feature: __conditional comment end markers', () => {
  describe('Given a simple conditional expression', () => {
    describe('When rendered via CSR', () => {
      it('Then the DOM contains anchor + content + end marker, no span wrapper', () => {
        // DOM: <!--conditional--><span>visible</span><!--/conditional-->
        const container = document.createElement('div');
        container.appendChild(__conditional(() => true, () => el('span', 'visible'), () => null));
        // No span with display:contents
        const spans = container.querySelectorAll('span[style]');
        expect(spans.length).toBe(0);
        // End marker present
        const comments = Array.from(container.childNodes).filter(n => n.nodeType === 8);
        expect(comments.map(c => (c as Comment).data)).toEqual(['conditional', '/conditional']);
      });
    });
  });

  describe('Given SSR output with end markers', () => {
    describe('When hydrating on the client', () => {
      it('Then the anchor and end marker are claimed, no span wrapper injected', () => {
        // SSR: <div><!--conditional--><span>visible</span><!--/conditional--></div>
        // After hydration: same DOM structure, no wrapper span added
        // Branch switches work: clearBetween + insertBefore
      });
    });
  });

  describe('Given nested conditionals (checkbox pattern)', () => {
    describe('When the outer condition toggles', () => {
      it('Then inner content is fully cleaned up between outer markers', () => {
        // <!--conditional--><!--conditional--><svg/><!--/conditional--><!--/conditional-->
        // Outer switches: clearBetween removes everything between outer markers
        // No orphaned SVG nodes (#1553 regression test)
      });
    });
  });

  describe('Given nested conditional where inner toggles while outer stays stable', () => {
    describe('When inner condition changes multiple times', () => {
      it('Then exactly one content node exists (no duplicates)', () => {
        // Stress test: toggle inner 5 times, verify 1 element
      });
    });
  });

  // @ts-expect-error — normalizeNode removed
  describe('Given code that references normalizeNode', () => {
    it('Then it no longer exists (function removed)', () => {});
  });
});
```

---

## Implementation Plan

### Phase 1: CSR end markers

**Goal:** Replace `normalizeNode` + `replaceChild` with `clearBetween` + `insertContentBefore` in the CSR path. No hydration changes yet.

#### Changes

**`packages/ui/src/dom/conditional.ts` — new helpers:**

```typescript
/**
 * Remove all nodes between `start` and `end` (exclusive).
 * Both start and end must share the same parentNode.
 */
function clearBetween(start: Node, end: Node): void {
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

/**
 * Insert content before the end marker.
 * Handles: null/boolean (nothing), Node (insertBefore),
 * DocumentFragment (browser/shim flattens), primitives (text node).
 * No-ops if endMarker is not yet attached to the DOM (parentNode is null).
 */
function insertContentBefore(endMarker: Node, branchResult: unknown): void {
  if (branchResult == null || typeof branchResult === 'boolean') return;
  const parent = endMarker.parentNode;
  if (!parent) return; // Not yet attached to DOM — skip
  if (isRenderNode(branchResult)) {
    parent.insertBefore(branchResult as Node, endMarker);
    return;
  }
  const text = getAdapter().createTextNode(String(branchResult)) as unknown as Node;
  parent.insertBefore(text, endMarker);
}
```

**`packages/ui/src/dom/conditional.ts` — updated `csrConditional`:**

```typescript
function csrConditional(condFn, trueFn, falseFn): DisposableNode {
  const anchor = getAdapter().createComment('conditional') as unknown as Comment;
  const endMarker = getAdapter().createComment('/conditional') as unknown as Comment;
  let branchCleanups: DisposeFn[] = [];
  let isFirstRun = true;
  // Stores branch result from first synchronous run for fragment assembly.
  let firstRunResult: unknown = undefined;

  const outerScope = pushScope();
  domEffect(() => {
    const show = condFn();
    runCleanups(branchCleanups);

    const scope = pushScope();
    const branchResult = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    if (isFirstRun) {
      isFirstRun = false;
      // Stash result — fragment is assembled after domEffect returns
      firstRunResult = branchResult;
      return;
    }

    // Subsequent runs: clear region and insert new content
    clearBetween(anchor, endMarker);
    insertContentBefore(endMarker, branchResult);
  });
  popScope();

  const disposeFn = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
  };
  _tryOnCleanup(disposeFn);

  // Build fragment in order: anchor → content → endMarker
  // Uses appendChild (not insertBefore) to avoid SSR shim sync issue.
  const fragment = getAdapter().createDocumentFragment() as unknown as DocumentFragment;
  fragment.appendChild(anchor);
  // Insert first-run content (if any)
  if (firstRunResult != null && typeof firstRunResult !== 'boolean') {
    if (isRenderNode(firstRunResult)) {
      fragment.appendChild(firstRunResult as Node);
    } else {
      fragment.appendChild(
        getAdapter().createTextNode(String(firstRunResult)) as unknown as Node,
      );
    }
  }
  fragment.appendChild(endMarker);

  return Object.assign(fragment, { dispose: disposeFn }) as unknown as DisposableNode;
}
```

**Remove `normalizeNode` function** — no longer needed. Branch results are handled directly by `insertContentBefore` (subsequent runs) or fragment assembly (first run).

#### Acceptance Criteria

```typescript
describe('Phase 1: CSR end markers', () => {
  describe('Given __conditional with true branch', () => {
    describe('When appended to a parent element', () => {
      it('Then the parent contains anchor comment, content, and end marker comment', () => {});
      it('Then no span element with display:contents exists', () => {});
    });
  });

  describe('Given __conditional that switches branches', () => {
    describe('When condition changes', () => {
      it('Then old content between markers is removed', () => {});
      it('Then new content is inserted between markers', () => {});
    });
  });

  describe('Given nested __conditional (inner returns DocumentFragment)', () => {
    describe('When outer condition switches', () => {
      it('Then clearBetween removes inner anchor + content + inner end marker', () => {});
      it('Then no orphaned nodes remain', () => {});
    });
  });

  describe('Given __conditional where branch returns null', () => {
    describe('When rendered', () => {
      it('Then only anchor and end marker exist (adjacent)', () => {});
      it('Then switching to a non-null branch works', () => {});
    });
  });

  describe('Given nested conditional checkbox pattern', () => {
    describe('When inner toggles while outer stays stable', () => {
      it('Then exactly one content node exists after multiple toggles', () => {});
    });
  });

  describe('Given __conditional SSR output', () => {
    describe('When serialized to HTML', () => {
      it('Then output contains <!--conditional-->...<!--/conditional-->', () => {});
      it('Then no <span style="display: contents"> exists', () => {});
    });
  });
});
```

---

### Phase 2: Hydration end markers

**Goal:** Update the hydration path to claim end marker comments instead of wrapping in `display:contents` spans. SSR output already includes end markers from Phase 1.

**Prerequisite:** Phase 1 must pass SSR integration tests confirming `<!--/conditional-->` appears in serialized output.

#### Changes

**`packages/ui/src/dom/conditional.ts` — updated `hydrateConditional`:**

```typescript
function hydrateConditional(condFn, trueFn, falseFn): DisposableNode {
  const claimed = claimComment();
  if (!claimed) return csrConditional(condFn, trueFn, falseFn);
  const anchor = claimed as unknown as Node;

  let branchCleanups: DisposeFn[] = [];
  let endMarker: Node | null = null;
  let isFirstRun = true;
  // Flag set if end marker is missing — checked after domEffect returns
  let needsCsrFallback = false;

  const outerScope = pushScope();
  domEffect(() => {
    const show = condFn();

    if (isFirstRun) {
      isFirstRun = false;
      // Branch claims its SSR nodes via hydration
      const scope = pushScope();
      const branchResult = show ? trueFn() : falseFn();
      popScope();
      branchCleanups = scope;

      // Claim text node for primitive branches so cursor advances
      if (branchResult != null && !isRenderNode(branchResult)
          && typeof branchResult !== 'boolean') {
        claimText();
      }

      // Claim the end marker comment.
      // Phase 1 guarantees <!--/conditional--> is always in SSR output.
      const claimedEnd = claimComment();
      if (!claimedEnd) {
        // SSR mismatch: end marker missing. Signal CSR fallback.
        needsCsrFallback = true;
        return;
      }
      endMarker = claimedEnd as unknown as Node;

      if (process.env.NODE_ENV !== 'production'
          && (claimedEnd as Comment).data !== '/conditional') {
        console.warn(
          '[vertz] Hydration mismatch: expected <!--/conditional--> end marker '
          + `but found <!--${(claimedEnd as Comment).data}-->. `
          + 'This usually means SSR output is stale. Try a hard refresh.',
        );
      }
      return;
    }

    // Subsequent runs: clear and re-render between markers
    runCleanups(branchCleanups);
    clearBetween(anchor, endMarker!);

    const scope = pushScope();
    const branchResult = show ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    insertContentBefore(endMarker!, branchResult);
  });
  popScope();

  // domEffect ran synchronously. If end marker was missing, clean up
  // this hydration attempt and fall back to CSR.
  if (needsCsrFallback) {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
    return csrConditional(condFn, trueFn, falseFn);
  }

  const disposeFn = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
  };
  _tryOnCleanup(disposeFn);

  // Return the anchor — it's already in the DOM from SSR.
  return Object.assign(anchor, { dispose: disposeFn }) as unknown as DisposableNode;
}
```

**Key differences from CSR:**
- Anchor is already in the DOM (claimed from SSR), no DocumentFragment needed
- End marker is claimed from SSR (not created)
- First run doesn't insert content — SSR content is already between the markers
- Returns the anchor node (not a fragment)

**`packages/ui/src/hydrate/hydration-context.ts` — update `findUnclaimedNodes`:**

Add skip logic for `<!--/conditional-->` end markers that are claimed:

```typescript
// Skip claimed <!--/conditional--> end markers
if (
  child.nodeType === Node.COMMENT_NODE &&
  claimed.has(child) &&
  (child as Comment).data.trim() === '/conditional'
) {
  child = child.nextSibling;
  continue;
}
```

Also update the existing `<!--child-->` skip logic to additionally skip content between `<!--conditional-->` and `<!--/conditional-->` markers.

**SSR hydration test fixtures update:**

Add `<!--/conditional-->` end markers to all SSR HTML fixtures:

```typescript
// Before
root.appendChild(document.createComment('conditional'));
root.appendChild(span);

// After
root.appendChild(document.createComment('conditional'));
root.appendChild(span);
root.appendChild(document.createComment('/conditional'));
```

#### Acceptance Criteria

```typescript
describe('Phase 2: Hydration end markers', () => {
  describe('Given SSR HTML with <!--conditional-->...<!--/conditional-->', () => {
    describe('When hydrating', () => {
      it('Then the anchor comment is claimed', () => {});
      it('Then the end marker comment is claimed', () => {});
      it('Then no display:contents span wrapper is created', () => {});
      it('Then SSR content between markers is preserved', () => {});
    });
  });

  describe('Given hydrated conditional', () => {
    describe('When branch switches after hydration', () => {
      it('Then clearBetween removes old content between markers', () => {});
      it('Then new content is inserted between markers', () => {});
    });
  });

  describe('Given nested conditional during hydration (checkbox pattern)', () => {
    describe('When outer condition changes after hydration', () => {
      it('Then inner content is fully cleaned up', () => {});
      it('Then no orphaned nodes remain (#1553 regression)', () => {});
    });
  });

  describe('Given nested conditional where outer switches then switches back', () => {
    describe('When toggling outer condition', () => {
      it('Then content is correct after each toggle', () => {});
      it('Then no duplicate text nodes', () => {});
    });
  });

  describe('Given findUnclaimedNodes validation', () => {
    describe('When scanning hydrated DOM', () => {
      it('Then <!--/conditional--> markers are not reported as unclaimed', () => {});
    });
  });

  describe('Given debug mode and a hydration mismatch', () => {
    describe('When claimComment() returns a comment that is not /conditional', () => {
      it('Then a warning is logged with an actionable message', () => {});
    });
  });

  describe('Given SSR without end markers (stale SSR)', () => {
    describe('When hydrating', () => {
      it('Then falls back to CSR path gracefully (no crash)', () => {});
    });
  });
});
```

---

### Phase 3: Cleanup and docs

**Goal:** Remove leftover references to `display:contents` span wrapping in `__conditional`. Update docs and stale tests.

#### Changes

1. **Remove stale span references in docs** (note: ARCHITECTURE.md is already stale from the `__child` migration in #1728 — this phase fixes it along with the conditional references):
   - `packages/ui/src/hydrate/ARCHITECTURE.md` line 95 — references claiming `<span style="display:contents">` wrapper. Update to describe comment marker claiming for both `__child` and `__conditional`.
   - `packages/ui/src/hydrate/hydration-context.ts` line 313 — doc comment references `display: contents` wrappers

2. **Update `findUnclaimedNodes` comment** — remove reference to `__child CSR content` span wrappers in the function doc (line 313).

3. **Update E2E hydration tests** — add `<!--/conditional-->` end markers to all manually constructed SSR DOM fixtures containing conditionals. Specific test cases requiring fixture updates:
   - `packages/ui/src/__tests__/hydration-e2e.test.ts`:
     - `'conditional content preserved during tolerant hydration'` (line ~113) — SSR HTML fixture missing end marker
     - `'checkbox-like conditional SVG: no duplicate after hydration + toggle'` (line ~284) — nested conditional SSR fixture
     - Any other test that constructs `<!--conditional-->` in SSR HTML

4. **Update SSR domeffect tests** — verify end markers appear in SSR output. Tests that count `childNodes` expecting 2 (anchor + content) will now find 3 (anchor + content + end marker):
   - `packages/ui/src/dom/__tests__/ssr-domeffect.test.ts`

5. **Update fast-refresh-dom-state tests** — these fixtures at lines 407-425 represent `__conditional` output with `<span style="display:contents">`. Update to comment markers:
   - `packages/ui-server/src/__tests__/fast-refresh-dom-state.test.ts`

6. **Update `__child` clearing comment** — in `packages/ui/src/dom/element.ts`, the comment at the SSR content clearing loop should acknowledge that `<!--/conditional-->` end markers are intentionally removed during clearing (they'll be recreated by the CSR re-render).

7. **Verify `Presence` component** — `packages/ui/src/component/__tests__/presence.test.ts` uses `__conditional` internally. Ensure all tests still pass and don't rely on span wrapper behavior.

#### Acceptance Criteria

```typescript
describe('Phase 3: Cleanup', () => {
  describe('Given the codebase', () => {
    it('Then no references to display:contents exist in conditional.ts', () => {});
    it('Then ARCHITECTURE.md references comment markers, not span wrappers', () => {});
    it('Then hydration-context.ts doc comments are updated', () => {});
    it('Then fast-refresh-dom-state test fixtures no longer reference display:contents for conditional output', () => {});
  });

  describe('Given E2E hydration tests', () => {
    describe('When running the full test suite', () => {
      it('Then all tests pass with end marker fixtures', () => {});
      it('Then hydration-e2e tolerant-hydration test uses <!--/conditional--> in fixture', () => {});
      it('Then hydration-e2e checkbox-nested test uses <!--/conditional--> in fixture', () => {});
    });
  });
});
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Nested conditional orphaned nodes (#1553 regression) | High | `clearBetween(outerAnchor, outerEndMarker)` removes ALL nodes between outer markers — including inner anchors, content, and inner end markers. Inner effects are disposed via `runCleanups(branchCleanups)` before clearing. Phase 1 and Phase 2 acceptance criteria include explicit checkbox-pattern regression tests. |
| SSR shim fragment `insertBefore` doesn't sync `children` | Medium | Avoided by design: first run stashes the result and the fragment is assembled using `appendChild` in order. `insertBefore` is only used on subsequent runs when nodes are in real DOM parents (SSRElement or HTMLElement). |
| `claimComment()` claims wrong comment during hydration | Low | Sequential cursor ordering guarantees the end marker is the next comment after branch content. Nested conditionals claim their own end markers first, advancing the cursor past them. Debug-mode assertion validates `data === '/conditional'`. If end marker is entirely missing (stale SSR), `needsCsrFallback` flag triggers clean CSR rebuild. |
| Signal fires before fragment is attached to DOM | Low | `insertContentBefore` guards `endMarker.parentNode` with a null check and no-ops if not attached. In practice, synchronous signal updates before DOM attachment don't occur in normal rendering flows, but the guard prevents a crash in edge cases. |
| `__child` wrapping interaction | Low | `__conditional` typically runs inside `__child`'s effect. During hydration, `__child` clears SSR content and re-renders via CSR. The inner `__conditional` runs CSR path, producing a fragment with markers. `__child` inserts this as managed siblings. Tested by existing E2E hydration tests. |
| Return value change in hydration path | Medium | Currently returns wrapper span; new code returns the anchor. Since `__conditional` is typically wrapped by `__child`, the return value is consumed by `__child`'s `resolveAndInsertAfter`, not by `__append` directly. Verified by existing hydration test suite. |
| SSR HTML size regression from end markers | None | `<!--/conditional-->` is 20 bytes. A `<span style="display: contents">` is 33 bytes opening + 7 bytes closing = 40 bytes. Net reduction. |
| Existing tests that assert on span wrapper behavior | Low | Known breakage — tests listed in Phase 2 and Phase 3. All are internal test files, not public API. |

---

## Key Files

| File | Phase | Change |
|---|---|---|
| `packages/ui/src/dom/conditional.ts` | 1, 2 | Core: replace span wrappers with end markers |
| `packages/ui/src/dom/__tests__/conditional.test.ts` | 1 | Update CSR test assertions |
| `packages/ui/src/dom/__tests__/hydration-conditional.test.ts` | 2 | Update hydration test fixtures + assertions |
| `packages/ui/src/hydrate/hydration-context.ts` | 2, 3 | Update `findUnclaimedNodes`, doc comments |
| `packages/ui/src/__tests__/hydration-e2e.test.ts` | 3 | Update E2E test fixtures |
| `packages/ui/src/dom/__tests__/ssr-domeffect.test.ts` | 3 | Verify SSR output includes end markers |
| `packages/ui/src/hydrate/ARCHITECTURE.md` | 3 | Update doc references |
| `packages/ui-server/src/__tests__/fast-refresh-dom-state.test.ts` | 3 | Update conditional output fixtures to comment markers |
| `packages/ui/src/dom/element.ts` | 3 | Update `__child` clearing loop comment to acknowledge end markers |
