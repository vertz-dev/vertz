# ui-003: Component Model

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 1C — Component Model
- **Estimate:** 32 hours
- **Blocked by:** ui-001, ui-002
- **Blocks:** ui-004, ui-005, ui-006, ui-007, ui-008, ui-009, ui-010, ui-011, ui-012, ui-013, ui-014, ui-015
- **PR:** —

## Description

Implement the component model for `@vertz/ui`: lifecycle hooks, context system, refs, error boundaries, Suspense, and children slots. These are the building blocks that all higher-level features (forms, queries, router, SSR) depend on.

### What to implement

- `onMount(callback)` — runs once when component mounts
- `onCleanup(fn)` — teardown on unmount or before re-run
- `watch(() => dep, callback)` — watches reactive dependency, runs on change
- `createContext<T>()` and `useContext(ctx)` with Provider component
- `ref<T>()` for DOM element access
- `ErrorBoundary` component with fallback and retry
- `Suspense` component for async boundaries
- Children slot mechanism
- Props destructuring diagnostic in compiler (extends ui-002)

### Files to create

- `packages/ui/src/component/lifecycle.ts`
- `packages/ui/src/component/context.ts`
- `packages/ui/src/component/refs.ts`
- `packages/ui/src/component/error-boundary.ts`
- `packages/ui/src/component/suspense.ts`
- `packages/ui/src/component/children.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 1C](../../plans/ui-implementation.md#sub-phase-1c-component-model-p1-3)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] `onMount(callback)` runs once when component mounts
- [ ] `onCleanup(fn)` runs on unmount or before re-run
- [ ] `watch(() => dep, callback)` re-runs callback when dependency changes
- [ ] `createContext<T>()` creates a context with default value
- [ ] `useContext(ctx)` retrieves value from nearest Provider
- [ ] Provider component injects context value into component tree
- [ ] `ref<T>()` provides access to DOM element after mount (`ref.current`)
- [ ] `ErrorBoundary` catches errors in children and renders fallback
- [ ] `ErrorBoundary` supports retry (re-renders children on retry click)
- [ ] `Suspense` displays fallback while async children resolve
- [ ] Children slot mechanism works correctly
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-1C-1: onMount runs once, onCleanup runs on unmount
test('onMount fires once, onCleanup fires on dispose', () => {
  let mounted = false;
  let cleaned = false;

  function Timer() {
    onMount(() => {
      mounted = true;
      onCleanup(() => { cleaned = true; });
    });
    return <div>Timer</div>;
  }

  const { unmount } = renderTest(<Timer />);
  expect(mounted).toBe(true);
  expect(cleaned).toBe(false);
  unmount();
  expect(cleaned).toBe(true);
});

// IT-1C-2: watch() re-runs callback when dependency changes
test('watch re-runs on dependency change', () => {
  const values: number[] = [];

  function Watcher() {
    let count = signal(0);
    watch(() => count.value, (val) => values.push(val));
    return <button onClick={() => count.value++}>+</button>;
  }

  const { findByText, click } = renderTest(<Watcher />);
  expect(values).toEqual([0]); // initial run
  click(findByText('+'));
  expect(values).toEqual([0, 1]);
});

// IT-1C-3: Context flows through component tree
test('context value flows from Provider to consumer', () => {
  const ThemeCtx = createContext<string>();

  function Consumer() {
    const theme = useContext(ThemeCtx);
    return <span>{theme}</span>;
  }

  const { findByText } = renderTest(
    <ThemeCtx.Provider value="dark">
      <Consumer />
    </ThemeCtx.Provider>
  );
  expect(findByText('dark')).toBeTruthy();
});

// IT-1C-4: ErrorBoundary catches errors and renders fallback with retry
test('ErrorBoundary catches and allows retry', () => {
  let shouldThrow = true;
  function Buggy() {
    if (shouldThrow) throw new Error('Boom');
    return <div>Recovered</div>;
  }

  const { findByText, click } = renderTest(
    <ErrorBoundary fallback={(err, retry) => (
      <div><span>{err.message}</span><button onClick={retry}>Retry</button></div>
    )}>
      <Buggy />
    </ErrorBoundary>
  );

  expect(findByText('Boom')).toBeTruthy();
  shouldThrow = false;
  click(findByText('Retry'));
  expect(findByText('Recovered')).toBeTruthy();
});

// IT-1C-5: ref provides access to DOM element after mount
test('ref.current is the DOM element after mount', () => {
  function Canvas() {
    const canvasRef = ref<HTMLCanvasElement>();
    let hasCtx = false;
    onMount(() => { hasCtx = !!canvasRef.current?.getContext; });
    return <canvas ref={canvasRef} />;
  }

  renderTest(<Canvas />);
  // If onMount ran, canvasRef.current was available
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
