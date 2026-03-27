# AOT Compiler Optimizations

**Status:** Draft
**Issue:** #1951 (trigger) + comprehensive AOT audit
**Author:** viniciusdacal + claude
**Date:** 2026-03-27

## Problem Statement

The AOT SSR compiler is **correct but over-conservative**. It falls back to `runtime-fallback` or `__esc()` in cases that are fully compilable. This means many real-world page components don't get AOT performance — the runtime catches the crash and silently falls back to single-pass DOM SSR.

The original trigger (#1951) is one instance of a broader pattern: the AOT system treats anything it doesn't explicitly handle as opaque, when it could instead preserve the original code within the generated function.

## Core Insight

AOT SSR functions are **one-shot string builders**. There's no reactivity, no DOM, no hydration state during rendering. This means:

1. **Derived variables are just intermediate computations** — `const sellerMap = new Map(data.sellers.map(...))` is a pure function of the data. Include the assignment in the preamble and reference it in the template.
2. **Map callbacks with variable declarations are just closures** — `items.map(item => { const x = item.name; return '<li>' + x + '</li>'; })` is valid JS. Preserve the block body instead of stripping it.
3. **If-else chains are ternary chains** — `if (a) return <A/>; else return <B/>;` is `a ? renderA : renderB`. The compiler already handles guard patterns; extending to general if-else is straightforward.
4. **`||` and `??` are conditional rendering patterns** — just like `&&`, they have well-defined SSR semantics.

The fix is NOT to add heuristic fallback detection. The fix is to **make the AOT compiler handle these patterns natively**.

## API Surface

No public API changes. This is an internal compiler optimization. Components that previously fell back to runtime will now get AOT-compiled. The output HTML is identical.

The only observable change: `AotComponentInfo.tier` shifts from `runtime-fallback` to `conditional` or `data-driven` for more components.

```ts
// Before: component classified as runtime-fallback, falls back to single-pass SSR
// After: component classified as conditional, gets AOT string-builder function

// Before: .map() with block body falls back to __esc()
// After: .map() with block body preserves declarations and generates optimized list rendering
```

## Manifesto Alignment

- **Principle 7: Performance is not optional** — AOT SSR is the performance path. Every component we fail to AOT-compile is a missed optimization. We should compile as many components as possible.
- **Principle 8: No ceilings** — The compiler shouldn't have artificial limitations. If a pattern is compilable, compile it.
- **Principle 4: Test what matters** — Each optimization has a clear failing test (component that should be AOT-eligible but isn't).

## Non-Goals

- **Cross-component AOT compilation** (recursive hole filling) — Components referenced as JSX children are deferred to runtime via the "holes" mechanism. Inlining them requires cross-file analysis. Out of scope.
- **Dynamic query key resolution** — Keys with computed expressions (`game-${slug.toLowerCase()}`) require runtime evaluation. Out of scope.
- **Partial AOT with missing data** — Rendering with incomplete query data requires schema knowledge. Out of scope.
- **AOT for layout components** — Layouts/Outlets have their own rendering lifecycle. Out of scope.

## Unknowns

- **Chained derived variables with alias dependencies:** When `const filtered = sellerMap.values()` references `sellerMap` which itself was rewritten, the replacement ordering must be correct. Resolution: emit preamble in source-order (addressed in Phase 1 spec).

## Implementation Plan

### Phase 1: Derived Variable Preamble (#1951 fix)

**Goal:** Include body-level derived variable assignments in the AOT function preamble instead of falling back to runtime.

**Supersedes:** This phase replaces the #1951 stopgap fix (`_hasUnresolvableDerivedVars` runtime-fallback classification). Instead of detecting derived vars and bailing, we include them in the AOT function.

**What changes:**
- In `_emitAotFunction()`, collect body-level variable declarations that aren't query vars, data aliases, useParams, or signal vars
- Extract their source text, apply the same query var and alias replacements that run on `stringExpr` (`data` → `__q0`, etc.), and emit them in the preamble
- **Preamble ordering:** Derived variables MUST be emitted in source-order (declaration order in the component body) to preserve reference correctness. A derived variable may reference another derived variable declared earlier.
- For non-query components (props-only), include derived variable assignments that reference props

**Replacement pass ordering:**
1. Extract derived variable initializer source text
2. Run the same `split().join()` and regex replacements on both preamble lines AND `stringExpr` (query var names, `.data`/`.loading`/`.error`, derived aliases)
3. Emit preamble lines in source-order, then `return stringExpr`

**Generated output (before):**
```js
// Component classified as runtime-fallback → no AOT function generated
// Falls back to ssrRenderSinglePass() at runtime
```

**Generated output (after):**
```js
export function __ssr_CardDetailPage(data, ctx) {
  const __q0 = ctx.getData(`card-${ctx.params.id}`);
  const sellerMap = new Map(__q0.sellers.map((s) => [s.id, s]));
  return '<!--conditional-->' + (!__q0 ? '<div>Loading...</div>' : '<div>' +
    '<!--list-->' + __q0.listings.slice(0, 20).map((listing) => {
      const seller = sellerMap.get(listing.sellerId);
      return '<tr><td>' + __esc(seller?.name || 'Unknown') + '</td></tr>';
    }).join('') + '<!--/list-->' +
  '</div>') + '<!--/conditional-->';
}
```

**Acceptance criteria:**
```ts
describe('Given a component with derived variables from query data (#1951)', () => {
  describe('When a derived variable is computed from query data', () => {
    it('Then classifies the component as conditional (AOT-eligible)', () => {})
    it('Then includes the derived variable assignment in the AOT function preamble', () => {})
    it('Then replaces query data references in the derived variable initializer', () => {})
    it('Then the generated AOT function produces correct HTML at runtime', () => {})
  })
  describe('When a derived variable references another derived variable', () => {
    it('Then emits both in source-order so references resolve correctly', () => {})
  })
  describe('When a non-query component has intermediate derived variables', () => {
    it('Then includes derived variable assignments referencing props', () => {})
  })
  describe('When a simple query data alias is used', () => {
    it('Then still uses the existing alias replacement (no preamble entry)', () => {})
  })
})
```

### Phase 2: Map Callback Block Body Preservation

**Goal:** Preserve variable declarations in `.map()` callback block bodies instead of falling back to `__esc()`.

**What changes:**
- In `_mapCallToString()`, when the block body has non-return statements, emit the full block body as a function instead of falling back
- Extract non-return statements as raw source text (verbatim), convert ONLY the JSX in the return statement to string concatenation, and combine into a block-body arrow function
- **Query var replacement propagation:** The map callback text becomes part of `stringExpr`. The existing global replacement pass in `_emitAotFunction` (lines 277-290) runs on the full `stringExpr`, so alias references inside map callbacks (like `data.someField`) are automatically replaced. No special handling needed.

**Generated output (before):**
```js
// Falls back to __esc(), losing list markers and optimization
__esc(listings.map((listing) => {
  const seller = sellerMap.get(listing.sellerId);
  return <tr><td>{seller?.name}</td></tr>;
}))
```

**Generated output (after):**
```js
'<!--list-->' + listings.map((listing) => {
  const seller = sellerMap.get(listing.sellerId);
  return '<tr><td>' + __esc(seller?.name) + '</td></tr>';
}).join('') + '<!--/list-->'
```

**Acceptance criteria:**
```ts
describe('Given a .map() callback with variable declarations', () => {
  describe('When the block body has const declarations before the return', () => {
    it('Then preserves the declarations in the generated callback', () => {})
    it('Then converts JSX in the return to string concatenation', () => {})
    it('Then wraps with list markers', () => {})
    it('Then produces correct HTML at runtime', () => {})
  })
  describe('When the block body has multiple variable declarations', () => {
    it('Then preserves all declarations in order', () => {})
  })
})
```

### Phase 3: If-Else Chain Flattening

**Goal:** Compile if-else chains and multi-path returns into ternary chains instead of falling back to runtime.

**What changes:**

The current `_analyzeGuardPattern()` has an invariant: all returns except the last must be inside if-statements, and the last return must NOT be inside an if-statement (line 653-654). This rejects if-else patterns where both returns are inside if-statements.

**Approach:** Add a separate detection path BEFORE the guard analysis. When `returnsWithJsx.length > 1` and guard analysis returns null:

1. **If-else detection:** Check if ALL returns are accounted for by if-then/else branches (no trailing unconditional return). If so, convert to ternary: `if (cond) return <A/>; else return <B/>;` → `cond ? renderA : renderB`.
2. **If-else-if chains:** `if (c1) return <A/>; else if (c2) return <B/>; else return <C/>;` → `c1 ? renderA : c2 ? renderB : renderC`.
3. The existing guard pattern path (`if (c) return <Guard/>; return <Main/>;`) continues to work unchanged.

This keeps the guard pattern analysis clean and adds if-else as a peer analysis path.

- Detect `if (cond) return <A/>; else return <B/>;` and `if (c1) return <A/>; if (c2) return <B/>; return <C/>;`
- Flatten to nested ternaries: `c1 ? renderA : c2 ? renderB : renderC`

**Generated output (before):**
```js
// runtime-fallback — multiple returns not in guard pattern
```

**Generated output (after):**
```js
'<!--conditional-->' + (cond ? '<div>Case A</div>' : '<div>Case B</div>') + '<!--/conditional-->'
```

**Acceptance criteria:**
```ts
describe('Given a component with if-else returns', () => {
  describe('When both branches return JSX', () => {
    it('Then classifies as conditional (not runtime-fallback)', () => {})
    it('Then generates a ternary with both branches', () => {})
  })
  describe('When there are multiple if-return chains', () => {
    it('Then generates nested ternaries', () => {})
  })
  describe('When an if-else has nested ifs', () => {
    it('Then falls back to runtime-fallback (unsafe to flatten)', () => {})
  })
})
```

### Phase 4: `||` and `??` Binary Operator Support

**Goal:** Handle `||` and `??` operators in JSX expressions like `&&` is already handled.

**What changes:**
- In `_binaryToString()`, add cases for `||` and `??` — but ONLY when the right operand contains JSX
- `expr || <JSX />` → `expr ? __esc(expr) : renderJsx` (show escaped expr when truthy, JSX fallback when falsy)
- `expr ?? <JSX />` → `expr != null ? __esc(expr) : renderJsx` (show escaped expr when non-nullish, JSX fallback when nullish)
- When the right operand does NOT contain JSX (e.g., `value || 'default'`), continue using `__esc()` wrapping — the existing behavior is correct for those cases

**Acceptance criteria:**
```ts
describe('Given JSX with || operator', () => {
  describe('When right operand is JSX', () => {
    it('Then generates conditional: truthy shows escaped value, falsy shows JSX', () => {})
  })
  describe('When right operand is NOT JSX (e.g., string literal)', () => {
    it('Then falls back to __esc() wrapping (existing behavior)', () => {})
  })
})
describe('Given JSX with ?? operator', () => {
  describe('When right operand is JSX', () => {
    it('Then generates conditional: non-nullish shows escaped value, nullish shows JSX', () => {})
  })
})
```

## Type Flow Map

No new generic types. All changes are internal to `aot-string-transformer.ts` — string manipulation of generated code.

The existing `AotComponentInfo` type gains no new fields. The only type-level change is that more components will have `tier: 'conditional'` instead of `tier: 'runtime-fallback'`.

## E2E Acceptance Test

```ts
// Developer writes page components with derived variables, map callbacks
// with block bodies, if-else returns, and || fallbacks. All should be AOT-compiled.

describe('E2E: AOT compiler handles real-world page patterns', () => {
  // Phase 1 + Phase 2: Derived variables + map block bodies
  it('compiles CardDetailPage with sellerMap derived variable to AOT', () => {
    const result = compileForSSRAot(`
      import { query, useParams } from '@vertz/ui';
      export default function CardDetailPage() {
        const { id } = useParams<'/cards/:id'>();
        const cardQuery = query(async () => ({
          sellers: [{ id: '1', name: 'Alice' }],
          listings: [{ id: 'L1', sellerId: '1' }],
        }), { key: \`card-\${id}\` });
        const data = cardQuery.data;
        if (!data) return <div>Loading...</div>;
        const sellerMap = new Map(data.sellers.map((s) => [s.id, s]));
        return (
          <div>
            {data.listings.map((listing) => {
              const seller = sellerMap.get(listing.sellerId);
              return <tr key={listing.id}><td>{seller?.name || 'Unknown'}</td></tr>;
            })}
          </div>
        );
      }
    `);

    // Must be AOT-eligible, not runtime-fallback
    expect(result.components[0].tier).not.toBe('runtime-fallback');

    // Generated function must work at runtime
    const html = evalAot(result.code, '__ssr_CardDetailPage', {
      __ctx: createMockCtx({
        'card-42': {
          sellers: [{ id: '1', name: 'Alice' }],
          listings: [{ id: 'L1', sellerId: '1' }],
        }
      }),
    });
    expect(html).toContain('Alice');
    expect(html).not.toContain('Unknown');
  });

  // Phase 3: If-else flattening
  it('compiles if-else returns to ternary', () => {
    const result = compileForSSRAot(`
      export default function StatusPage({ status }: { status: string }) {
        if (status === 'error') return <div>Error occurred</div>;
        else return <div>All good</div>;
      }
    `);
    expect(result.components[0].tier).toBe('conditional');
    const html = evalAot(result.code, '__ssr_StatusPage', {
      __props: { status: 'error' }, status: 'error',
    });
    expect(html).toContain('Error occurred');
  });

  // Phase 4: || with JSX fallback
  it('compiles || with JSX fallback', () => {
    const result = compileForSSRAot(`
      export default function NameDisplay({ name }: { name: string | null }) {
        return <div>{name || <span>Anonymous</span>}</div>;
      }
    `);
    expect(result.components[0].tier).toBe('conditional');
    const htmlWithName = evalAot(result.code, '__ssr_NameDisplay', {
      __props: { name: 'Alice' }, name: 'Alice',
    });
    expect(htmlWithName).toContain('Alice');
    expect(htmlWithName).not.toContain('Anonymous');
  });
});
```

## Dependencies

- Phase 2 depends on Phase 1 (derived vars in preamble enable map callback vars to reference them)
- Phases 3 and 4 are independent of each other and of Phases 1-2

## Risks

- **False positive AOT compilation**: A component gets AOT-compiled but the generated function crashes at runtime. Mitigated by: (a) the existing try-catch fallback in `ssr-aot-pipeline.ts`, and (b) comprehensive runtime evaluation tests in the test suite.
- **Query var replacement in derived variable initializers**: The existing regex-based replacement (`stringExpr.split(...).join(...)`) must also run on preamble statements. Risk of over-replacement mitigated by the negative lookbehind already in place.
