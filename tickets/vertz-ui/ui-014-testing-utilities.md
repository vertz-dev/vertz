# ui-014: Testing Utilities

- **Status:** 🔴 Todo
- **Assigned:** ava
- **Phase:** Phase 8A — Testing Utilities
- **Estimate:** 40 hours
- **Blocked by:** ui-001, ui-002, ui-003, ui-008, ui-009, ui-010, ui-011, ui-012
- **Blocks:** none
- **PR:** —

## Description

Implement the test utilities for `@vertz/ui` exported from `@vertz/ui/test`: `renderTest()`, query utilities, interaction utilities, `createTestRouter()`, and form testing helpers. Also includes DevTools hooks and compiler error message quality audit.

This phase requires the full API surface (Phases 1-6) to be complete, as the testing utilities exercise all features.

### What to implement

- `renderTest()` with lightweight DOM implementation (happy-dom/jsdom)
- `findByText(text)`, `queryByText(text)`, `findByTestId(id)` query utilities
- `click(element)`, `type(selector, text)` interaction utilities
- `createTestRouter(routes, opts)` for route-level testing
- `fillForm(form, data)` and `submitForm(form)` for form testing
- DevTools signal dependency graph hook
- DevTools component tree inspection hook
- Compiler error message quality — all diagnostics are actionable and LLM-friendly

### Files to create

- `packages/ui/src/test/render-test.ts`
- `packages/ui/src/test/queries.ts`
- `packages/ui/src/test/interactions.ts`
- `packages/ui/src/test/test-router.ts`
- All corresponding `__tests__/` files

### References

- [Implementation Plan — Phase 8A](../../plans/ui-implementation.md#sub-phase-8a-testing-utilities-p8-1)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] `renderTest()` creates a component in a lightweight DOM and returns query/interaction utilities
- [ ] `findByText(text)` finds elements by text content
- [ ] `queryByText(text)` queries elements by text content (returns null if not found)
- [ ] `findByTestId(id)` finds elements by `data-testid` attribute
- [ ] `click(element)` simulates a click event
- [ ] `type(selector, text)` simulates typing into an input
- [ ] `createTestRouter(routes, opts)` creates a test router with mocked loaders
- [ ] `fillForm(form, data)` fills a form with data
- [ ] `submitForm(form)` simulates form submission
- [ ] DevTools signal dependency graph hook works
- [ ] DevTools component tree inspection hook works
- [ ] All compiler diagnostics are actionable with clear error messages
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-8A-1: renderTest creates component and provides query utilities
test('renderTest provides findByText and click', async () => {
  function Counter() {
    let count = 0;
    return (
      <div>
        <span>Count: {count}</span>
        <button onClick={() => count++}>+</button>
      </div>
    );
  }

  const { findByText, click } = renderTest(<Counter />);
  expect(findByText('Count: 0')).toBeTruthy();
  await click(findByText('+'));
  expect(findByText('Count: 1')).toBeTruthy();
});

// IT-8A-2: createTestRouter renders routes with mocked loaders
test('createTestRouter renders route with loader data', async () => {
  server.use(mockHandlers.users.list(() => [{ id: '1', name: 'Alice' }]));

  const router = createTestRouter(routes, { initialPath: '/users' });
  const { findByText } = renderTest(router.component);
  await waitFor(() => expect(findByText('Alice')).toBeTruthy());
});

// IT-8A-3: fillForm and submitForm simulate form interaction
test('fillForm + submitForm exercise the full form lifecycle', async () => {
  server.use(mockHandlers.users.create(() => ({ id: '1', name: 'Alice', email: 'a@t.com' })));

  const { container } = renderTest(<CreateUser />);
  await fillForm(container.querySelector('form')!, { name: 'Alice', email: 'a@t.com' });
  await submitForm(container.querySelector('form')!);
  // Assert submission was successful
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
