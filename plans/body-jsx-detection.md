# Design: Ban JSX Outside Return Tree (#1318)

## Problem

JSX expressions in a component body (outside the return statement) compile to `__element()`, which during hydration claims SSR nodes from the global cursor. This causes the entire hydration tree to collapse — all subsequent nodes lose their event listeners and reactivity.

```tsx
function App() {
  const dialogContainer = (<div />) as HTMLDivElement; // steals SSR nodes
  return <ThemeProvider>...</ThemeProvider>;
}
```

There is no legitimate case for body-level JSX. Every use case has a better alternative:
- Dialog container → `document.createElement('div')`
- Prebuilt element → move inline into the return tree
- Lazy content → thunk: `() => <div>Loading</div>`

## API Surface

This feature introduces no new public APIs. It adds:

1. **Compiler diagnostic** (`warning` severity, code: `jsx-outside-tree`) — warning rather than error because `@vertz/ui-primitives` legitimately uses body JSX for imperative DOM construction
2. **Biome lint rule** (`no-body-jsx.grit`, `warn` severity)

### Compiler Diagnostic Output

```typescript
import { compile } from '@vertz/ui-compiler';

const result = compile(`
  function App() {
    const el = <div />;
    return <div>ok</div>;
  }
`);

// result.diagnostics[0]:
// {
//   code: 'jsx-outside-tree',
//   severity: 'error',
//   message: 'JSX outside the return tree creates DOM elements eagerly during hydration, stealing SSR nodes from the render tree. Move this JSX into the return expression, or use document.createElement() for imperative containers.',
//   line: 3,
//   column: 15,
//   fix: 'For imperative containers, use document.createElement(\'div\') (returns typed HTMLDivElement, no cast needed). For rendered content, move the JSX into the return expression.',
// }
```

### Detection Rules

| Location | Allowed? | Rationale |
|----------|----------|-----------|
| Return expression | Yes | Part of the render tree |
| Inside arrow/function in return tree (e.g., `fallback={() => <div/>}`) | Yes | Thunks are deferred, execute within tree context |
| Event handler in JSX (`onClick={() => <X/>}`) | Yes | Runs after hydration |
| Arrow/function expression in body (callback, effect) | Yes | Deferred execution, runs after mount |
| `const el = <div />;` in body | **No** | Creates element before tree context exists |
| `someFunction(<div />)` in body | **No** | Same problem — eager JSX creation |
| `const el = condition ? <A/> : <B/>` in body | **No** | Both branches create elements eagerly |

The key distinction: **JSX that is an immediate child of a statement in the component body** (not wrapped in an arrow/function) is flagged. JSX inside any function boundary (arrow, function expression, function declaration, method) is allowed because it's deferred.

### Biome Rule

```grit
// Ban JSX expressions outside the return tree in component functions.
// Body-level JSX creates elements before the render tree context exists,
// breaking hydration by claiming SSR nodes out of order.
// Use document.createElement() for imperative containers.
```

Defense-in-depth only. The compiler error is the primary defense. The lint rule catches it earlier in the dev loop (editor integration).

## Manifesto Alignment

- **"If it builds, it works"** — This is a compile-time error that prevents a class of hydration bugs that are invisible until runtime. The compiler catches it before the code ever runs.
- **"One way to do things"** — JSX = rendered tree. No ambiguity about what JSX means in Vertz components. `document.createElement()` for imperative containers.
- **"AI agents are first-class users"** — Clear error message with concrete alternatives. An LLM can read the diagnostic and fix it on the first try.
- **"Compile-time over runtime"** — Eliminates a runtime failure class entirely at compile time.

### What was rejected

- **Runtime detection** — Checking at runtime whether `__element()` is called outside a tree context adds overhead and complexity. The compiler knows the structure statically.
- **Special `createElement()` function** — Adding a Vertz-specific imperative element creator just to support body JSX. This would be `document.createElement()` with extra steps.
- **Error severity** — Initially designed as error, but `@vertz/ui-primitives` legitimately uses body JSX for imperative DOM builders (e.g., `TabsRoot`). Warning severity avoids breaking the build while still surfacing the hydration risk in standard components.

## Non-Goals

- **Cross-file analysis** — The compiler is per-file, single-pass. We don't analyze whether a body JSX element eventually gets inserted into the tree via a different code path. A helper function that returns JSX and is called eagerly in the body won't be caught.
- **Autofix** — The compiler suggests alternatives but doesn't auto-transform `<div />` to `document.createElement('div')` because the intent is ambiguous (might need to move into return tree instead).
- **Runtime guard** — No runtime `__element()` changes. The compiler error is sufficient.
- **IIFE detection** — `(() => <div/>)()` in the body executes immediately (same problem), but the JSX is inside an arrow function boundary. Detecting IIFEs would add complexity for an extremely rare pattern. Accepted as a known false negative.

## Unknowns

None identified. The detection algorithm walks the component body, finds JSX that is not inside a return statement and not inside a nested function boundary, and follows the same pattern as `SSRSafetyDiagnostics`.

## POC Results

N/A — The approach is a direct extension of the existing `SSRSafetyDiagnostics` pattern, which is proven in production.

## Type Flow Map

N/A — This feature adds diagnostics only, no generic type parameters.

## E2E Acceptance Test

```typescript
import { describe, expect, it } from 'bun:test';
import { compile } from '@vertz/ui-compiler';

describe('Feature: Ban JSX outside return tree', () => {
  // ── SHOULD FLAG ──────────────────────────────────────────────────

  describe('Given a component with JSX in a variable initializer', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits jsx-outside-tree error with line/column', () => {
        const result = compile(`
          function App() {
            const el = <div />;
            return <div>ok</div>;
          }
        `);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].code).toBe('jsx-outside-tree');
        expect(result.diagnostics[0].severity).toBe('error');
        expect(result.diagnostics[0].line).toBeGreaterThan(0);
      });
    });
  });

  describe('Given a component with JSX as a function argument in body', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits jsx-outside-tree error', () => {
        const result = compile(`
          function App() {
            someFunction(<div />);
            return <div>ok</div>;
          }
        `);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].code).toBe('jsx-outside-tree');
      });
    });
  });

  describe('Given a component with JSX in a ternary in body', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits jsx-outside-tree error for each JSX expression', () => {
        const result = compile(`
          function App() {
            const el = condition ? <A /> : <B />;
            return <div>ok</div>;
          }
        `);
        expect(result.diagnostics.filter(d => d.code === 'jsx-outside-tree').length).toBe(2);
      });
    });
  });

  describe('Given a component with JSX in an if block in body', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits jsx-outside-tree error', () => {
        const result = compile(`
          function App() {
            if (condition) {
              const el = <div />;
              container.appendChild(el);
            }
            return <div>ok</div>;
          }
        `);
        expect(result.diagnostics.filter(d => d.code === 'jsx-outside-tree')).toHaveLength(1);
      });
    });
  });

  describe('Given a component with a bare JSX expression statement in body', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits jsx-outside-tree error', () => {
        const result = compile(`
          function App() {
            <div />;
            return <div>ok</div>;
          }
        `);
        expect(result.diagnostics.filter(d => d.code === 'jsx-outside-tree')).toHaveLength(1);
      });
    });
  });

  describe('Given a component with JSX in as-cast in body (motivating example)', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits jsx-outside-tree error', () => {
        const result = compile(`
          function App() {
            const dialogContainer = (<div />) as HTMLDivElement;
            return <div>ok</div>;
          }
        `);
        expect(result.diagnostics.filter(d => d.code === 'jsx-outside-tree')).toHaveLength(1);
      });
    });
  });

  // ── SHOULD NOT FLAG ──────────────────────────────────────────────

  describe('Given a component with JSX only in the return statement', () => {
    describe('When the compiler processes the file', () => {
      it('Then emits no jsx-outside-tree diagnostics', () => {
        const result = compile(`
          function App() {
            let count = 0;
            return <div>{count}</div>;
          }
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(0);
      });
    });
  });

  describe('Given a component with JSX inside an arrow function in body', () => {
    describe('When the compiler processes the file', () => {
      it('Then does NOT flag (deferred execution)', () => {
        const result = compile(`
          function App() {
            const fallback = () => <div>Loading</div>;
            return <div>{fallback}</div>;
          }
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(0);
      });
    });
  });

  describe('Given a component with JSX inside an event handler in JSX', () => {
    describe('When the compiler processes the file', () => {
      it('Then does NOT flag', () => {
        const result = compile(`
          function App() {
            return <button onClick={() => { const x = <div />; }}>ok</button>;
          }
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(0);
      });
    });
  });

  describe('Given a component with JSX props containing JSX in return tree', () => {
    describe('When the compiler processes the file', () => {
      it('Then does NOT flag (part of the render tree)', () => {
        const result = compile(`
          function App() {
            return <Layout header={<Header />} footer={<Footer />} />;
          }
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(0);
      });
    });
  });

  describe('Given a component with JSX inside a function declaration in body', () => {
    describe('When the compiler processes the file', () => {
      it('Then does NOT flag (deferred execution)', () => {
        const result = compile(`
          function App() {
            function renderItem() { return <div>item</div>; }
            return <div>{renderItem()}</div>;
          }
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(0);
      });
    });
  });

  describe('Given an arrow expression-body component', () => {
    describe('When the compiler processes the file', () => {
      it('Then does NOT flag (expression IS the return value)', () => {
        const result = compile(`
          const App = () => <div>ok</div>;
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(0);
      });
    });
  });

  describe('Given multiple components in one file', () => {
    describe('When one has body JSX and the other does not', () => {
      it('Then only the component with body JSX gets flagged', () => {
        const result = compile(`
          function Good() {
            return <div>ok</div>;
          }
          function Bad() {
            const el = <div />;
            return <div>ok</div>;
          }
        `);
        const bodyJsxDiags = result.diagnostics.filter(d => d.code === 'jsx-outside-tree');
        expect(bodyJsxDiags).toHaveLength(1);
      });
    });
  });

  // ── BIOME LINT RULE ──────────────────────────────────────────────

  // The Biome rule `no-body-jsx` is a secondary guard (warn severity).
  // It's tested via `bunx biome check` on fixture files.
});
```

## Implementation Plan

### Phase 1: Compiler Diagnostic

**Deliverable:** `BodyJsxDiagnostics` class in `packages/ui-compiler/src/diagnostics/` that detects JSX outside the return tree and emits `jsx-outside-tree` errors.

**Approach:** Follow the exact same pattern as `SSRSafetyDiagnostics`:
1. Walk the component body node using `forEachDescendant`
2. Find all JSX nodes (JsxElement, JsxSelfClosingElement, JsxFragment)
3. For each JSX node, check TWO conditions:
   - `isInReturnStatement(node, bodyNode)` — walk parent chain looking for `ReturnStatement`
   - `isInNestedFunction(node, bodyNode)` — reuse from `ssr-safety-diagnostics.ts` (checks ArrowFunction, FunctionExpression, FunctionDeclaration, MethodDeclaration, Constructor, GetAccessor, SetAccessor)
4. If neither → emit diagnostic

**Important:** Both checks are required. `isInNestedFunction` alone would false-positive on JSX in the return statement (since the return is a direct child of the body Block, not inside a nested function). Extract `isInNestedFunction` to a shared utility.

**Note:** Arrow expression-body components (e.g., `const App = () => <div/>`) have no `Block` body, so `findBodyNode()` returns `null` and the diagnostic returns `[]`. This is correct — the expression IS the return value, so there's no "body" to contain non-return JSX.

**Integration:** Wire into `compiler.ts` alongside existing diagnostics (step 11).

**Acceptance Criteria:**
- `const el = <div />;` in body → error
- `someFunction(<div />)` in body → error
- `condition ? <A/> : <B/>` in body → error for each
- `(<div />) as HTMLDivElement` in body → error
- JSX in `if` block in body → error
- Bare `<div />;` expression statement in body → error
- JSX in return statement → no error
- JSX in arrow function in body → no error
- JSX in function declaration in body → no error
- JSX in event handler → no error
- JSX as props in return tree → no error
- Arrow expression-body component → no error, no crash
- Multiple components in one file → only flagged component gets error
- Error message includes line, column, code, fix suggestion
- All existing tests still pass

### Phase 2: Biome Lint Rule

**Deliverable:** `biome-plugins/no-body-jsx.grit` registered in `biome.json`.

**Approach:** GritQL pattern matching the most common dangerous pattern: JSX in a `const`/`let` variable initializer that is not inside an arrow function or return statement. This is a best-effort heuristic — the compiler error is the authoritative check.

**What the GritQL rule catches:**
- `const el = <div />;` — variable initializer with JSX
- `let el = <Comp />;` — variable initializer with JSX

**What the GritQL rule does NOT catch (compiler error covers these):**
- `someFunction(<div />)` — JSX as function argument
- Bare `<div />;` — expression statement
- JSX in `if` blocks

**Acceptance Criteria:**
- `const el = <div />;` triggers lint warning
- `return <div />` does not trigger
- `const fallback = () => <div/>` does not trigger (JSX inside arrow)
- Rule registered in `biome.json` plugins array
- `bunx biome check` runs clean on the codebase
- Rule message references compiler diagnostic code `jsx-outside-tree`
