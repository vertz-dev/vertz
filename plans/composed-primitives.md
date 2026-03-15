# Composed Primitives — Extract Component Logic from Theme to Primitives

## Problem

The theme package (`@vertz/theme-shadcn`) contains significant **behavioral glue** that has nothing to do with styling. If we want a second theme (e.g., `@vertz/theme-material`), all this logic must be duplicated:

- **Slot scanning** — Walking resolved children for `data-slot` markers, extracting elements from invisible containers
- **DOM adoption** — Moving user's children into primitive elements via `appendChild`
- **Trigger wiring** — Attaching click handlers to user triggers that call `show()`/`hide()`
- **ARIA wiring** — Setting `aria-expanded`, `aria-controls`, `aria-haspopup` on user triggers
- **State syncing** — MutationObserver watching primitive state and pushing to themed elements
- **Portal logic** — Appending overlays/content to `document.body`

This behavioral code is identical across themes. Only CSS classes differ.

## Solution

Add a **composed API** to `@vertz/ui-primitives`. Each primitive gets a high-level composable component alongside its existing low-level factory:

```
Low-level (existing):   Dialog.Root(options) → { overlay, content, trigger, ... }
Composed (new):         Dialog({ children, classes }) → HTMLElement
Sub-components (new):   Dialog.Trigger(), Dialog.Content(), Dialog.Title(), ...
```

The theme becomes a thin style-binding layer:

```ts
// theme-shadcn — before (170+ lines of behavioral glue per component)
function createThemedDialog(styles) {
  // slot scanning, primitive creation, ARIA wiring, portal logic, icon injection...
}

// theme-shadcn — after (~5 lines per component)
function createThemedDialog(styles) {
  return withStyles(Dialog, {
    overlay: styles.overlay,
    content: styles.content,
    close: styles.close,
    title: styles.title,
    description: styles.description,
    header: styles.header,
    footer: styles.footer,
  });
}
```

## Composed Primitive Criteria

A primitive gets a composed API if its themed wrapper contains **any** of:
- Slot scanning (`data-slot` child walking)
- Trigger wiring (click handler → show/hide)
- ARIA wiring (aria-expanded, aria-controls)
- Portal logic (append to body)
- State syncing (MutationObserver or signal-based)

Simple style-application wrappers (Button, Card, Avatar, Badge, Input, Label, etc.) stay in the theme. They are pure styled HTML elements with no behavioral logic that would be duplicated across themes.

## API Surface

### 1. Composed Primitive Components

Each primitive exports a callable function component with sub-component properties:

```tsx
import { Dialog } from '@vertz/ui-primitives';

// Works unstyled — all behavior + a11y built in
<Dialog>
  <Dialog.Trigger>
    <button>Open</button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Confirm deletion</Dialog.Title>
      <Dialog.Description>This action cannot be undone.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Dialog.Close>Cancel</Dialog.Close>
      <button onClick={handleDelete}>Delete</button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
```

The consumer API is **identical** to the current theme API. Only the import source changes when using unstyled primitives directly.

### 2. Export Shape — Function with Properties

`Dialog` is exported as a **callable function with static properties**. This is standard JavaScript — functions are objects and can have properties.

```ts
// Dialog is BOTH callable and has sub-component properties
Dialog({ children, classes });      // Composed component (new)
Dialog.Root(options);               // Factory API (existing, escape hatch)
Dialog.Trigger({ children });       // Sub-component marker
Dialog.Content({ children, class }); // Sub-component marker
Dialog.Title({ children, class });  // Content element
// etc.
```

TypeScript models this with a call signature + properties:

```ts
interface DialogComponent {
  (props: DialogProps): HTMLElement;
  Root: (options?: DialogRootOptions) => DialogElements;
  Trigger: (props: SlotProps) => HTMLElement;
  Content: (props: SlotProps) => HTMLElement;
  Title: (props: ContentSlotProps) => HTMLElement;
  Description: (props: ContentSlotProps) => HTMLElement;
  Header: (props: ContentSlotProps) => HTMLElement;
  Footer: (props: ContentSlotProps) => HTMLElement;
  Close: (props: ContentSlotProps) => HTMLElement;
}
```

`.Root()` is the low-level factory for custom behavior. The composed API (`Dialog(props)`) is the recommended path.

### 3. Class Distribution via Context

The root component provides `classes` to sub-components via an internal context. Sub-components read from context and apply their corresponding class.

```
Dialog({ children, classes })
  │
  ├─ Provides classes via DialogClassesContext
  │
  ├─ resolveChildren(children)  ← thunks evaluated inside context scope
  │   │
  │   ├─ Dialog.Content({ children })
  │   │   └─ reads classes.content from context
  │   │   └─ resolveChildren(children)
  │   │       ├─ Dialog.Title({ children })
  │   │       │   └─ reads classes.title from context
  │   │       └─ Dialog.Footer({ children })
  │   │           └─ reads classes.footer from context
  │   │
  │   └─ Dialog.Trigger({ children })
  │       └─ creates slot marker (no class from context)
  │
  ├─ scanSlots(resolvedNodes) → finds trigger, content markers
  │
  ├─ Dialog.Root(options) → primitive elements
  │
  ├─ Apply classes.overlay to primitive overlay (root-level, not context)
  │
  └─ Wire trigger, adopt content children, portal to body
```

**Why context works here:** Vertz JSX wraps children in thunks. `resolveChildren()` calls these thunks synchronously. The root provides the context scope before resolving children, so all sub-component functions execute within that scope and can read classes via `useContext()`.

**Sub-component types:**
- **Structural slots** (Trigger, Content): Scanned by root via `data-slot`. Root applies root-level classes (overlay) and moves children into primitive elements.
- **Content elements** (Title, Description, Header, Footer, Close): NOT scanned by root. They render directly where placed. They read their class from context.

### 4. Style Map Pattern — `classes` prop

The composed component accepts a `classes` prop that maps structural parts to CSS class strings:

```tsx
<Dialog classes={{
  overlay: 'fixed inset-0 bg-black/50',
  content: 'bg-white rounded-lg shadow-xl max-w-md',
  close: 'absolute top-4 right-4',
  header: 'flex flex-col gap-1.5',
  title: 'text-lg font-semibold',
  description: 'text-sm text-gray-500',
  footer: 'flex justify-end gap-2 mt-4',
}}>
  ...
</Dialog>
```

**Class key naming convention:** Class keys match sub-component names (lowercased). `Dialog.Content` → `classes.content`, `Dialog.Title` → `classes.title`. This eliminates the ambiguity of having different names for the same thing.

Each sub-component also accepts an optional `class` prop for per-instance overrides:

```tsx
<Dialog.Content class="max-w-lg">
  {/* 'max-w-lg' is merged with classes.content from the root */}
</Dialog.Content>
```

**Class merging:** Classes are joined with a space (`classes.content + ' ' + props.class`). Conflict resolution (e.g., tailwind-merge) is the theme's responsibility — primitives do simple concatenation.

### 5. Theme Integration — `withStyles()`

Themes use `withStyles()` to pre-bind CSS classes:

```ts
import { Dialog, withStyles } from '@vertz/ui-primitives';
import type { DialogClasses } from '@vertz/ui-primitives';

const dialogClasses: DialogClasses = {
  overlay: styles.overlay,
  content: styles.content,
  close: styles.close,
  header: styles.header,
  title: styles.title,
  description: styles.description,
  footer: styles.footer,
};

const ThemedDialog = withStyles(Dialog, dialogClasses);
```

**`withStyles()` is trivially simple** because of context-based class distribution. It just pre-binds the `classes` prop on the root — sub-components are unchanged:

```ts
function withStyles<C extends ComposedPrimitive>(
  component: C,
  classes: ClassesOf<C>,
): StyledPrimitive<C> {
  const styled = (props: Omit<PropsOf<C>, 'classes'>) =>
    component({ ...props, classes });

  // Copy all sub-component properties as-is
  // (they read classes from context, not from withStyles binding)
  for (const key of Object.getOwnPropertyNames(component)) {
    if (key !== 'length' && key !== 'name' && key !== 'prototype') {
      (styled as any)[key] = (component as any)[key];
    }
  }

  return styled as StyledPrimitive<C>;
}
```

No sub-component wrapping needed. No metadata. No convention-based property mapping. Context handles everything.

Icons are root-level props, not part of `withStyles`:

```tsx
// Theme creates a wrapper if it needs custom icons
function createThemedDialog(styles) {
  const Styled = withStyles(Dialog, mapToClasses(styles));
  return (props) => <Styled {...props} closeIcon={<LucideX />} />;
}
```

### 6. Slot Scanner Utility

A shared utility for the slot-scanning pattern, used internally by composed primitives:

```ts
// @vertz/ui-primitives — internal utility
interface SlotEntry {
  element: HTMLElement;
  children: Node[];
  attrs: Record<string, string>;
}

interface SlotMap {
  [slotName: string]: SlotEntry | SlotEntry[];
}

function scanSlots(
  nodes: Node[],
  config: Record<string, 'single' | 'multiple'>,
): SlotMap;
```

The `config` parameter specifies whether each slot appears once (`'single'`) or multiple times (`'multiple'`):

```ts
// Dialog: trigger and content appear once
scanSlots(nodes, { trigger: 'single', content: 'single' });

// Tabs: list appears once, but triggers and contents appear multiple times
scanSlots(nodes, { list: 'single', trigger: 'multiple', content: 'multiple' });
```

This replaces the ad-hoc `for (const node of resolveChildren(children))` + `node.dataset.slot` pattern duplicated across Dialog, Tabs, Select, Accordion, etc. Note: `scanSlots` is a coupling point — all composed primitives depend on it. It must be thoroughly tested.

### 7. Variant-Aware Class Maps

Some primitives have class keys that vary based on props. For example, Sheet has side-specific panel classes:

```ts
interface SheetClasses {
  overlay: string;
  content: string; // Base content class
  contentLeft: string;
  contentRight: string;
  contentTop: string;
  contentBottom: string;
  header: string;
  title: string;
  description: string;
  footer: string;
  close: string;
}
```

The composed Sheet primitive reads the `side` prop and selects the right content class:

```ts
function Sheet({ children, classes, side = 'right' }: SheetProps) {
  const sideKey = `content${capitalize(side)}` as keyof SheetClasses;
  const mergedClasses = {
    ...classes,
    content: mergeClasses(classes?.content, classes?.[sideKey]),
  };
  // ... provide mergedClasses via context
}
```

Each composed primitive defines its own `ClassMap` type. `withStyles` enforces the correct shape per component.

### 8. Portal Cleanup / Disposal

Composed primitives that portal elements to `document.body` (Dialog, AlertDialog, Sheet, Popover) clean up on close:

- When the dialog closes, the overlay and content panel are hidden (not removed) via `setHiddenAnimated()` which defers `display:none` until exit animations complete.
- When the composed component's parent is removed from the DOM, portaled elements are orphaned. This is a **pre-existing limitation** shared with the current theme implementation. The low-level primitive `Dialog.Root()` has the same behavior.
- Future improvement: integrate with `@vertz/ui` disposal scopes so portaled elements are removed when their owning scope is disposed. This is out of scope for this refactoring.

### 9. Composed Components — Full List

**Phase 1: Dialog + AlertDialog (prove the pattern, vertical slice):**

| Component | Slots | Behavioral Logic Moved |
|-----------|-------|----------------------|
| `Dialog` | Trigger, Content, Header, Title, Description, Footer, Close | Slot scan, trigger click, ARIA, portal, close |
| `AlertDialog` | Trigger, Content, Header, Title, Description, Footer, Cancel, Action | Same as Dialog + blocks overlay/Escape dismiss, action/cancel roles |

**Phase 2: Tabs + Select + Accordion (nested slots, vertical slice):**

| Component | Slots | Behavioral Logic Moved |
|-----------|-------|----------------------|
| `Tabs` | List, Trigger, Content | Nested slot scan, tab registration, content mapping |
| `Select` | Trigger, Content, Item, Group, Separator | Recursive item processing, chevron icon, ARIA IDs |
| `Accordion` | Item, Trigger, Content | Item scan, trigger wiring |

**Phase 3a: Overlay/floating primitives (vertical slice):**

| Component | Slots | Behavioral Logic Moved |
|-----------|-------|----------------------|
| `Popover` | Trigger, Content | Slot scan, trigger click, floating position |
| `Sheet` | Trigger, Content, Header, Title, Description, Footer, Close | Slot scan, side positioning |
| `DropdownMenu` | Trigger, Content, Item, Group, Separator | Slot scan, item processing |
| `Tooltip` | Trigger, Content | Hover/focus trigger, floating position |
| `HoverCard` | Trigger, Content | Hover trigger, floating position |
| `ContextMenu` | Trigger, Content, Item, Group, Separator | Right-click trigger |

**Phase 3b: Form control primitives (vertical slice):**

| Component | Slots | Behavioral Logic Moved |
|-----------|-------|----------------------|
| `Checkbox` | *(single element)* | State sync, indicator icon |
| `Switch` | *(single element)* | Thumb element creation |
| `RadioGroup` | Item | Group state, item registration |
| `Slider` | *(single element)* | Track/range/thumb creation |
| `Progress` | *(single element)* | Indicator creation |
| `Toggle` | *(single element)* | Pressed state |
| `ToggleGroup` | Item | Group state |

**Phase 3c: Remaining composed primitives (vertical slice):**

| Component | Notes |
|-----------|-------|
| `Toast` | Queue management, auto-dismiss |
| `Command` | Search + list composition |
| `Carousel` | Slide navigation |
| `Calendar` | Date grid, month navigation |
| `DatePicker` | Calendar + Popover composition |
| `NavigationMenu` | Nested menu navigation |
| `Menubar` | Menu bar with keyboard nav |
| `Collapsible` | Toggle content visibility |
| `Drawer` | Dialog variant with drag |
| `ResizablePanel` | Panel layout |
| `ScrollArea` | Custom scrollbars |

**Note on diminishing returns:** Phases 3b and 3c include simpler primitives (Checkbox, Switch, etc.) where the behavioral glue in the theme is thinner (10-30 lines vs 170+ for Dialog). The composed API still provides value for consistency and multi-theme support, but the code savings per component are smaller.

### 10. Low-Level API Preserved

The existing factory API (`Dialog.Root()`, `Tabs.Root()`, etc.) is **not removed**. It remains as the escape hatch for custom behavior that the composed API doesn't cover. `.Root` is clearly the low-level API; the top-level callable function is the composed API.

### 11. `configureTheme()` Return Type

After migration, `configureTheme()` continues to return `{ theme, globals, styles, components }`. The `components.primitives` object still exists — it contains the result of `withStyles()` calls instead of hand-built themed wrappers. The consumer API does not change:

```ts
const { components } = configureTheme({ palette: 'zinc' });
const { Dialog } = components.primitives;
// Same usage as before — withStyles is an internal implementation detail
```

## Manifesto Alignment

### One Way to Do Things
The composed API becomes THE way to use primitives in application code. The factory API (`Dialog.Root()`) is an escape hatch for framework-level customization, not an alternative path for app developers.

### AI Agents Are First-Class Users
The compound component pattern is the most LLM-predicted UI pattern. Sub-component naming (`Dialog.Title`, `Dialog.Content`) is self-documenting. An LLM will produce correct code on the first prompt.

### If It Builds, It Works
`DialogClasses`, `TabsClasses`, etc. are typed — misspelled class keys produce TypeScript errors. `withStyles()` is generic and enforces the correct class map shape per component.

### Explicit Over Implicit
`withStyles()` is a single, visible call. Classes flow via context (an internal mechanism), but the binding point is explicit.

### Convention Over Configuration
All composed primitives follow the same pattern: callable function + sub-component properties. Class keys match sub-component names (lowercased). No per-component configuration beyond the class map.

## Non-Goals

1. **Simple HTML components stay in theme.** Button, Card, Avatar, Badge, Input, Label, Textarea, Table, Breadcrumb, Alert, Skeleton, Separator, FormGroup — these are pure styled HTML elements with no behavioral logic worth extracting.

2. **No backward compatibility.** This is a clean break. `configureTheme()` return shape stays the same, but the internal implementation changes completely. All examples are migrated together.

3. **No icon library.** Primitives provide minimal SVG fallbacks. Themes override via icon props on root components (e.g., `<Dialog closeIcon={...}>`).

4. **No runtime theme switching.** `withStyles()` is a build-time binding.

5. **No new visual components.** This refactoring moves existing logic. No new UI patterns.

6. **Reactive slot composition.** Slot scanning is a one-time operation at mount. Conditional rendering of sub-components (e.g., `{isAdmin && <Dialog.Footer>...}`) is evaluated at mount time and does not react to later state changes. This is the same limitation as the current theme implementation.

7. **`withStyles()` is classes-only.** Behavioral differences between primitives (AlertDialog blocks overlay dismiss; Sheet has side positioning) are baked into each composed primitive's orchestrator. `withStyles()` doesn't parameterize behavior — it only binds class strings.

## Unknowns

1. **`resolveChildren` dependency.** `resolveChildren` lives in `@vertz/ui`. `@vertz/ui-primitives` already depends on `@vertz/ui` (for signals). Need to verify the import path works. **Resolution: check existing imports — low risk.**

2. **Context in pre-built package.** Composed primitives use `createContext()` from `@vertz/ui`. Since `@vertz/ui-primitives` is pre-built (compiled to `dist/`), the context needs a manual `__stableId` for HMR stability (per `context-stable-ids.md` rule). This is straightforward but must be done for every composed component's internal context. **Resolution: follow existing pattern (`@vertz/ui-primitives::<ContextName>`).**

## Type Flow Map

```
DialogClasses (type) ─────────────────────────────────────────────────────┐
  overlay: string                                                         │
  content: string                                                         │
  close: string                                                           │
  header: string                                                          │
  title: string                                                           │
  description: string                                                     │
  footer: string                                                          │
  │                                                                       │
  ▼                                                                       │
withStyles(Dialog, classes: DialogClasses)                                 │
  │   Infers ClassesOf<Dialog> = DialogClasses                            │
  │   Returns StyledPrimitive<Dialog> (same call sig, minus classes prop) │
  │                                                                       │
  ▼                                                                       │
StyledDialog(props) → HTMLElement                                         │
  │                                                                       │
  ├─ Provides classes via DialogClassesContext ◄──────────────────────────┘
  │
  ├─ resolveChildren(children) — thunks evaluated inside context scope
  │   ├─ Dialog.Title()  → useContext(DialogClassesContext) → classes.title
  │   ├─ Dialog.Footer() → useContext(DialogClassesContext) → classes.footer
  │   └─ Dialog.Close()  → useContext(DialogClassesContext) → classes.close
  │
  ├─ scanSlots(nodes) → finds structural slots (trigger, content)
  │
  ├─ Dialog.Root(options) → primitive elements
  │   ├─ overlay   → classes.overlay applied by root
  │   └─ content   → classes.content applied by root
  │
  └─ Return composed HTMLElement
```

**Type inference strategy for `withStyles()`:**

Each composed primitive carries a branded `__classKeys` type:

```ts
interface ComposedPrimitive<K extends string = string> {
  (props: { children?: ChildValue; classes?: Partial<Record<K, string>> }): HTMLElement;
  __classKeys: K; // phantom type brand — never accessed at runtime
}

// Dialog is typed as:
const Dialog: ComposedPrimitive<'overlay' | 'content' | 'close' | 'header' | 'title' | 'description' | 'footer'>;

// withStyles infers K from the component:
type ClassesOf<C> = C extends ComposedPrimitive<infer K> ? Record<K, string> : never;

function withStyles<C extends ComposedPrimitive>(
  component: C,
  classes: ClassesOf<C>,
): Omit<C, '__classKeys'> & ((props: Omit<Parameters<C>[0], 'classes'>) => HTMLElement);
```

This avoids the under-specified `K extends string` problem flagged in technical review. `K` is inferred from `C`'s phantom brand, not from both `C` and `classes` simultaneously.

**Type tests (`.test-d.ts`):**

```ts
import { Dialog, Tabs, withStyles } from '@vertz/ui-primitives';

// ✅ Correct class map
withStyles(Dialog, {
  overlay: 'a', content: 'b', close: 'c',
  header: 'd', title: 'e', description: 'f', footer: 'g',
});

// @ts-expect-error — unknown class key
withStyles(Dialog, { bogus: 'x' });

// @ts-expect-error — missing required keys
withStyles(Dialog, { overlay: 'a' });

// ✅ Tabs has different class keys
withStyles(Tabs, {
  list: 'a', trigger: 'b', content: 'c',
});

// @ts-expect-error — Dialog keys don't work on Tabs
withStyles(Tabs, { overlay: 'a' });

// ✅ Multi-theme: same primitive, different class maps
const ShadcnDialog = withStyles(Dialog, shadcnClasses);
const MaterialDialog = withStyles(Dialog, materialClasses);
// Both work identically — same behavior, different styles
```

## E2E Acceptance Tests

### Developer Walkthrough: Unstyled Dialog

```tsx
import { Dialog } from '@vertz/ui-primitives';

function App() {
  return (
    <Dialog>
      <Dialog.Trigger>
        <button>Open dialog</button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Hello world</Dialog.Title>
          <Dialog.Description>This is an unstyled dialog.</Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer>
          <Dialog.Close>Close</Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

// Behavior:
// - Click "Open dialog" → dialog opens
// - Focus trapped inside dialog
// - Escape key closes dialog
// - Click overlay closes dialog
// - Dialog.Close click closes dialog (any element wrapped in Close triggers close)
// - ARIA: role="dialog", aria-labelledby (title), aria-describedby (description)
// - No CSS classes applied (raw HTML structure)
```

### Developer Walkthrough: Themed Dialog

```tsx
import { Dialog, withStyles } from '@vertz/ui-primitives';

const StyledDialog = withStyles(Dialog, {
  overlay: 'dialog-overlay',
  content: 'dialog-content',
  close: 'dialog-close',
  header: 'dialog-header',
  title: 'dialog-title',
  description: 'dialog-desc',
  footer: 'dialog-footer',
});

function App() {
  return (
    <StyledDialog>
      <StyledDialog.Trigger>
        <button>Open</button>
      </StyledDialog.Trigger>
      <StyledDialog.Content class="max-w-md">
        <StyledDialog.Header>
          <StyledDialog.Title>Styled</StyledDialog.Title>
          <StyledDialog.Description>With classes applied.</StyledDialog.Description>
        </StyledDialog.Header>
        <StyledDialog.Footer>
          <StyledDialog.Close>Cancel</StyledDialog.Close>
        </StyledDialog.Footer>
      </StyledDialog.Content>
    </StyledDialog>
  );
}

// Same behavior as unstyled + CSS classes applied to each structural element
// Content's "max-w-md" merged with classes.content via space concatenation
```

### Developer Walkthrough: Multi-Theme Validation

```tsx
import { Dialog, withStyles } from '@vertz/ui-primitives';

// Two different themes bind the same primitive
const ShadcnDialog = withStyles(Dialog, {
  overlay: 'shadcn-overlay', content: 'shadcn-panel', close: 'shadcn-close',
  header: 'shadcn-header', title: 'shadcn-title', description: 'shadcn-desc',
  footer: 'shadcn-footer',
});

const MaterialDialog = withStyles(Dialog, {
  overlay: 'material-overlay', content: 'material-surface', close: 'material-close',
  header: 'material-header', title: 'material-headline', description: 'material-body',
  footer: 'material-actions',
});

// Both have identical behavior — same ARIA, same focus trapping, same keyboard handling
// Only CSS classes differ
```

### Developer Walkthrough: Theme Integration

```ts
// theme-shadcn/src/components/primitives/dialog.ts — after migration
import { Dialog, withStyles } from '@vertz/ui-primitives';

export function createThemedDialog(styles: CSSOutput<DialogBlocks>) {
  return withStyles(Dialog, {
    overlay: styles.overlay,
    content: styles.content,
    close: styles.close,
    header: styles.header,
    title: styles.title,
    description: styles.description,
    footer: styles.footer,
  });
}
// From 170+ lines to ~10. All behavioral logic lives in the primitive.
```

## Implementation Plan

Every phase is a **vertical slice**: composed primitive + theme migration + example verification. No "internals first, integrate later."

### Phase 1: Infrastructure + Dialog + AlertDialog

**Goal:** Establish the composed primitive pattern. Prove it works end-to-end including theme migration.

**Deliverables:**
1. `scanSlots()` utility in `@vertz/ui-primitives`
2. `withStyles()` generic function with `ComposedPrimitive` type + `ClassesOf` helper
3. Internal context for class distribution (with `__stableId` for HMR)
4. Extend `Dialog.Root()` to include `description` element and `aria-describedby` (matching AlertDialog.Root which already has this)
5. `Dialog` composed component + all sub-components (Trigger, Content, Header, Title, Description, Footer, Close)
6. `AlertDialog` composed component (shares Dialog structure + blocks overlay/Escape dismiss, adds Cancel/Action)
7. Migrate `theme-shadcn` Dialog + AlertDialog to use `withStyles()`
8. Verify example apps still work

**Acceptance Criteria:**
```typescript
describe('Feature: Dialog composed primitive', () => {
  describe('Given a Dialog with Trigger and Content sub-components', () => {
    describe('When the trigger is clicked', () => {
      it('Then opens the dialog with role="dialog"', () => {})
      it('Then traps focus inside the dialog', () => {})
      it('Then sets aria-labelledby pointing to the title', () => {})
      it('Then sets aria-describedby pointing to the description', () => {})
    })
    describe('When Escape is pressed while dialog is open', () => {
      it('Then closes the dialog', () => {})
      it('Then restores focus to the trigger', () => {})
    })
    describe('When Dialog.Close is clicked', () => {
      it('Then closes the dialog', () => {})
    })
  })

  describe('Given a Dialog with classes prop', () => {
    describe('When rendered and opened', () => {
      it('Then applies overlay class to the overlay element', () => {})
      it('Then applies content class to the content panel', () => {})
      it('Then applies title class to the title element', () => {})
      it('Then applies header class to the header element', () => {})
      it('Then applies footer class to the footer element', () => {})
    })
  })

  describe('Given a Dialog.Content with per-instance class', () => {
    describe('When rendered', () => {
      it('Then merges per-instance class with classes.content via space concatenation', () => {})
    })
  })

  describe('Given withStyles(Dialog, classes)', () => {
    describe('When used as a component', () => {
      it('Then pre-applies classes without requiring classes prop', () => {})
      it('Then exposes all sub-components (Trigger, Content, Title, etc.)', () => {})
    })
  })

  describe('Given two withStyles calls with different classes', () => {
    describe('When both are rendered', () => {
      it('Then each applies its own classes independently (multi-theme)', () => {})
    })
  })
})

describe('Feature: AlertDialog composed primitive', () => {
  describe('Given an AlertDialog with action and cancel buttons', () => {
    describe('When Escape is pressed', () => {
      it('Then does NOT close the dialog (blocked)', () => {})
    })
    describe('When overlay is clicked', () => {
      it('Then does NOT close the dialog (blocked)', () => {})
    })
    describe('When Cancel is clicked', () => {
      it('Then closes the dialog', () => {})
    })
    describe('When Action is clicked', () => {
      it('Then closes the dialog', () => {})
    })
  })
})

describe('Feature: Theme migration — Dialog', () => {
  describe('Given configureTheme() with composed Dialog', () => {
    describe('When components.primitives.Dialog is used', () => {
      it('Then has the same behavior as the pre-migration themed Dialog', () => {})
      it('Then applies the same CSS classes', () => {})
    })
  })
})
```

### Phase 2: Tabs + Select + Accordion

**Goal:** Prove the pattern generalizes to nested slot scanning and item factories.

**Deliverables:**
1. `Tabs` composed component (List, Trigger, Content) with variant-aware classes (default/line)
2. `Select` composed component (Trigger, Content, Item, Group, Separator) with chevron icon slot
3. `Accordion` composed component (Item, Trigger, Content)
4. Migrate `theme-shadcn` Tabs, Select, Accordion to `withStyles()`
5. Verify example apps

**Acceptance Criteria:**
```typescript
describe('Feature: Tabs composed primitive', () => {
  describe('Given Tabs with List containing Triggers and matching Content slots', () => {
    describe('When a trigger is clicked', () => {
      it('Then shows the matching content panel', () => {})
      it('Then applies ARIA selected to the active trigger', () => {})
    })
    describe('When arrow keys are pressed on triggers', () => {
      it('Then navigates between tabs', () => {})
    })
  })

  describe('Given withStyles(Tabs, classes)', () => {
    describe('When rendered', () => {
      it('Then applies list class to the tab list', () => {})
      it('Then applies trigger class to tab triggers', () => {})
      it('Then applies content class to tab panels', () => {})
    })
  })
})

describe('Feature: Select composed primitive', () => {
  describe('Given a Select with Items', () => {
    describe('When trigger is clicked', () => {
      it('Then opens the dropdown with listbox role', () => {})
    })
    describe('When an item is clicked', () => {
      it('Then selects the item and closes', () => {})
    })
    describe('When arrow keys are pressed', () => {
      it('Then navigates between items', () => {})
    })
  })
})
```

### Phase 3a: Overlay/Floating Primitives

**Goal:** Compose remaining overlay components.

**Deliverables:** Popover, Sheet (with variant-aware side classes), DropdownMenu, Tooltip, HoverCard, ContextMenu + theme migration for each.

### Phase 3b: Form Control Primitives

**Goal:** Compose form controls (smaller behavioral glue, diminishing returns but maintains consistency).

**Deliverables:** Checkbox, Switch, RadioGroup, Slider, Progress, Toggle, ToggleGroup + theme migration for each.

### Phase 3c: Remaining Composed Primitives

**Goal:** Complete coverage.

**Deliverables:** Toast, Command, Carousel, Calendar, DatePicker, NavigationMenu, Menubar, Collapsible, Drawer, ResizablePanel, ScrollArea + theme migration for each.

### Phase 4: Cleanup + Documentation

**Deliverables:**
1. Remove dead behavioral glue code from theme package
2. Update `packages/docs/` with composed primitive docs
3. Changeset
