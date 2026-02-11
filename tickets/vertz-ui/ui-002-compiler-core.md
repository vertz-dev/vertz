# ui-002: Compiler Core

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** Phase 1B — Compiler Core
- **Estimate:** 56 hours
- **Blocked by:** ui-001
- **Blocks:** ui-003, ui-004, ui-005, ui-006, ui-007, ui-008, ui-009, ui-010, ui-011, ui-012, ui-013, ui-014, ui-015
- **PR:** —

## Description

Implement the `@vertz/ui-compiler` package: the compiler's taint analysis, seven transform rules, mutation interception, diagnostics, and Vite plugin skeleton. Uses ts-morph for analysis and MagicString for source-map-preserving transforms.

### The seven compiler rules

1. `let` in component body + referenced in JSX -> **signal**
2. `const` whose initializer references a signal -> **computed**
3. `let { a, b } = reactiveExpr` -> **computed** per binding
4. JSX expression referencing signal/computed -> **subscription code**
5. JSX expression referencing only plain values -> **static code**
6. Prop referencing signal/computed -> **getter wrapper**
7. Prop referencing only plain values -> **plain value**

### Additional features

- Component function detection (functions returning JSX)
- Two-pass taint analysis for reactive variable detection
- Mutation interception: `.push()`, `.pop()`, `.splice()`, `.sort()`, `.reverse()`, property assignment, indexed assignment, `delete`, `Object.assign()` on `let` variables -> `peek()` + `notify()`
- Mutation diagnostics on `const` variables (warning with fix suggestion)
- Props destructuring diagnostic
- Source map generation (MagicString)
- Vite plugin integration skeleton

### Files to create

- `packages/ui-compiler/src/index.ts`
- `packages/ui-compiler/src/vite-plugin.ts`
- `packages/ui-compiler/src/analyzers/component-analyzer.ts`
- `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts`
- `packages/ui-compiler/src/analyzers/jsx-analyzer.ts`
- `packages/ui-compiler/src/analyzers/mutation-analyzer.ts`
- `packages/ui-compiler/src/transformers/signal-transformer.ts`
- `packages/ui-compiler/src/transformers/computed-transformer.ts`
- `packages/ui-compiler/src/transformers/jsx-transformer.ts`
- `packages/ui-compiler/src/transformers/prop-transformer.ts`
- `packages/ui-compiler/src/transformers/mutation-transformer.ts`
- `packages/ui-compiler/src/diagnostics/mutation-diagnostics.ts`
- `packages/ui-compiler/src/diagnostics/props-destructuring.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 1B](../../plans/ui-implementation.md#sub-phase-1b-compiler-core-p1-2)
- [UI Design Doc](../../plans/ui-design.md)
- [Reactive Mutations Compiler Design](../../../backstage/research/explorations/reactive-mutations-compiler-design.md)

## Acceptance Criteria

- [ ] Component function detection identifies functions returning JSX
- [ ] Two-pass taint analysis correctly classifies `let` as reactive, `const` as computed or static
- [ ] `let` in component body referenced in JSX transforms to `signal()`
- [ ] `const` depending on a signal transforms to `computed()`
- [ ] Destructured `let` bindings from reactive expressions become per-binding `computed()`
- [ ] JSX expressions referencing signals generate subscription code
- [ ] JSX expressions referencing only plain values generate static code (no subscriptions)
- [ ] Props referencing signals become getter wrappers
- [ ] Props referencing only plain values pass through as-is
- [ ] `.push()`, `.pop()`, `.splice()`, `.sort()`, `.reverse()` on `let` variables transform to `peek()` + `notify()`
- [ ] Property assignment, indexed assignment, `delete`, `Object.assign()` on `let` variables transform correctly
- [ ] Mutation on `const` variable emits diagnostic with fix suggestion (use `let`)
- [ ] Props destructuring in component signature emits diagnostic
- [ ] Source maps are generated via MagicString
- [ ] Vite plugin skeleton processes `.tsx` files
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-1B-1: Counter component compiles and works end-to-end
test('compiler transforms Counter component correctly', () => {
  const input = `
    function Counter() {
      let count = 0;
      return (
        <div>
          <p>Count: {count}</p>
          <button onClick={() => count++}>+</button>
        </div>
      );
    }
  `;
  const output = compile(input);

  // Output should contain signal import and signal declaration
  expect(output).toContain('__signal');
  expect(output).not.toContain('let count');

  // Executing the compiled output should produce working DOM
  const el = evalComponent(output);
  expect(el.querySelector('p').textContent).toBe('Count: 0');
  el.querySelector('button').click();
  expect(el.querySelector('p').textContent).toBe('Count: 1');
});

// IT-1B-2: Computed chain transforms correctly
test('compiler transforms const depending on let into computed', () => {
  const input = `
    function PriceDisplay() {
      let quantity = 1;
      const total = 10 * quantity;
      const formatted = '$' + total.toFixed(2);
      return <p>{formatted}</p>;
    }
  `;
  const output = compile(input);
  expect(output).toContain('computed');

  const el = evalComponent(output);
  expect(el.textContent).toBe('$10.00');
});

// IT-1B-3: Mutation on let array triggers reactivity
test('compiler transforms .push() on let array into peek+notify', () => {
  const input = `
    function TodoList() {
      let todos = [];
      const add = () => { todos.push({ id: 1, text: 'Test' }); };
      return (
        <div>
          <button onClick={add}>Add</button>
          <span>{todos.length}</span>
        </div>
      );
    }
  `;
  const output = compile(input);
  expect(output).toContain('peek');
  expect(output).toContain('notify');

  const el = evalComponent(output);
  expect(el.querySelector('span').textContent).toBe('0');
  el.querySelector('button').click();
  expect(el.querySelector('span').textContent).toBe('1');
});

// IT-1B-4: Static JSX produces no subscriptions
test('static JSX has no reactive subscriptions', () => {
  const input = `
    function Header() {
      const title = "Hello World";
      return <h1>{title}</h1>;
    }
  `;
  const output = compile(input);
  expect(output).not.toContain('__signal');
  expect(output).not.toContain('computed');
});

// IT-1B-5: Props are wrapped as getters for reactive values, plain for static
test('reactive props become getters, static props are plain', () => {
  const input = `
    function Parent() {
      let count = 0;
      const label = "Count";
      return <Child value={count} label={label} />;
    }
  `;
  const output = compile(input);
  // value should be a getter (reactive)
  expect(output).toMatch(/get value/);
  // label should be plain string
  expect(output).toContain('label: "Count"');
});

// IT-1B-6: Mutation diagnostic emitted for const variable
test('compiler emits diagnostic for .push() on const', () => {
  const input = `
    function Broken() {
      const items = [];
      items.push('x');
      return <div>{items.length}</div>;
    }
  `;
  const { diagnostics } = compileWithDiagnostics(input);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0].code).toBe('non-reactive-mutation');
  expect(diagnostics[0].message).toContain('will not trigger DOM updates');
  expect(diagnostics[0].fix).toContain('let');
});

// IT-1B-7: Vite plugin processes .tsx files
test('Vite plugin transforms .tsx files', async () => {
  const plugin = vertzPlugin();
  const result = await plugin.transform(counterSource, 'Counter.tsx');
  expect(result.code).toContain('__signal');
  expect(result.map).toBeDefined(); // source map present
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
