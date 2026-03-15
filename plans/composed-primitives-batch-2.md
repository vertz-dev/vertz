# Composed Primitives — Batch 2: Checkbox, Switch, RadioGroup, Slider, Toggle, Progress, Toast

## Problem

Seven themed primitives in `@vertz/theme-shadcn` still use imperative factory APIs. Developers must call them as functions, breaking the JSX consistency established by #1323:

```tsx
// Current — factory call, inconsistent with Dialog/Tabs/Select
const { checkbox } = components.primitives;
{checkbox({ defaultChecked: true })}

// Goal — JSX compound component, consistent with Dialog/Tabs/Select
const { Checkbox } = components.primitives;
<Checkbox defaultChecked onCheckedChange={(c) => console.log(c)} />
```

These 7 components were excluded from #1323 because their composed structure is simpler — most have zero or few sub-components. They follow the same `ComposedX` + `data-slot` + `withStyles()` pattern where applicable.

## API Surface

### Tier 1: Simple wrappers — fit `ComposedPrimitive` + `withStyles()`

These return `HTMLElement` and naturally satisfy the `ComposedPrimitive<K>` contract.

**Checkbox** — wraps `Checkbox.Root`, composed layer adds indicator child:
```tsx
<Checkbox defaultChecked onCheckedChange={(checked) => console.log(checked)} />
<Checkbox defaultChecked disabled />
<Checkbox defaultChecked="mixed" />
```

Class keys: `root`, `indicator`
No user-facing sub-components — the indicator is an internal implementation detail of the visual presentation. Developers needing a custom indicator use the factory API (`Checkbox.Root()`) directly.

**Switch** — wraps `Switch.Root`, composed layer adds thumb child:
```tsx
<Switch defaultChecked onCheckedChange={(checked) => console.log(checked)} />
<Switch defaultChecked disabled />
```

Class keys: `root`, `thumb`
No `size` prop at the composed primitive level. Size is a theme concern — the themed wrapper handles variant selection (two sets of classes, like how `createThemedTabs` uses `variant` to switch between `DefaultTabs` and `LineTabs`):
```tsx
// theme-shadcn creates two styled versions:
const DefaultSwitch = withStyles(ComposedSwitch, { root: styles.root, thumb: styles.thumb });
const SmSwitch = withStyles(ComposedSwitch, { root: styles.rootSm, thumb: styles.thumbSm });
// Themed wrapper selects based on size prop:
function SwitchRoot({ size, ...props }) {
  return (size === 'sm' ? SmSwitch : DefaultSwitch)(props);
}
```

**Toggle** — wraps `Toggle.Root`, children become button content:
```tsx
<Toggle defaultPressed onPressedChange={(p) => console.log(p)}>
  <BoldIcon />
</Toggle>
```

Class keys: `root`

### Tier 2: Stateful returns — do NOT use `withStyles()`

These return compound objects (`{ root, state, setValue }`) and cannot satisfy the `ComposedPrimitive<K>` contract (which requires `=> HTMLElement`). Their theme wrappers remain manual, but refactored to use the composed primitives.

**Progress** — composed wrapper returns `HTMLElement` for JSX, applies classes internally:
```tsx
<Progress defaultValue={50} min={0} max={100} />
```

Class keys: `root`, `indicator`

The composed version is purely declarative — it returns an `HTMLElement`. Users needing imperative `setValue`/`state` use the factory API (`Progress.Root()`).

**Slider** — composed wrapper returns `HTMLElement` for JSX, applies classes internally:
```tsx
<Slider defaultValue={50} min={0} max={100} step={5} onValueChange={(v) => console.log(v)} />
```

Class keys: `root`, `track`, `range`, `thumb`
(Note: `range` not `fill` — matches existing `ThemeStyles.slider.range` key)

The composed version is purely declarative — it returns an `HTMLElement`. Users needing imperative `state` access use the factory API (`Slider.Root()`).

### Tier 3: Sub-components via slot scanning — fits `ComposedPrimitive` + `withStyles()`

**RadioGroup** — root + Item sub-component:
```tsx
<RadioGroup defaultValue="opt1" onValueChange={(v) => console.log(v)}>
  <RadioGroup.Item value="opt1">Option 1</RadioGroup.Item>
  <RadioGroup.Item value="opt2">Option 2</RadioGroup.Item>
  <RadioGroup.Item value="opt3" disabled>Option 3 (disabled)</RadioGroup.Item>
</RadioGroup>
```

Class keys: `root`, `item`, `indicator`

RadioGroup.Item accepts: `value` (required), `disabled` (optional), `children` (label text).

**Implementation bridge (scanSlots → Item factory):**
```tsx
function ComposedRadioGroupRoot({ children, classes, defaultValue, onValueChange }) {
  // 1. Provide classes via context
  let resolvedNodes: Node[] = [];
  RadioGroupClassesContext.Provider(classes, () => {
    resolvedNodes = resolveChildren(children);
  });

  // 2. Scan for item slots
  const { slots } = scanSlots(resolvedNodes);
  const itemEntries = slots.get('radiogroup-item') ?? [];

  // 3. Create the primitive
  const radio = Radio.Root({ defaultValue, onValueChange });

  // 4. Bridge: for each scanned slot, call the primitive's Item()
  for (const entry of itemEntries) {
    const value = entry.attrs.value ?? '';
    const labelText = entry.children
      .map((n) => n.textContent ?? '')
      .join('');

    // Create the primitive radio item
    const item = radio.Item(value, labelText);

    // Apply classes
    if (classes?.item) item.className = classes.item;

    // Create indicator child
    const indicator = document.createElement('span');
    if (classes?.indicator) indicator.className = classes.indicator;
    indicator.setAttribute('data-state',
      item.getAttribute('data-state') ?? 'unchecked');
    item.textContent = ''; // clear label text, will be in wrapper
    item.appendChild(indicator);

    // Handle disabled
    if (entry.attrs.disabled !== undefined) {
      item.setAttribute('aria-disabled', 'true');
      item.style.pointerEvents = 'none';
    }
  }

  // 5. Apply root class
  if (classes?.root) radio.root.className = classes.root;

  return radio.root;
}
```

### Tier 4: Imperative-only — no composed wrapper

**Toast** — inherently imperative (`announce`/`dismiss`). A JSX wrapper adds no declarative benefit — the user still needs to hold a reference to call `announce()`. Toast gets a PascalCase key in `ThemedPrimitives` but keeps its current factory-based theme wrapper.

```tsx
// Toast stays as a factory, just renamed to PascalCase:
const toast = primitives.Toast({ duration: 5000 });
document.body.appendChild(toast.region);
toast.announce('Saved successfully');
```

## Manifesto Alignment

- **Principle 1 (Declarative JSX)** — Converting imperative factories to JSX compound components where declarative usage makes sense (Checkbox, Switch, Toggle, Progress, Slider, RadioGroup). Toast stays imperative because it inherently is.
- **Principle 2 (One way to do things)** — Eliminating the lowercase/PascalCase split in `ThemedPrimitives`. All primitives get PascalCase keys.
- **Principle 3 (Composable)** — `withStyles()` lets themes compose styling without duplicating behavior for Tier 1 and Tier 3 components.
- **Principle 7 (No runtime overhead)** — Composed wrappers are thin; they delegate to the existing factory primitives.

## Non-Goals

- **New primitive behaviors** — No new ARIA patterns, keyboard interactions, or state management. This is a composition layer change only.
- **Breaking the factory API** — Factories stay. Advanced use cases (e.g., direct element access on Slider/Progress, imperative Toast) still need them.
- **Theme-level composition changes** — The `withStyles()` infrastructure is unchanged.
- **User-facing sub-components for Checkbox/Switch/Toggle** — These are simple enough that the composed layer adds indicator/thumb internally. No user-facing sub-components needed. Custom indicators → use the factory API.
- **Label association** — Checkbox/Switch/Toggle don't include built-in label sub-components. Developers use the theme's `<Label>` component or HTML `<label>` with the `id` prop (passthrough via `ElementAttrs`). This is consistent with how shadcn/ui and Radix handle labels.
- **Multi-thumb Slider** — The current primitive supports only one thumb. Out of scope.
- **Structured Toast content** — `announce(content: string)` only accepts strings. Structured toasts (title + description + action) are a separate feature.
- **Generalizing `ComposedPrimitive` interface** — We do NOT modify `withStyles()` or `ComposedPrimitive<K>` to support compound return types. Components that don't fit the `=> HTMLElement` contract use manual theme wrappers.

## Unknowns

### 1. Toast composed API shape — resolved: no composed wrapper

Toast is inherently imperative. A JSX wrapper (`<Toast />`) creates a region but you still need to hold a reference to call `announce()` — this is a setup call disguised as JSX with no declarative benefit. Decision: Toast gets a PascalCase key rename only. No composed wrapper.

### 2. RadioGroup.Item slot scanning → Item factory bridge — resolved: see implementation bridge above

The composed root scans for `data-slot="radiogroup-item"` entries, extracts `data-value` and children text, then calls `Radio.Root().Item(value, label)` for each. The primitive's `Item()` appends to root automatically, which is fine since we control the creation order. Classes are applied after item creation. See the pseudocode in the API Surface section.

### 3. Progress/Slider `ComposedPrimitive` contract — resolved: don't use `withStyles()`

`ComposedPrimitive<K>` requires `=> HTMLElement`. Progress/Slider return compound objects from their factories. Rather than generalizing the interface (which would be over-engineering for 2 components), the composed versions return `HTMLElement` directly for JSX usage. Users needing `setValue`/`state` continue using the factory API. The theme wrappers for Progress and Slider remain manual (not using `withStyles()`) but are simplified to delegate to the composed primitive.

### 4. Switch size variant — resolved: theme-level variant selection

The composed `ComposedSwitch` has no `size` prop. The themed wrapper in `theme-shadcn` creates two styled instances (default + sm) and selects based on a `size` prop, following the same pattern as `createThemedTabs` with its `variant` prop.

## Type Flow Map

### Tier 1 + Tier 3 (Checkbox, Switch, Toggle, RadioGroup) — full `withStyles()` flow:
```
ComposedCheckbox (phantom __classKeys: 'root' | 'indicator')
  → withStyles<ComposedCheckbox>(composed, { root: string, indicator: string })
    → StyledPrimitive<ComposedCheckbox> (classes prop removed)
      → createThemedCheckbox(styles) wraps with close icon if needed
        → configureTheme().components.primitives.Checkbox
```

### Tier 2 (Progress, Slider) — manual theme wrapper:
```
ComposedProgress (returns HTMLElement, NOT ComposedPrimitive)
  → createThemedProgress(styles) creates ComposedProgress, applies classes manually
    → configureTheme().components.primitives.Progress
```

### Tier 4 (Toast) — no composed layer:
```
Toast.Root (factory, unchanged)
  → createThemedToast(styles) wraps factory, applies classes
    → configureTheme().components.primitives.Toast (PascalCase rename only)
```

## E2E Acceptance Test

### Developer perspective — using themed Checkbox in JSX:
```tsx
const { Checkbox } = themeComponents.primitives;

// Valid usage
<Checkbox defaultChecked onCheckedChange={(c) => console.log(c)} />
<Checkbox disabled />

// @ts-expect-error — invalid prop
<Checkbox checked={true} />
```

### Developer perspective — using themed RadioGroup in JSX:
```tsx
const { RadioGroup } = themeComponents.primitives;

<RadioGroup defaultValue="a" onValueChange={(v) => console.log(v)}>
  <RadioGroup.Item value="a">Alpha</RadioGroup.Item>
  <RadioGroup.Item value="b">Beta</RadioGroup.Item>
  <RadioGroup.Item value="c" disabled>Gamma (unavailable)</RadioGroup.Item>
</RadioGroup>
```

### Developer perspective — withStyles type safety:
```tsx
import { ComposedCheckbox, withStyles } from '@vertz/ui-primitives';

// Valid
withStyles(ComposedCheckbox, { root: 'cls', indicator: 'cls' });

// @ts-expect-error — unknown key
withStyles(ComposedCheckbox, { root: 'cls', indicator: 'cls', extra: 'cls' });

// @ts-expect-error — missing required key
withStyles(ComposedCheckbox, { root: 'cls' });
```

### Developer perspective — Progress and Slider declarative usage:
```tsx
const { Progress, Slider } = themeComponents.primitives;

// Declarative JSX — no imperative setValue needed
<Progress defaultValue={75} />
<Slider defaultValue={50} min={0} max={100} onValueChange={(v) => console.log(v)} />
```

## Implementation Plan

### Phase 1: Simple composed primitives (Checkbox, Switch, Toggle)

These three follow the same pattern: single-element primitives with no user-facing sub-components. The composed wrapper accepts props, creates the factory primitive, applies classes, and appends indicator/thumb children. All three satisfy the `ComposedPrimitive<K>` contract and work with `withStyles()`.

**Files to create:**
- `packages/ui-primitives/src/checkbox/checkbox-composed.tsx`
- `packages/ui-primitives/src/switch/switch-composed.tsx`
- `packages/ui-primitives/src/toggle/toggle-composed.tsx`
- `packages/ui-primitives/src/checkbox/__tests__/checkbox-composed.test.ts`
- `packages/ui-primitives/src/switch/__tests__/switch-composed.test.ts`
- `packages/ui-primitives/src/toggle/__tests__/toggle-composed.test.ts`
- `packages/ui-primitives/src/composed/__tests__/with-styles-batch2.test-d.ts` (type flow tests)

**Files to modify:**
- `packages/ui-primitives/src/index.ts` — add Composed exports
- `packages/theme-shadcn/src/components/primitives/checkbox.ts` — use withStyles
- `packages/theme-shadcn/src/components/primitives/switch.ts` — use withStyles (with size variant selection)
- `packages/theme-shadcn/src/components/primitives/toggle.ts` — use withStyles
- `packages/theme-shadcn/src/components/primitives/index.ts` — export new types
- `packages/theme-shadcn/src/configure.ts` — update ThemedPrimitives types + assembly (PascalCase keys)

**Acceptance criteria:**
```typescript
describe('Feature: Composed Checkbox', () => {
  describe('Given a ComposedCheckbox with classes', () => {
    describe('When rendered', () => {
      it('Then creates a button with role="checkbox" and applies root class', () => {});
      it('Then creates an indicator child with the indicator class', () => {});
    });
  });
  describe('Given a ComposedCheckbox with defaultChecked', () => {
    describe('When clicked', () => {
      it('Then toggles aria-checked and fires onCheckedChange', () => {});
    });
  });
  describe('Given a ComposedCheckbox with children (label content)', () => {
    describe('When rendered', () => {
      it('Then moves children into the button element', () => {});
    });
  });
});

describe('Feature: Composed Switch', () => {
  describe('Given a ComposedSwitch with classes', () => {
    describe('When rendered', () => {
      it('Then creates a button with role="switch" and applies root class', () => {});
      it('Then creates a thumb child with the thumb class', () => {});
    });
  });
  describe('Given a ComposedSwitch with defaultChecked', () => {
    describe('When toggled', () => {
      it('Then syncs thumb data-state with checked state', () => {});
    });
  });
});

describe('Feature: Composed Toggle', () => {
  describe('Given a ComposedToggle with children and classes', () => {
    describe('When rendered', () => {
      it('Then creates a button with aria-pressed and applies root class', () => {});
      it('Then moves children into the button', () => {});
    });
  });
});
```

**Type flow tests (`.test-d.ts`):**
- `withStyles(ComposedCheckbox, { root, indicator })` compiles
- `withStyles(ComposedCheckbox, { root })` rejected (missing indicator)
- `withStyles(ComposedCheckbox, { root, indicator, extra })` rejected (unknown key)
- Same pattern for ComposedSwitch (`root`, `thumb`) and ComposedToggle (`root`)

### Phase 2: Progress and Slider

These return `HTMLElement` from the composed version (not `ComposedPrimitive`). Theme wrappers remain manual but simplified.

**Files to create:**
- `packages/ui-primitives/src/progress/progress-composed.tsx`
- `packages/ui-primitives/src/slider/slider-composed.tsx`
- `packages/ui-primitives/src/progress/__tests__/progress-composed.test.ts`
- `packages/ui-primitives/src/slider/__tests__/slider-composed.test.ts`

**Files to modify:**
- `packages/ui-primitives/src/index.ts` — add Composed exports
- `packages/theme-shadcn/src/components/primitives/progress.ts` — refactor to use composed
- `packages/theme-shadcn/src/components/primitives/slider.ts` — refactor to use composed
- `packages/theme-shadcn/src/components/primitives/index.ts` — export new types
- `packages/theme-shadcn/src/configure.ts` — update ThemedPrimitives (PascalCase keys)

**Acceptance criteria:**
```typescript
describe('Feature: Composed Progress', () => {
  describe('Given a ComposedProgress with classes', () => {
    describe('When rendered', () => {
      it('Then creates a progressbar element with root class', () => {});
      it('Then creates an indicator child with indicator class', () => {});
      it('Then sets initial aria-valuenow from defaultValue', () => {});
    });
  });
});

describe('Feature: Composed Slider', () => {
  describe('Given a ComposedSlider with classes', () => {
    describe('When rendered', () => {
      it('Then applies root, track, range, and thumb classes', () => {});
    });
  });
  describe('Given a ComposedSlider with onValueChange', () => {
    describe('When thumb is moved via keyboard', () => {
      it('Then fires onValueChange with the new value', () => {});
    });
  });
});
```

### Phase 3: RadioGroup (slot scanning)

RadioGroup needs Item sub-components with `data-slot` scanning, following the Accordion pattern. The composed root bridges scanned slots to `Radio.Root().Item()` calls.

**Files to create:**
- `packages/ui-primitives/src/radio/radio-composed.tsx`
- `packages/ui-primitives/src/radio/__tests__/radio-composed.test.ts`

**Files to modify:**
- `packages/ui-primitives/src/index.ts` — add Composed exports
- `packages/theme-shadcn/src/components/primitives/radio-group.ts` — use withStyles
- `packages/theme-shadcn/src/components/primitives/index.ts` — export new types
- `packages/theme-shadcn/src/configure.ts` — update ThemedPrimitives (PascalCase key)

**Acceptance criteria:**
```typescript
describe('Feature: Composed RadioGroup', () => {
  describe('Given a ComposedRadioGroup with Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates a radiogroup with items from scanned slots', () => {});
      it('Then applies root, item, and indicator classes', () => {});
      it('Then each item has role="radio"', () => {});
    });
  });
  describe('Given a ComposedRadioGroup with defaultValue', () => {
    describe('When an item is clicked', () => {
      it('Then updates selection and fires onValueChange', () => {});
      it('Then updates indicator data-state on all items', () => {});
    });
  });
  describe('Given a RadioGroup.Item with disabled attribute', () => {
    describe('When rendered', () => {
      it('Then marks the item as aria-disabled', () => {});
    });
  });
});
```

**Type flow tests:**
- `withStyles(ComposedRadioGroup, { root, item, indicator })` compiles
- `withStyles(ComposedRadioGroup, { root })` rejected
- RadioGroup.Item sub-component accessible on styled result

### Phase 4: Theme integration + PascalCase migration + docs

Update `ThemedPrimitives` interface to use PascalCase keys for all 7 components. Remove lowercase keys entirely (pre-v1 policy: breaking changes encouraged, no backward-compat shims). Update docs. Rename Toast key to PascalCase (no composed wrapper, just key rename).

**Files to modify:**
- `packages/theme-shadcn/src/configure.ts` — replace lowercase keys with PascalCase in `ThemedPrimitives` interface and assembly
- `packages/theme-shadcn/src/components/primitives/toast.ts` — keep as-is (factory wrapper)
- `packages/docs/guides/ui/styling.mdx` — add JSX usage examples for the 7 primitives
- Any test files referencing old lowercase keys (e.g., walkthrough tests)

**Acceptance criteria:**
```typescript
describe('Feature: PascalCase ThemedPrimitives', () => {
  describe('Given configureTheme() result', () => {
    describe('When accessing primitives', () => {
      it('Then Checkbox is a callable JSX component', () => {});
      it('Then Switch is a callable JSX component', () => {});
      it('Then Toggle is a callable JSX component', () => {});
      it('Then Progress is a callable JSX component', () => {});
      it('Then Slider is a callable JSX component', () => {});
      it('Then RadioGroup is a callable JSX component with Item sub-component', () => {});
      it('Then Toast is a callable factory function', () => {});
    });
  });
});
```
- No lowercase keys (`checkbox`, `switch`, etc.) exist on `ThemedPrimitives`
- All test files updated to use PascalCase
- Docs updated with JSX examples in `packages/docs/guides/ui/styling.mdx`

### Dependencies

```
Phase 1 (Checkbox, Switch, Toggle) — establishes pattern
  ↓
Phase 2 (Progress, Slider) — stateful, different approach (no withStyles)
  ↓
Phase 3 (RadioGroup) — slot scanning + withStyles
  ↓
Phase 4 (Theme integration + PascalCase + docs) — needs all composed versions ready
```

## Future Work

~12 other factory primitives remain lowercase in `ThemedPrimitives`: `calendar`, `carousel`, `collapsible`, `command`, `contextMenu`, `datePicker`, `drawer`, `hoverCard`, `menubar`, `navigationMenu`, `resizablePanel`, `scrollArea`, `toggleGroup`. A Batch 3 should convert those that benefit from JSX composition and rename the rest to PascalCase. This is tracked separately from this issue.
