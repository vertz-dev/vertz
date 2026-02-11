# ui-013: @vertz/primitives — Headless Components

- **Status:** 🔴 Todo
- **Assigned:** nora
- **Phase:** Phase 7 — @vertz/primitives
- **Estimate:** 80 hours
- **Blocked by:** ui-001, ui-004
- **Blocks:** ui-014
- **PR:** —

## Description

Implement the `@vertz/primitives` package: accessible, unstyled, behavior-only components following WAI-ARIA patterns. Uses the compound component pattern (Root, Trigger, Content, Item) with keyboard navigation and focus management.

Depends on Phase 1 (reactivity) and Phase 2 (CSS framework, for styled consumers/tests).

### Components to implement (priority order)

1. **Button** — ARIA button role
2. **Dialog** — modal/non-modal, focus trap, Escape to close
3. **Select** — listbox pattern, keyboard navigation (Arrow keys, Enter, Escape)
4. **Menu** — menubar/menuitem pattern
5. **Tabs** — tablist/tabpanel with roving tabindex
6. **Accordion** — expandable sections
7. **Tooltip** — accessible tooltip with delay
8. **Popover** — positioned popover with positioning logic
9. **Toast** — live region announcements (`aria-live="polite"`)
10. **Combobox** — autocomplete/typeahead
11. **Switch** — toggle switch
12. **Checkbox** — checkbox with indeterminate state
13. **Radio** — RadioGroup + RadioItem
14. **Slider** — range slider
15. **Progress** — progress indicator

### What to implement per component

- WAI-ARIA role and state attributes
- Keyboard navigation (arrow keys, Enter, Escape, Tab, Home/End)
- Focus management (trap for modals, roving for lists)
- Compound component pattern (Root, Trigger, Content, Item)
- Support for controlled and uncontrolled usage
- `data-state` attributes for CSS styling hooks

### Shared utilities to create

- `packages/primitives/src/utils/keyboard.ts` — Key event handlers, arrow key navigation
- `packages/primitives/src/utils/focus.ts` — Focus trap, focus return, roving tabindex
- `packages/primitives/src/utils/aria.ts` — ARIA ID generation, state management
- `packages/primitives/src/utils/id.ts` — Deterministic unique IDs

### Files to create

Entire `packages/primitives/` directory:
- `packages/primitives/src/index.ts`
- `packages/primitives/src/utils/keyboard.ts`
- `packages/primitives/src/utils/focus.ts`
- `packages/primitives/src/utils/aria.ts`
- `packages/primitives/src/utils/id.ts`
- `packages/primitives/src/button/button.ts` + `__tests__/button.test.ts`
- `packages/primitives/src/dialog/dialog.ts` + `__tests__/dialog.test.ts`
- `packages/primitives/src/select/select.ts` + `__tests__/select.test.ts`
- `packages/primitives/src/menu/menu.ts` + `__tests__/menu.test.ts`
- `packages/primitives/src/tabs/tabs.ts` + `__tests__/tabs.test.ts`
- `packages/primitives/src/accordion/accordion.ts` + `__tests__/accordion.test.ts`
- `packages/primitives/src/tooltip/tooltip.ts` + `__tests__/tooltip.test.ts`
- `packages/primitives/src/popover/popover.ts` + `__tests__/popover.test.ts`
- `packages/primitives/src/toast/toast.ts` + `__tests__/toast.test.ts`
- `packages/primitives/src/combobox/combobox.ts` + `__tests__/combobox.test.ts`
- `packages/primitives/src/switch/switch.ts` + `__tests__/switch.test.ts`
- `packages/primitives/src/checkbox/checkbox.ts` + `__tests__/checkbox.test.ts`
- `packages/primitives/src/radio/radio.ts` + `__tests__/radio.test.ts`
- `packages/primitives/src/slider/slider.ts` + `__tests__/slider.test.ts`
- `packages/primitives/src/progress/progress.ts` + `__tests__/progress.test.ts`

### References

- [Implementation Plan — Phase 7](../../plans/ui-implementation.md#phase-7-vertzprimitives----headless-components)
- [UI Design Doc](../../plans/ui-design.md)

## Acceptance Criteria

- [ ] All 15 primitives implemented with WAI-ARIA compliance
- [ ] Shared utilities (keyboard, focus, aria, id) implemented and shared across components
- [ ] Each component uses compound component pattern (Root, Trigger, Content, Item as applicable)
- [ ] Each component supports controlled and uncontrolled usage
- [ ] Each component has `data-state` attributes for CSS styling hooks
- [ ] Dialog traps focus and closes on Escape
- [ ] Select supports full keyboard navigation (Arrow keys, Enter, Escape)
- [ ] Tabs use correct ARIA roles (tablist, tab, tabpanel) and arrow key navigation
- [ ] Toast uses `aria-live` for screen reader announcements
- [ ] All primitives pass WAI-ARIA compliance tests
- [ ] Integration tests pass (see below)

### Integration Tests

```typescript
// IT-7-1: Dialog traps focus and closes on Escape
test('Dialog traps focus and closes on Escape', async () => {
  function App() {
    let open = false;
    return (
      <div>
        <button onClick={() => open = true}>Open</button>
        <Dialog.Root open={open} onOpenChange={(v) => open = v}>
          <Dialog.Content>
            <input data-testid="first" />
            <button data-testid="close">Close</button>
          </Dialog.Content>
        </Dialog.Root>
      </div>
    );
  }

  const { findByText, click, press, queryByTestId } = renderTest(<App />);
  await click(findByText('Open'));
  expect(queryByTestId('first')).toBeTruthy();

  // Focus should be trapped inside dialog
  expect(document.activeElement).toBe(queryByTestId('first'));

  // Escape closes
  await press('Escape');
  expect(queryByTestId('first')).toBeNull();
});

// IT-7-2: Select supports keyboard navigation (Arrow keys, Enter, Escape)
test('Select keyboard navigation', async () => {
  function App() {
    let value = '';
    return (
      <Select.Root value={value} onValueChange={(v) => value = v}>
        <Select.Trigger>Pick one</Select.Trigger>
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
          <Select.Item value="b">Beta</Select.Item>
          <Select.Item value="c">Gamma</Select.Item>
        </Select.Content>
      </Select.Root>
    );
  }

  const { findByText, click, press } = renderTest(<App />);
  await click(findByText('Pick one'));
  await press('ArrowDown'); // Focus Alpha
  await press('ArrowDown'); // Focus Beta
  await press('Enter'); // Select Beta
  expect(findByText('Beta')).toBeTruthy(); // Trigger shows selected value
});

// IT-7-3: Tabs use correct ARIA roles and keyboard navigation
test('Tabs have correct ARIA roles and arrow key navigation', async () => {
  function App() {
    return (
      <Tabs.Root defaultValue="tab1">
        <Tabs.List>
          <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
          <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab1">Content 1</Tabs.Content>
        <Tabs.Content value="tab2">Content 2</Tabs.Content>
      </Tabs.Root>
    );
  }

  const { findByText, press, container } = renderTest(<App />);
  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist).toBeTruthy();

  const tabs = container.querySelectorAll('[role="tab"]');
  expect(tabs).toHaveLength(2);

  // Arrow right moves to next tab
  tabs[0].focus();
  await press('ArrowRight');
  expect(document.activeElement).toBe(tabs[1]);
  expect(findByText('Content 2')).toBeTruthy();
});

// IT-7-4: Every component passes WAI-ARIA compliance
test('all primitives have correct ARIA attributes', () => {
  // Button
  const { container: btnContainer } = renderTest(<Button.Root>Click</Button.Root>);
  expect(btnContainer.querySelector('[role="button"]')).toBeTruthy();

  // Dialog
  // ... (each component validated for ARIA compliance)
});

// IT-7-5: Toast uses aria-live for screen reader announcements
test('Toast announces via aria-live region', () => {
  const { container } = renderTest(<Toast.Provider><Toast.Root>Saved!</Toast.Root></Toast.Provider>);
  expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  expect(container.textContent).toContain('Saved!');
});
```

## Progress

- 2026-02-10: Ticket created from implementation plan.
