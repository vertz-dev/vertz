# Design Doc: Refactor Composed Primitives from Slot Scanning to Context

## Problem

Composed primitives currently use a **parent-scans-children** pattern:

1. Sub-components (e.g., `Dialog.Trigger`, `Dialog.Content`) render `display: contents` wrappers with `data-slot` attributes
2. The root component (`ComposedDialogRoot`) calls `resolveChildren()` → `scanSlots()` to find these markers
3. The root extracts children from each marker and imperatively moves them into the headless primitive's DOM elements via `appendChild()`

This pattern has several problems:
- **Child reorganization** — the parent scans, inspects, and reorganizes children, violating the principle that components should render children in the order provided
- **Hydration fragility** — slot marker elements exist during rendering but not in the final DOM (children are extracted and moved), creating SSR/client structure mismatches
- **Imperative DOM manipulation** — `appendChild()` calls in composed roots go against the declarative JSX model
- **Opaque wiring** — the relationship between sub-components and the root is implicit (via `data-slot` string matching)

## API Surface

**No public API changes.** The developer-facing API remains identical:

```tsx
const { Dialog } = components.primitives;

// Before AND after — same usage
<Dialog>
  <Dialog.Trigger>
    <Button intent="primary">Open</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Title>Edit Profile</Dialog.Title>
    <Dialog.Description>Make changes here.</Dialog.Description>
    <Dialog.Footer>
      <Button intent="outline">Cancel</Button>
      <Button intent="primary">Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
```

The change is entirely internal to `@vertz/ui-primitives`.

**DOM structure note:** The rendered DOM nesting may differ slightly from the current output (e.g., wrapper elements in different positions). All wrappers use `display: contents` and are layout-transparent. CSS selectors targeting internal `data-slot` attributes or sibling relationships between trigger and content are not part of the public API and may change. Theme classes applied to overlay, content, title, etc. remain identical.

### Internal architecture change

**Before** — parent scans children:
```
Root
 ├─ resolveChildren(children)
 ├─ scanSlots(resolved) → Map<slotName, SlotEntry>
 ├─ Dialog.Root() → { trigger, content, overlay }
 ├─ extract user trigger from slot marker
 ├─ wire ARIA on user trigger
 ├─ forEach contentEntry.children → dialog.content.appendChild(child)
 └─ return <div style="display:contents">{trigger}{overlay}{content}</div>
```

**After** — sub-components self-wire via context:
```
Root
 ├─ Dialog.Root() → { trigger, content, overlay, state, show, hide }
 ├─ provide { dialog, classes } via context
 └─ return <Provider>{children}</Provider>

Trigger (reads context, resolves own children)
 ├─ resolveChildren(children) → find first HTMLElement
 ├─ wire ARIA + click handler on that element
 └─ return <span style="display:contents">{resolvedChildren}</span>

Content (reads context, populates primitive element)
 ├─ apply classes to dialog.content
 ├─ resolveChildren(children) → append each to dialog.content
 └─ return <span style="display:contents">{overlay}{dialog.content}</span>
```

**Key shift:** In the current pattern, the root calls `resolveChildren()` once on ALL children, and sub-components are inert markers. After the refactor, each sub-component independently resolves its own children within the context scope. Sub-components are no longer markers — they're real components with real behavior. The execution order of sub-components is now observable (DOM order), which is the desired behavior (render in order, don't reorganize).

### Trigger implementation sketch

The Trigger sub-component needs to extract the user's element (e.g., a `<Button>`) and wire ARIA on it. Here's how it works without scanSlots:

```tsx
function DialogTrigger({ children }: SlotProps) {
  const { dialog } = useDialogContext();

  // Resolve children to get actual DOM nodes
  const resolved = resolveChildren(children);
  const userTrigger = resolved.find(
    (n): n is HTMLElement => n instanceof HTMLElement,
  ) ?? null;

  if (userTrigger) {
    userTrigger.setAttribute('aria-haspopup', 'dialog');
    userTrigger.setAttribute('aria-controls', dialog.content.id);
    userTrigger.setAttribute('aria-expanded', 'false');
    userTrigger.setAttribute('data-state', 'closed');

    const handleClick = () => {
      dialog.state.open.peek() ? dialog.hide() : dialog.show();
    };
    userTrigger.addEventListener('click', handleClick);
    _tryOnCleanup(() => userTrigger.removeEventListener('click', handleClick));
  }

  // Return resolved children as-is — ARIA is already wired on the element
  return <span style="display: contents">{...resolved}</span>;
}
```

The `onOpenChange` callback in the root syncs `aria-expanded` and `data-state` on the trigger element, same as today. The root stores a reference to the user trigger element via a registration function on the context, or the Trigger sub-component registers itself.

### Content implementation sketch

```tsx
function DialogContent({ children, className }: SlotProps) {
  const { dialog, classes } = useDialogContext();

  // Apply theme + per-instance classes to primitive's content element
  const combined = [classes?.content, className].filter(Boolean).join(' ');
  if (combined) dialog.content.className = combined;
  if (classes?.overlay) dialog.overlay.className = classes.overlay;

  // Resolve and populate primitive's content element
  const resolved = resolveChildren(children);
  for (const node of resolved) {
    dialog.content.appendChild(node);
  }

  // Sync ARIA IDs on title/description that were rendered as children
  const titleEl = dialog.content.querySelector('[data-slot="dialog-title"]');
  if (titleEl) titleEl.id = dialog.title.id;
  const descEl = dialog.content.querySelector('[data-slot="dialog-description"]');
  if (descEl) descEl.id = dialog.description.id;

  // Return overlay + content — they appear where the developer placed <Content>
  return (
    <span style="display: contents">
      {dialog.overlay}
      {dialog.content}
    </span>
  );
}
```

**Note on `appendChild`:** The Content sub-component still uses `appendChild()` to populate the primitive's content element. This is an intentional pragmatic compromise — the headless primitive owns the `<div role="dialog">` element with all ARIA attributes, focus trapping, and keyboard handling. The composed layer populates it with user content. This is acceptable because it's wiring into a primitive-owned element, not creating arbitrary DOM structure. The alternative (re-implementing the primitive's element in JSX) would duplicate the headless layer's logic.

### Context shape per component

```ts
// Dialog / AlertDialog / Sheet share similar shape
// Merges the current DialogClassesContext into a single context
interface DialogContextValue {
  dialog: DialogElements & { state: DialogState };
  classes?: DialogClasses;
}

// Tooltip
interface TooltipContextValue {
  tooltip: TooltipElements;
  classes?: TooltipClasses;
}

// Popover
interface PopoverContextValue {
  popover: PopoverElements;
  classes?: PopoverClasses;
}

// Tabs — root-level context
interface TabsContextValue {
  tabs: TabsElements;
  classes?: TabsClasses;
}

// Accordion — root-level context
interface AccordionContextValue {
  accordion: AccordionElements;
  classes?: AccordionClasses;
}

// Accordion — item-level context (provided by Accordion.Item)
interface AccordionItemContextValue {
  trigger: HTMLElement;
  content: HTMLElement;
  value: string;
}

// Select / DropdownMenu — root-level context
interface SelectContextValue {
  select: SelectElements;
  classes?: SelectClasses;
}

// Select / DropdownMenu — group-level context (provided by Select.Group)
interface SelectGroupContextValue {
  groupFactory: GroupElements;
}

// DropdownMenu
interface MenuContextValue {
  menu: MenuElements;
  classes?: MenuClasses;
}
```

### withStyles class flow

`withStyles()` continues to work unchanged. The full flow:

```
withStyles(ComposedDialog, classes)
  → ComposedDialog({ ...props, classes })
    → DialogContext.Provider({ dialog, classes })
      → DialogTitle reads context.classes.title
      → DialogContent reads context.classes.content
      → DialogClose reads context.classes.close
```

### Context accessor pattern

Every component type gets a `use*Context()` accessor that throws on missing provider:

```ts
function useDialogContext(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(
      '<Dialog.Trigger> must be used inside <Dialog>. ' +
      'Ensure it is a direct or nested child of the Dialog root component.',
    );
  }
  return ctx;
}
```

This is a DX improvement over the current pattern, where sub-components used outside their parent silently render an inert `display: contents` span.

### Duplicate sub-component detection

A `claimed` boolean flag on the context value detects duplicate Content/Trigger sub-components in dev mode:

```ts
if (__DEV__ && ctx._contentClaimed) {
  console.warn('<Dialog.Content> rendered more than once inside <Dialog>. Only one is supported.');
}
ctx._contentClaimed = true;
```

This is a hard requirement, not optional. Without it, duplicate sub-components produce silent, broken behavior.

### HMR stable IDs

Per `.claude/rules/context-stable-ids.md`, every `createContext()` in `@vertz/ui-primitives` needs a manual `__stableId`. Each new context follows the existing convention:

```ts
const DialogContext = createContext<DialogContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::DialogContext',
);
```

The existing `DialogClassesContext` (stable ID: `@vertz/ui-primitives::DialogClassesContext`) will be removed when merged into the new `DialogContext`.

## Manifesto Alignment

### One way to do things (Principle 2)
This refactor removes a second way of composing children (slot scanning) in favor of the standard context pattern used throughout Vertz. Context-based communication between parent and child components is already established in the codebase (RouterContext, DialogStackContext, etc.).

### AI agents are first-class users (Principle 3)
Context-based wiring is more predictable for LLMs. Each sub-component is self-contained — you can read `DialogTrigger` and understand everything it does without also reading the root component's slot scanning logic.

### Explicit over implicit (Manifesto)
In the current pattern, the relationship between `data-slot="dialog-trigger"` in a sub-component and the `slots.get('dialog-trigger')` call in the root is implicit string matching. With context, the relationship is explicit: `useDialogContext()` returns a typed object.

## Non-Goals

- **Changing the public component API** — no breaking changes to how developers use Dialog, Tabs, etc.
- **Rewriting the headless primitives** — Dialog.Root, Tabs.Root, etc. stay as-is. They're imperative APIs that return DOM elements + state. The refactor only changes the composed layer that wraps them.
- **Converting all primitives at once** — this is a phased refactor. Components that don't use scanSlots (Checkbox, Switch, Toggle, Progress, Slider) are already fine.
- **Removing `withStyles()`** — this utility continues to work. It pre-binds `classes` into the root, which passes them via context to sub-components.
- **Removing `display: contents` wrappers** — sub-components continue to use `display: contents` wrappers. Removing them is a separate concern and would be a different, riskier change.
- **Removing `data-slot` from content elements** — sub-components like `DialogTitle` and `DialogClose` currently render `data-slot` attributes used for ARIA ID sync and event delegation. These can be removed incrementally as sub-components wire directly via context (e.g., Close calls `dialog.hide()` directly instead of relying on event delegation), but this cleanup happens within each phase, not as a separate effort.

## Unknowns

### 1. Context timing during resolveChildren

**Question:** When `resolveChildren(children)` is called inside a context Provider scope, do sub-components execute synchronously and read the context correctly?

**Resolution:** Already proven. The current codebase does exactly this — `DialogClassesContext.Provider(classes, () => { resolvedNodes = resolveChildren(children); })`. Sub-components like `DialogTitle` call `useContext(DialogClassesContext)` during this synchronous resolution and it works. The new pattern uses the same mechanism for the dialog primitive context.

### 2. DOM element ownership and cleanup

**Question:** When a sub-component (Content) returns `dialog.content` (an element created by the headless primitive), does cleanup work correctly?

**Resolution:** The headless primitive creates elements once. The composed sub-component returns them as part of its render tree. Since Vertz components run once (no re-renders), the element is created once, returned once, and cleaned up when the component tree unmounts via `_tryOnCleanup()`. Same lifecycle as the current pattern.

### 3. Tabs/Accordion: headless primitives auto-append elements

**Question:** The headless Tabs primitive's `Tab()` method appends trigger to `tabs.list` and panel to `tabs.root` as a side effect. If a `Tabs.Trigger` sub-component calls `Tab()` via context, the trigger is appended to `tabs.list` — the sub-component can't also return it in its own render tree (DOM element can only have one parent).

**Resolution:** For Tabs, Accordion, Select, and DropdownMenu, sub-components are **registration components** — they call primitive factory methods via context for their side effects but do NOT return the created elements. The root component returns the fully assembled primitive root (e.g., `tabs.root`) which already contains all registered triggers and panels. This means sub-components in these cases have a different internal contract than Dialog/Tooltip:

- **Dialog/Tooltip/Popover/Sheet pattern:** Sub-components return primitive-owned elements directly (Trigger returns the user's element, Content returns `dialog.content`).
- **Tabs/Accordion/Select/Menu pattern:** Sub-components register via context (calling `tabs.Tab(value)`, populating elements), and the root returns the assembled primitive root. Sub-components return a no-op `display: contents` span (or nothing visible).

This distinction is internal — the developer-facing JSX API is identical for both patterns. The sub-component's JSX tree determines registration order, which determines DOM order in the assembled root.

```tsx
// Tabs.Trigger — registration pattern
function TabsTrigger({ value, children, className }: TriggerProps) {
  const { tabs, classes } = useTabsContext();

  // Register with primitive — trigger is appended to tabs.list as side effect
  const { trigger, panel } = tabs.Tab(value);

  // Apply classes
  const combined = [classes?.trigger, className].filter(Boolean).join(' ');
  if (combined) trigger.className = combined;

  // Populate trigger content
  trigger.textContent = '';
  for (const node of resolveChildren(children)) {
    trigger.appendChild(node);
  }

  // Return nothing visible — the trigger lives in tabs.list
  return <span style="display: contents" />;
}
```

### 4. Select/DropdownMenu recursive group nesting

**Question:** `Select.Group` contains `Select.Item` children, and the group's factory creates items that belong to the group. How does context handle recursive nesting?

**Resolution:** Two-level context. The root provides `SelectContext` with the primitive. `Select.Group` provides `SelectGroupContext` with the group factory:

```
SelectRoot → SelectContext.Provider({ select, classes })
  Select.Content → reads SelectContext, returns select.content
  Select.Item → reads SelectContext, calls select.Item(value, label)
  Select.Group → reads SelectContext, calls select.Group(label) → groupFactory
    → SelectGroupContext.Provider({ groupFactory })
      Select.Item → reads SelectGroupContext (if available) or SelectContext
        → calls groupFactory.Item(value, label) or select.Item(value, label)
```

`Select.Item` checks for `SelectGroupContext` first (nearest ancestor). If found, it registers via the group factory. If not, it registers directly with the root. This mirrors the current `processContentSlots()` recursive behavior but with explicit context instead of recursive scanning.

## Type Flow Map

No new generics introduced. The context types are plain interfaces with no generic parameters. Type flow is straightforward:

```
ComposedDialogRoot
  ├─ Dialog.Root() → DialogElements & { state: DialogState }
  ├─ creates DialogContextValue (concrete type)
  ├─ DialogContext.Provider(value, () => children)
  │
  DialogTrigger
  │  └─ useDialogContext() → DialogContextValue
  │     └─ value.dialog.show/hide (typed methods)
  │     └─ value.dialog.content.id (typed string for aria-controls)
  │
  DialogContent
  │  └─ useDialogContext() → DialogContextValue
  │     └─ value.dialog.content (typed HTMLDivElement)
  │     └─ value.classes?.content (typed string | undefined)
  │
  DialogTitle
     └─ useDialogContext() → DialogContextValue
        └─ value.dialog.title.id (typed string for ARIA sync)
        └─ value.classes?.title (typed string | undefined)
```

## E2E Acceptance Test

Each refactored component must pass the same test suite as the current implementation. The existing composed component tests serve as the acceptance criteria. No new public behaviors are added — this is a pure internal refactor.

Additionally, every phase must include a test for the missing-context error:

```typescript
describe('Feature: Context-based composed Dialog', () => {
  describe('Given a Dialog with Trigger and Content', () => {
    describe('When the trigger is clicked', () => {
      it('Then the dialog content becomes visible', () => {});
      it('Then the trigger aria-expanded is "true"', () => {});
      it('Then the overlay is displayed', () => {});
    });

    describe('When Escape is pressed while dialog is open', () => {
      it('Then the dialog closes', () => {});
      it('Then the trigger aria-expanded is "false"', () => {});
    });

    describe('When a close button inside content is clicked', () => {
      it('Then the dialog closes', () => {});
    });
  });

  describe('Given a Dialog with themed classes', () => {
    describe('When rendered', () => {
      it('Then overlay has the theme overlay class', () => {});
      it('Then content has the theme content class', () => {});
      it('Then title has the theme title class', () => {});
      it('Then per-instance className is merged with theme class', () => {});
    });
  });

  describe('Given a Dialog used via withStyles()', () => {
    describe('When rendered', () => {
      it('Then classes are pre-bound and applied correctly', () => {});
      it('Then sub-components are accessible on the styled wrapper', () => {});
    });
  });

  describe('Given a Dialog.Trigger rendered outside Dialog', () => {
    describe('When the component mounts', () => {
      it('Then throws "Dialog.Trigger must be used inside Dialog"', () => {});
    });
  });

  describe('Given two Dialog.Content inside one Dialog', () => {
    describe('When the component mounts', () => {
      it('Then a dev-mode warning is logged', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: Tooltip + Popover (simplest — Trigger + Content only)

These are the thinnest composed components. Tooltip has no context at all currently. Popover has minimal wiring.

**Changes:**
- Add `TooltipContext` / `PopoverContext` with `createContext()` and `__stableId`
- Add `useTooltipContext()` / `usePopoverContext()` accessors that throw on missing provider
- Refactor `ComposedTooltipRoot` to create headless primitive and provide via context
- Refactor `TooltipTrigger` to read context, resolve own children, wire hover handlers
- Refactor `TooltipContent` to read context, resolve own children, append to primitive content, return it
- Same pattern for Popover (+ click handler on trigger, ARIA sync)
- Add duplicate sub-component detection via `claimed` flag
- Remove `scanSlots` imports from both

**Acceptance criteria:**
```typescript
describe('Given a composed Tooltip with context-based wiring', () => {
  describe('When hovering over the trigger', () => {
    it('Then the tooltip content appears', () => {});
  });
  describe('When rendered with withStyles classes', () => {
    it('Then content has the themed class', () => {});
  });
  describe('When Tooltip.Trigger is rendered outside Tooltip', () => {
    it('Then throws an error', () => {});
  });
});

describe('Given a composed Popover with context-based wiring', () => {
  describe('When the trigger is clicked', () => {
    it('Then the popover content becomes visible', () => {});
    it('Then the trigger has aria-expanded="true"', () => {});
  });
  describe('When Escape is pressed', () => {
    it('Then the popover closes', () => {});
  });
  describe('When rendered with withStyles classes', () => {
    it('Then content has the themed class', () => {});
  });
  describe('When Popover.Trigger is rendered outside Popover', () => {
    it('Then throws an error', () => {});
  });
});
```

### Phase 2: Dialog, AlertDialog, Sheet (Trigger + Content + sub-components)

These share the same structure. Dialog and AlertDialog differ in overlay-click and Escape behavior. Sheet adds the `side` prop.

**Changes:**
- Merge existing `DialogClassesContext` into new `DialogContext` (single context with both primitive and classes). Remove the old `@vertz/ui-primitives::DialogClassesContext` stable ID. All sub-components (Title, Description, Header, Footer, Close) change from `useContext(DialogClassesContext)` to reading `classes` from the unified `useDialogContext()`.
- Refactor root to provide context + render children as-is
- Refactor `DialogTrigger` to read context, resolve own children, wire ARIA + click handler (see implementation sketch above)
- Refactor `DialogContent` to read context, resolve own children, populate `dialog.content`, return overlay + content (see implementation sketch above)
- `DialogClose` wires `dialog.hide()` directly via context instead of relying on event delegation via `data-slot="dialog-close"` + root `handleContentClick`. The `data-slot="dialog-close"` attribute can be removed.
- `DialogTitle` sets its own `id` to `dialog.title.id` directly from context. No more `querySelector` needed.
- `DialogDescription` sets its own `id` to `dialog.description.id` directly from context.
- Same pattern for AlertDialog (Cancel calls `dialog.hide()`, Action calls `onAction()` + `dialog.hide()` via context)
- Same pattern for Sheet
- Add duplicate sub-component detection

**Acceptance criteria:**
- All existing dialog-composed tests pass (behavior unchanged)
- All existing alert-dialog-composed tests pass
- All existing sheet-composed tests pass
- `withStyles()` continues to work (classes pre-bound, sub-components accessible)
- Missing-context errors throw for all sub-components
- Duplicate Content/Trigger produces dev-mode warning

### Phase 3: RadioGroup, Tabs, Accordion (registration pattern)

These components share the "items register with parent" pattern. RadioGroup, Tabs, and Accordion all have child components that register with a parent context rather than rendering primitive-owned elements directly.

**Changes for RadioGroup:**
- Add `RadioGroupContext` with group state (selectedValue, items registry)
- Root creates state and provides via context
- `RadioGroup.Item` reads context, registers itself, builds radio button DOM
- Keyboard navigation wired in root via context

**Changes for Tabs (registration pattern):**
- `TabsContext` provides primitive + registration via `tabs.Tab(value)`
- `Tabs.List` reads context, wraps `tabs.list` element
- `Tabs.Trigger` reads context, calls `tabs.Tab(value)` to register, populates trigger content. Returns no-op span (trigger lives in `tabs.list` via primitive's auto-append).
- `Tabs.Content` reads context, populates panel content for its value. Returns no-op span (panel lives in `tabs.root` via primitive's auto-append).
- Root returns `tabs.root` which contains all registered triggers and panels
- Eliminates nested slot scanning (list → triggers)

**Nested context for Accordion:**
```
AccordionRoot → AccordionContext.Provider
  AccordionItem → AccordionItemContext.Provider
    AccordionTrigger → reads AccordionItemContext
    AccordionContent → reads AccordionItemContext
```

- `AccordionContext` provides primitive + registration
- `Accordion.Item` reads root context, creates item via primitive, provides item-level context
- `Accordion.Trigger` reads item context, populates item trigger
- `Accordion.Content` reads item context, populates item content

**Acceptance criteria:**
```typescript
describe('Given RadioGroup with context-based wiring', () => {
  describe('When an item is clicked', () => {
    it('Then selectedValue updates', () => {});
    it('Then aria-checked is set correctly', () => {});
  });
  describe('When arrow keys are pressed', () => {
    it('Then focus cycles through items', () => {});
  });
});

describe('Given Tabs with context-based wiring', () => {
  describe('When a tab trigger is clicked', () => {
    it('Then the corresponding panel is shown', () => {});
    it('Then the trigger has data-state="active"', () => {});
  });
  describe('When defaultValue is set', () => {
    it('Then the correct tab is initially selected', () => {});
  });
  describe('When arrow keys are pressed in the tab list', () => {
    it('Then focus moves between triggers', () => {});
  });
});

describe('Given Accordion with context-based wiring', () => {
  describe('When a trigger is clicked', () => {
    it('Then the item content expands', () => {});
  });
  describe('When another trigger is clicked', () => {
    it('Then the previous item collapses', () => {});
    it('Then the new item expands', () => {});
  });
});
```

### Phase 4: Select, DropdownMenu (recursive nesting)

Most complex. Groups can contain items recursively.

**Changes for Select:**
- `SelectContext` provides primitive + registration methods
- `Select.Content` reads context, returns `select.content`
- `Select.Item` checks for `SelectGroupContext` first (nearest ancestor). If found, registers via group factory. If not, registers directly with root primitive.
- `Select.Group` reads `SelectContext`, creates group via `select.Group(label)`, provides `SelectGroupContext` with group factory. Resolves own children inside nested provider scope.
- `Select.Separator` reads context, registers separator with primitive

**Dual-context pattern:**
```
SelectRoot → SelectContext.Provider({ select, classes })
  Select.Content → reads SelectContext
    Select.Item → reads SelectContext → select.Item(value, label)
    Select.Separator → reads SelectContext → adds separator
    Select.Group → reads SelectContext → select.Group(label) → groupFactory
      → SelectGroupContext.Provider({ groupFactory })
        Select.Item → reads SelectGroupContext → groupFactory.Item(value, label)
        Select.Separator → reads SelectGroupContext → adds group separator
```

**Same pattern for DropdownMenu** with `MenuContext` / `MenuGroupContext`.

**Acceptance criteria:**
```typescript
describe('Given Select with context-based wiring', () => {
  describe('When an item is clicked', () => {
    it('Then the selected value updates', () => {});
    it('Then the select displays the selected label', () => {});
  });
  describe('When items are inside a Group', () => {
    it('Then items register with the group factory', () => {});
    it('Then the group label is displayed', () => {});
  });
  describe('When groups contain nested items', () => {
    it('Then keyboard navigation traverses all items across groups', () => {});
  });
  describe('When a separator is between groups', () => {
    it('Then the separator renders between groups', () => {});
  });
});

describe('Given DropdownMenu with context-based wiring', () => {
  describe('When the trigger is clicked', () => {
    it('Then the menu opens', () => {});
  });
  describe('When a menu item is clicked', () => {
    it('Then the onSelect callback fires', () => {});
    it('Then the menu closes', () => {});
  });
  describe('When items are inside a Group', () => {
    it('Then items register with the group', () => {});
    it('Then the group label is displayed', () => {});
  });
});
```

### Phase 5: Cleanup

- Remove `scanSlots()` utility (`packages/ui-primitives/src/composed/scan-slots.ts`)
- Remove `scanSlots` tests
- Remove `resolveChildren` imports from root components that no longer call it directly (sub-component imports remain)
- Verify no other code depends on `scanSlots` (grep across the monorepo)
- Run full test suite including SSR tests to verify no hydration regressions

**Dependencies between phases:**
- Phases 1-4 are ordered by complexity but otherwise independent
- Phase 5 depends on all of 1-4 being complete
- Each phase can be reviewed and merged independently

## Risks

### Sub-component render order matters

In the current pattern, the root scans all children and processes them together. In the new pattern, sub-components execute in DOM order. If `Content` executes before `Trigger`, the content element exists in the DOM before the trigger, which matches the developer's JSX order — this is the desired behavior (render in order, don't reorganize).

However, for Dialog/Sheet/Popover, the overlay and content panel should appear after the trigger in the DOM. This is handled by having `Content` return the overlay + content elements, so they appear wherever the developer placed `<Dialog.Content>` in the tree.

### Context not available outside Provider

If a developer renders `<Dialog.Trigger>` outside of `<Dialog>`, `useDialogContext()` throws with a clear error message. This is standard practice (same as `useRouter()`) and a DX improvement over the current silent failure.

### withStyles compatibility

`withStyles()` copies sub-component properties from the composed primitive. Since sub-components are still plain functions attached to the root via `Object.assign`, `withStyles()` continues to work unchanged. The only difference is that sub-components now read context instead of being inert slot markers. The class flow is: `withStyles(Dialog, classes)` → `Dialog({ classes })` → `DialogContext.Provider({ dialog, classes })` → sub-components read `context.classes.*`.

### Two sub-component contracts

Dialog/Tooltip/Popover/Sheet sub-components return primitive-owned elements. Tabs/Accordion/Select/Menu sub-components register via context and return no-op spans (the root returns the assembled primitive). This is an internal distinction — the developer API is identical — but implementors and reviewers should be aware of the two patterns.
